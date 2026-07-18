import { NextRequest } from "next/server";

const mockGetSession = jest.fn();
const mockGetInstanceForUser = jest.fn();
const mockRecordAuditEvent = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));
jest.mock("@/lib/instance", () => ({
  getInstanceForUser: (...args: unknown[]) => mockGetInstanceForUser(...args),
}));
jest.mock("@/lib/hermes-oidc-audit", () => ({
  recordHermesOidcAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
}));

import { GET } from "@/app/api/auth/verify-tenant/route";

function request(host?: string) {
  const headers = new Headers({ cookie: "session=opaque" });
  if (host) headers.set("x-original-host", host);
  return new NextRequest("https://www.overnightdesk.com/api/auth/verify-tenant", {
    headers,
  });
}

describe("GET /api/auth/verify-tenant", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: "owner-1" } });
    mockGetInstanceForUser.mockResolvedValue({
      id: "instance-1",
      userId: "owner-1",
      status: "running",
      subdomain: "tenant-a.overnightdesk.com",
    });
  });

  it("allows only the exact linked tenant host", async () => {
    await expect(GET(request("tenant-a.overnightdesk.com"))).resolves.toMatchObject({
      status: 200,
    });
  });

  it.each([
    "tenant-b.overnightdesk.com",
    "tenant-a.overnightdesk.com.evil.example",
    "TENANT-A.overnightdesk.com",
  ])("denies copied or altered host %s", async (host) => {
    await expect(GET(request(host))).resolves.toMatchObject({ status: 401 });
    expect(mockRecordAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: "denied",
        reason: "tenant_mismatch",
        instanceId: "instance-1",
      })
    );
  });

  it("denies a missing host, session, or running instance", async () => {
    await expect(GET(request())).resolves.toMatchObject({ status: 401 });

    mockGetSession.mockResolvedValueOnce(null);
    await expect(GET(request("tenant-a.overnightdesk.com"))).resolves.toMatchObject({
      status: 401,
    });

    mockGetInstanceForUser.mockResolvedValueOnce({
      userId: "owner-1",
      status: "stopped",
      subdomain: "tenant-a.overnightdesk.com",
    });
    await expect(GET(request("tenant-a.overnightdesk.com"))).resolves.toMatchObject({
      status: 401,
    });
  });
});
