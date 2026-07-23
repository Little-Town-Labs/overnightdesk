import {
  authorizeDashboardAccess,
  type DashboardAuthorizationCandidate,
  type DashboardMembershipAuthorizer,
} from "@/lib/dashboard-authorization";

const useCaseId = "11111111-1111-4111-8111-111111111111";
const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";
const host = "titus-dashboard.overnightdesk.com";

function candidate(
  overrides: Partial<DashboardAuthorizationCandidate> = {},
): DashboardAuthorizationCandidate {
  return {
    instanceId: "dashboard-instance-1",
    ownerId: "owner-1",
    subdomain: host,
    status: "running",
    dashboardAuthStatus: "active",
    oidcClientId: "public-client-1",
    useCaseId,
    runtimeIdentityId,
    ...overrides,
  };
}

function membership(
  decision: Awaited<ReturnType<DashboardMembershipAuthorizer["authorize"]>> = {
    authorized: true,
    role: "member",
    scope: "runtime",
  },
): DashboardMembershipAuthorizer {
  return {
    authorize: jest.fn().mockResolvedValue(decision),
  };
}

describe("native dashboard authorization", () => {
  it("authorizes current canonical membership for the exact host and runtime", async () => {
    const authorizer = membership();

    await expect(
      authorizeDashboardAccess(
        {
          requestedHost: host,
          userId: "member-1",
          candidates: [candidate()],
        },
        authorizer,
      ),
    ).resolves.toEqual({
      authorized: true,
      authority: "canonical",
      instanceId: "dashboard-instance-1",
      role: "member",
      scope: "runtime",
    });
    expect(authorizer.authorize).toHaveBeenCalledWith({
      userId: "member-1",
      useCaseId,
      runtimeIdentityId,
    });
  });

  it("permits use-case-wide canonical membership for the exact runtime assignment", async () => {
    await expect(
      authorizeDashboardAccess(
        {
          requestedHost: host,
          userId: "operator-1",
          candidates: [candidate()],
        },
        membership({
          authorized: true,
          role: "operator",
          scope: "use_case",
        }),
      ),
    ).resolves.toMatchObject({
      authorized: true,
      authority: "canonical",
      role: "operator",
      scope: "use_case",
    });
  });

  it("uses exact legacy owner compatibility only when canonical linkage is absent", async () => {
    const authorizer = membership();
    const legacy = candidate({
      useCaseId: null,
      runtimeIdentityId: null,
    });

    await expect(
      authorizeDashboardAccess(
        {
          requestedHost: host,
          userId: "owner-1",
          candidates: [legacy],
        },
        authorizer,
      ),
    ).resolves.toEqual({
      authorized: true,
      authority: "legacy_owner",
      instanceId: "dashboard-instance-1",
      role: "owner",
      scope: "instance",
    });
    expect(authorizer.authorize).not.toHaveBeenCalled();

    await expect(
      authorizeDashboardAccess(
        {
          requestedHost: host,
          userId: "other-user",
          candidates: [legacy],
        },
        authorizer,
      ),
    ).resolves.toEqual({ authorized: false, reason: "not_authorized" });
  });

  it.each([
    ["missing host", "", [candidate()]],
    ["uppercase host", "TITUS-DASHBOARD.overnightdesk.com", [candidate()]],
    ["external host", "dashboard.example.com", [candidate()]],
    ["wrong exact host", "walter-dashboard.overnightdesk.com", [candidate()]],
    ["missing candidate", host, []],
    ["duplicate candidate", host, [candidate(), candidate({ instanceId: "dashboard-instance-2" })]],
  ])("fails closed for %s", async (_label, requestedHost, candidates) => {
    await expect(
      authorizeDashboardAccess(
        { requestedHost, userId: "member-1", candidates },
        membership(),
      ),
    ).resolves.toEqual({
      authorized: false,
      reason: candidates.length > 1 ? "authorization_unavailable" : "not_authorized",
    });
  });

  it.each([
    ["stopped instance", { status: "stopped" }],
    ["pending dashboard auth", { dashboardAuthStatus: "pending" }],
    ["missing OIDC client", { oidcClientId: null }],
  ])("denies an inactive %s", async (_label, overrides) => {
    await expect(
      authorizeDashboardAccess(
        {
          requestedHost: host,
          userId: "member-1",
          candidates: [candidate(overrides)],
        },
        membership(),
      ),
    ).resolves.toEqual({ authorized: false, reason: "not_authorized" });
  });

  it.each([
    { useCaseId, runtimeIdentityId: null },
    { useCaseId: null, runtimeIdentityId },
  ])("rejects partial canonical linkage", async (overrides) => {
    await expect(
      authorizeDashboardAccess(
        {
          requestedHost: host,
          userId: "owner-1",
          candidates: [candidate(overrides)],
        },
        membership(),
      ),
    ).resolves.toEqual({
      authorized: false,
      reason: "authorization_unavailable",
    });
  });

  it.each([
    { authorized: false as const, reason: "not_authorized" as const },
    {
      authorized: false as const,
      reason: "authorization_unavailable" as const,
    },
  ])("propagates bounded membership denial %#", async (denial) => {
    await expect(
      authorizeDashboardAccess(
        {
          requestedHost: host,
          userId: "member-1",
          candidates: [candidate()],
        },
        membership(denial),
      ),
    ).resolves.toEqual(denial);
  });

  it("returns value-free denial even when the membership boundary throws", async () => {
    const secret = "never-echo-this-cookie-or-token";
    const authorizer: DashboardMembershipAuthorizer = {
      authorize: jest.fn().mockRejectedValue(new Error(secret)),
    };

    const decision = await authorizeDashboardAccess(
      {
        requestedHost: host,
        userId: "member-1",
        candidates: [candidate()],
      },
      authorizer,
    );

    expect(decision).toEqual({
      authorized: false,
      reason: "authorization_unavailable",
    });
    expect(JSON.stringify(decision)).not.toContain(secret);
    expect(JSON.stringify(decision)).not.toContain(host);
    expect(JSON.stringify(decision)).not.toContain("member-1");
  });
});
