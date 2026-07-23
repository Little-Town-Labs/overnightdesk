import type {
  DashboardAuthorizationCandidate,
  DashboardMembershipAuthorizer,
} from "@/lib/dashboard-authorization";

jest.mock("@/db", () => ({ db: {} }));

import {
  createDashboardAuthorizationStore,
  type DashboardAuthorizationCandidateReader,
} from "@/db/dashboard-authorization-store";

const useCaseId = "11111111-1111-4111-8111-111111111111";
const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";
const host = "titus-dashboard.overnightdesk.com";

const exactCandidate: DashboardAuthorizationCandidate = {
  instanceId: "dashboard-instance-1",
  ownerId: "owner-1",
  subdomain: host,
  status: "running",
  dashboardAuthStatus: "active",
  oidcClientId: "public-client-1",
  useCaseId,
  runtimeIdentityId,
};

describe("dashboard authorization store", () => {
  it("reads only the exact requested host and delegates canonical authority", async () => {
    const reader: DashboardAuthorizationCandidateReader = {
      findByExactHost: jest.fn().mockResolvedValue([exactCandidate]),
    };
    const membership: DashboardMembershipAuthorizer = {
      authorize: jest.fn().mockResolvedValue({
        authorized: true,
        role: "member",
        scope: "runtime",
      }),
    };
    const store = createDashboardAuthorizationStore({ reader, membership });

    await expect(
      store.authorize({ requestedHost: host, userId: "member-1" }),
    ).resolves.toMatchObject({
      authorized: true,
      authority: "canonical",
      instanceId: "dashboard-instance-1",
    });
    expect(reader.findByExactHost).toHaveBeenCalledTimes(1);
    expect(reader.findByExactHost).toHaveBeenCalledWith(host);
    expect(membership.authorize).toHaveBeenCalledWith({
      userId: "member-1",
      useCaseId,
      runtimeIdentityId,
    });
  });

  it("fails closed without leaking storage exceptions", async () => {
    const secret = "postgresql://user:password@private/database";
    const reader: DashboardAuthorizationCandidateReader = {
      findByExactHost: jest.fn().mockRejectedValue(new Error(secret)),
    };
    const membership: DashboardMembershipAuthorizer = {
      authorize: jest.fn(),
    };
    const audit = jest.fn().mockResolvedValue(undefined);
    const store = createDashboardAuthorizationStore({ reader, membership, audit });

    const decision = await store.authorize({
      requestedHost: host,
      userId: "member-1",
      requestId: "request-1",
    });

    expect(decision).toEqual({
      authorized: false,
      reason: "authorization_unavailable",
    });
    expect(JSON.stringify(decision)).not.toContain(secret);
    expect(membership.authorize).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith({
      category: "denied",
      reason: "authorization_unavailable",
      authority: "unknown",
      requestId: "request-1",
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(audit.mock.calls)).not.toContain(host);
    expect(JSON.stringify(audit.mock.calls)).not.toContain("member-1");
  });

  it("audits canonical membership denial with bounded metadata only", async () => {
    const reader: DashboardAuthorizationCandidateReader = {
      findByExactHost: jest.fn().mockResolvedValue([exactCandidate]),
    };
    const membership: DashboardMembershipAuthorizer = {
      authorize: jest.fn().mockResolvedValue({
        authorized: false,
        reason: "not_authorized",
      }),
    };
    const audit = jest.fn().mockResolvedValue(undefined);
    const store = createDashboardAuthorizationStore({ reader, membership, audit });

    await expect(
      store.authorize({
        requestedHost: host,
        userId: "member-1",
        requestId: "request-1",
      }),
    ).resolves.toEqual({ authorized: false, reason: "not_authorized" });
    expect(audit).toHaveBeenCalledWith({
      category: "denied",
      reason: "not_authorized",
      authority: "canonical",
      instanceId: "dashboard-instance-1",
      requestId: "request-1",
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain(host);
    expect(JSON.stringify(audit.mock.calls)).not.toContain("member-1");
  });
});
