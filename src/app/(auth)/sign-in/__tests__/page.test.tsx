jest.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: jest.fn() } },
}));
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => children,
}));

import { getSafeSignInCallbackUrl } from "@/lib/sign-in";

function runOAuthClientContinuationHook(
  search: string,
  body: Record<string, string>
): Record<string, string> {
  if (body.oauth_query) return body;
  const params = new URLSearchParams(search);
  const signedNames = params.getAll("ba_param");
  if (!params.has("sig") || signedNames.length === 0) return body;
  const allowed = new Set([...signedNames, "sig", "ba_param"]);
  const signed = new URLSearchParams();
  for (const [key, value] of params) {
    if (allowed.has(key)) signed.append(key, value);
  }
  return { ...body, oauth_query: signed.toString() };
}

describe("email/password OIDC continuation", () => {
  it("forwards the signed authorization query after unauthenticated sign-in", () => {
    const body = runOAuthClientContinuationHook(
      "?client_id=public-client-id&ba_iat=1784358000000&sig=signed&ba_param=ba_iat&ba_param=ba_param&ba_param=client_id",
      { email: "owner@example.com", password: "secret" }
    );
    expect(body.oauth_query).toContain("client_id=public-client-id");
    expect(body.oauth_query).toContain("sig=signed");
    expect(body.oauth_query).not.toContain("password");
  });

  it("preserves an already supplied continuation for an authenticated flow", () => {
    expect(
      runOAuthClientContinuationHook("?unsigned=ignored", {
        oauth_query: "server-signed-continuation",
      })
    ).toEqual({
      oauth_query: "server-signed-continuation",
    });
  });

  it("forwards an expired signed query unchanged for server-side rejection", () => {
    const body = runOAuthClientContinuationHook(
      "?client_id=public-client-id&ba_iat=1&exp=1&sig=expired&ba_param=ba_iat&ba_param=ba_param&ba_param=client_id&ba_param=exp",
      { email: "owner@example.com", password: "secret" }
    );
    expect(body.oauth_query).toContain("exp=1");
    expect(body.oauth_query).toContain("sig=expired");
  });
});

describe("sign-in callback safety", () => {
  it("allows only same-origin relative destinations", () => {
    expect(getSafeSignInCallbackUrl("/dashboard/settings?tab=auth")).toBe(
      "/dashboard/settings?tab=auth"
    );
    expect(getSafeSignInCallbackUrl("https://evil.example/callback")).toBe(
      "/dashboard"
    );
    expect(getSafeSignInCallbackUrl("//evil.example/callback")).toBe(
      "/dashboard"
    );
  });
});
