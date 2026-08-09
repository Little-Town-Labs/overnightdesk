const mockIdentityCreation = jest.fn();
const mockBetterAuthPost = jest.fn(async (request: Request) => {
  const pathname = new URL(request.url).pathname;

  if (pathname === "/api/auth/sign-up/email") {
    mockIdentityCreation();
    return Response.json({ created: true }, { status: 201 });
  }
  if (pathname === "/api/auth/sign-in/email") {
    return Response.json({ flow: "sign-in" }, { status: 200 });
  }
  if (pathname === "/api/auth/request-password-reset") {
    return Response.json({ flow: "request-password-reset" }, { status: 202 });
  }
  if (pathname === "/api/auth/reset-password") {
    return Response.json({ flow: "reset-password" }, { status: 200 });
  }

  return new Response(null, { status: 404 });
});

jest.mock("@/lib/auth", () => ({ auth: { api: {} } }));
jest.mock("better-auth/next-js", () => ({
  toNextJsHandler: jest.fn(() => ({
    GET: jest.fn(),
    POST: (request: Request) => mockBetterAuthPost(request),
    PATCH: jest.fn(),
    PUT: jest.fn(),
    DELETE: jest.fn(),
  })),
}));
jest.mock("@/lib/hermes-oidc-audit", () => ({
  withHermesJwksFailureAudit: jest.fn(),
}));

import { POST } from "@/app/api/auth/[...all]/route";

describe("registration retirement at the auth server boundary", () => {
  beforeEach(() => {
    mockBetterAuthPost.mockClear();
    mockIdentityCreation.mockClear();
  });

  it("returns an empty 404 before direct email signup can create identity state", async () => {
    const response = await POST(
      new Request("https://overnightdesk.com/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new-user@example.com",
          name: "New User",
          password: "not-a-real-password",
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mockBetterAuthPost).not.toHaveBeenCalled();
    expect(mockIdentityCreation).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/auth/sign-in/email", 200, "sign-in"],
    ["/api/auth/request-password-reset", 202, "request-password-reset"],
    ["/api/auth/reset-password", 200, "reset-password"],
  ])(
    "continues dispatching the retained %s flow",
    async (pathname, expectedStatus, expectedFlow) => {
      const request = new Request(`https://overnightdesk.com${pathname}`, {
        method: "POST",
      });

      const response = await POST(request);

      expect(response.status).toBe(expectedStatus);
      expect(await response.json()).toEqual({ flow: expectedFlow });
      expect(mockBetterAuthPost).toHaveBeenCalledWith(request);
      expect(mockIdentityCreation).not.toHaveBeenCalled();
    },
  );
});
