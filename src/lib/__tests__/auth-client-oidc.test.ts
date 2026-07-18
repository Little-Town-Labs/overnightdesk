jest.mock("better-auth/react", () => ({
  createAuthClient: jest.fn(() => ({
    signIn: {},
    signUp: {},
    signOut: jest.fn(),
    useSession: jest.fn(),
  })),
}));

jest.mock("@better-auth/oauth-provider/client", () => ({
  oauthProviderClient: jest.fn(() => ({
    id: "oauth-provider-client",
    fetchPlugins: [
      {
        id: "oauth-provider-signin",
        hooks: {
          onRequest: async (context: { body: string; method: string }) => {
            if (context.method === "GET" || context.method === "DELETE") return;
            const body = JSON.parse(context.body) as Record<string, string>;
            context.body = JSON.stringify({
              ...body,
              oauth_query: globalThis.window.location.search.slice(1),
            });
          },
        },
      },
    ],
  })),
}));

import { authClientPlugins } from "@/lib/auth-client";

describe("Hermes OIDC auth client continuation", () => {
  it("installs the OAuth provider client plugin", () => {
    expect(authClientPlugins.map((plugin) => plugin.id)).toContain(
      "oauth-provider-client"
    );
  });

  it("forwards only the signed OAuth query during email/password sign-in", async () => {
    const plugin = authClientPlugins.find(
      (candidate) => candidate.id === "oauth-provider-client"
    );
    const onRequest = plugin?.fetchPlugins?.[0]?.hooks.onRequest;
    expect(onRequest).toBeDefined();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          search:
            "?client_id=hermes-test&redirect_uri=https%3A%2F%2Ftenant.overnightdesk.com%2Fauth%2Fcallback&exp=1784358600&iat=1784358000&sig=signed-value",
        },
      },
    });

    const context = {
      body: JSON.stringify({
        email: "owner@example.com",
        password: "not-a-real-password",
      }),
      headers: new Headers({ "content-type": "application/json" }),
      method: "POST",
    };

    await onRequest?.(context as never);

    const forwarded = JSON.parse(context.body) as Record<string, string>;
    expect(forwarded.oauth_query).toContain("client_id=hermes-test");
    expect(forwarded.oauth_query).toContain("sig=signed-value");
    expect(forwarded.oauth_query).not.toContain("password");

    Reflect.deleteProperty(globalThis, "window");
  });
});
