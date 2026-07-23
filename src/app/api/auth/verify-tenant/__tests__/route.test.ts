import { NextRequest } from "next/server";

const mockGetSession = jest.fn();
const mockAuthorize = jest.fn();

jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));
jest.mock("@/db/dashboard-authorization-store", () => ({
  dashboardAuthorizationStore: {
    authorize: (...args: unknown[]) => mockAuthorize(...args),
  },
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
    mockGetSession.mockResolvedValue({ user: { id: "member-1" } });
    mockAuthorize.mockResolvedValue({
      authorized: true,
      authority: "canonical",
      instanceId: "instance-1",
      role: "member",
      scope: "runtime",
    });
  });

  it("allows current canonical membership for the exact normalized host", async () => {
    const response = await GET(request("titus-dashboard.overnightdesk.com"));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("");
    expect(mockAuthorize).toHaveBeenCalledWith({
      requestedHost: "titus-dashboard.overnightdesk.com",
      userId: "member-1",
    });
  });

  it.each([
    ["non-member", "not_authorized"],
    ["suspended member", "not_authorized"],
    ["revoked member", "not_authorized"],
    ["expired member", "not_authorized"],
    ["partial canonical link", "authorization_unavailable"],
  ])("denies a %s with an empty response", async (_state, reason) => {
    mockAuthorize.mockResolvedValue({ authorized: false, reason });

    const response = await GET(request("titus-dashboard.overnightdesk.com"));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("");
  });

  it.each([
    undefined,
    "TITUS-DASHBOARD.overnightdesk.com",
    "titus-dashboard.overnightdesk.com.evil.example",
    "external.example",
  ])("denies missing or invalid host %s without calling authority", async (host) => {
    const response = await GET(request(host));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("");
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it("preserves exact legacy-owner compatibility through the shared store", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: true,
      authority: "legacy_owner",
      instanceId: "instance-legacy",
      role: "owner",
      scope: "instance",
    });

    await expect(
      GET(request("aegis-prod.overnightdesk.com")),
    ).resolves.toMatchObject({ status: 200 });
  });

  it("fails closed on missing sessions and authority-store failures", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    await expect(
      GET(request("titus-dashboard.overnightdesk.com")),
    ).resolves.toMatchObject({ status: 401 });
    expect(mockAuthorize).not.toHaveBeenCalled();

    mockAuthorize.mockRejectedValueOnce(new Error("sensitive database text"));
    const response = await GET(request("titus-dashboard.overnightdesk.com"));
    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("");
  });
});
