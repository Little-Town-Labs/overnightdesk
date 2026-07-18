import { NextRequest } from "next/server";

const mockGetSession = jest.fn();
const mockSelectWhereLimit = jest.fn();
const mockEnsure = jest.fn();
const mockRecover = jest.fn();
const mockActivate = jest.fn();
const mockDisable = jest.fn();
const mockMarkError = jest.fn();
const mockConfigure = jest.fn();

jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));
jest.mock("@/lib/billing", () => ({ isAdmin: (email: string) => email === "admin@test.com" }));
jest.mock("@/lib/config", () => ({ getAppUrl: () => "https://www.overnightdesk.com" }));
jest.mock("@/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({ limit: mockSelectWhereLimit })),
      })),
    })),
  },
}));
jest.mock("@/db/schema", () => ({ instance: { tenantId: "tenantId" } }));
jest.mock("@/lib/hermes-oidc", () => ({
  ensureHermesOidcClient: (...args: unknown[]) => mockEnsure(...args),
  recoverHermesOidcClient: (...args: unknown[]) => mockRecover(...args),
  activateHermesOidcClient: (...args: unknown[]) => mockActivate(...args),
  disableHermesOidcClient: (...args: unknown[]) => mockDisable(...args),
  markHermesOidcClientError: (...args: unknown[]) => mockMarkError(...args),
  buildHermesDashboardAuthConfig: ({ clientId, subdomain }: { clientId: string; subdomain: string }) => ({
    provider: "self-hosted",
    issuer: "https://www.overnightdesk.com/api/auth",
    clientId,
    publicUrl: `https://${subdomain}`,
    callbackUrl: `https://${subdomain}/auth/callback`,
    scopes: ["openid", "profile", "email"],
  }),
}));
jest.mock("@/lib/provisioner", () => ({
  provisionerClient: { configureDashboardAuth: (...args: unknown[]) => mockConfigure(...args) },
}));

import { POST } from "@/app/api/admin/hermes/dashboard-auth/route";

const target = {
  id: "instance-1",
  userId: "owner-1",
  tenantId: "hermes-agent",
  subdomain: "hermes-agent.overnightdesk.com",
};

function request(action: "configure" | "disable") {
  return new NextRequest("https://www.overnightdesk.com/api/admin/hermes/dashboard-auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenantId: "hermes-agent", action }),
  });
}

describe("POST /api/admin/hermes/dashboard-auth", () => {
  const originalAllowlist = process.env.HERMES_DASHBOARD_OIDC_CANARY_TENANT_IDS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HERMES_DASHBOARD_OIDC_ENABLED = "false";
    process.env.HERMES_DASHBOARD_OIDC_CANARY_TENANT_IDS = "hermes-agent";
    mockGetSession.mockResolvedValue({ user: { email: "admin@test.com" } });
    mockSelectWhereLimit.mockResolvedValue([target]);
    mockEnsure.mockResolvedValue({ clientId: "public-client-id", created: true });
    mockRecover.mockResolvedValue(undefined);
    mockConfigure.mockResolvedValue({ success: true });
    mockActivate.mockResolvedValue(undefined);
    mockDisable.mockResolvedValue(undefined);
    mockMarkError.mockResolvedValue(undefined);
  });

  afterAll(() => {
    delete process.env.HERMES_DASHBOARD_OIDC_ENABLED;
    if (originalAllowlist === undefined) {
      delete process.env.HERMES_DASHBOARD_OIDC_CANARY_TENANT_IDS;
    } else {
      process.env.HERMES_DASHBOARD_OIDC_CANARY_TENANT_IDS = originalAllowlist;
    }
  });

  it("denies non-admin callers", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { email: "customer@test.com" } });
    await expect(POST(request("configure"))).resolves.toMatchObject({ status: 401 });
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("denies a tenant outside the explicit canary allowlist", async () => {
    process.env.HERMES_DASHBOARD_OIDC_CANARY_TENANT_IDS = "other-tenant";
    await expect(POST(request("configure"))).resolves.toMatchObject({ status: 403 });
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("configures then activates an approved existing tenant", async () => {
    const response = await POST(request("configure"));
    expect(response.status).toBe(200);
    expect(mockConfigure).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "hermes-agent",
      restart: true,
    }));
    expect(mockConfigure.mock.invocationCallOrder[0]).toBeLessThan(
      mockActivate.mock.invocationCallOrder[0]
    );
  });

  it("marks the client errored and does not activate after configuration failure", async () => {
    mockConfigure.mockResolvedValueOnce({ success: false, error: "safe failure" });
    const response = await POST(request("configure"));
    expect(response.status).toBe(503);
    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockMarkError).toHaveBeenCalled();
  });

  it("allows an admin to disable a linked tenant without enabling rollout", async () => {
    const response = await POST(request("disable"));
    expect(response.status).toBe(200);
    expect(mockDisable).toHaveBeenCalledWith({
      instanceId: "instance-1",
      ownerId: "owner-1",
      subdomain: "hermes-agent.overnightdesk.com",
    });
  });

  it("returns a generic failure when disablement cannot be verified", async () => {
    mockDisable.mockRejectedValueOnce(new Error("sensitive storage detail"));
    const response = await POST(request("disable"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      error: "Dashboard authentication is unavailable",
    });
  });
});
