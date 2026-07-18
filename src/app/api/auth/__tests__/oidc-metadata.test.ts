const openIdResponse = new Response(
  JSON.stringify({ issuer: "https://www.overnightdesk.com/api/auth" }),
  { headers: { "content-type": "application/json" } }
);
const authServerResponse = new Response(
  JSON.stringify({ issuer: "https://www.overnightdesk.com/api/auth" }),
  { headers: { "content-type": "application/json" } }
);

const mockOpenIdHandler = jest.fn(async () => openIdResponse.clone());
const mockAuthServerHandler = jest.fn(async () => authServerResponse.clone());
const mockOpenIdFactory = jest.fn((_auth: unknown) => mockOpenIdHandler);
const mockAuthServerFactory = jest.fn((_auth: unknown) => mockAuthServerHandler);

jest.mock("@/lib/auth", () => ({ auth: { api: {} } }));
jest.mock("@better-auth/oauth-provider", () => ({
  oauthProviderOpenIdConfigMetadata: (...args: unknown[]) =>
    mockOpenIdFactory(args[0]),
  oauthProviderAuthServerMetadata: (...args: unknown[]) =>
    mockAuthServerFactory(args[0]),
}));

import { GET as getOpenIdMetadata } from "@/app/api/auth/.well-known/openid-configuration/route";
import { GET as getAuthServerMetadata } from "@/app/.well-known/oauth-authorization-server/api/auth/route";

describe("OIDC metadata routes", () => {
  it("publishes OpenID configuration under the issuer path", async () => {
    const request = new Request(
      "https://www.overnightdesk.com/api/auth/.well-known/openid-configuration"
    );

    const response = await getOpenIdMetadata(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      issuer: "https://www.overnightdesk.com/api/auth",
    });
    expect(mockOpenIdFactory).toHaveBeenCalledTimes(1);
  });

  it("publishes OAuth authorization metadata at the RFC 8414 root path", async () => {
    const request = new Request(
      "https://www.overnightdesk.com/.well-known/oauth-authorization-server/api/auth"
    );

    const response = await getAuthServerMetadata(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      issuer: "https://www.overnightdesk.com/api/auth",
    });
    expect(mockAuthServerFactory).toHaveBeenCalledTimes(1);
  });
});
