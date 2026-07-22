import {
  planPlatformInstanceLink,
  type PlatformInstanceLinkSnapshot,
} from "@/lib/platform-instance-link";

const useCaseId = "11111111-1111-4111-8111-111111111111";
const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";

function snapshot(
  overrides: Partial<PlatformInstanceLinkSnapshot> = {},
): PlatformInstanceLinkSnapshot {
  return {
    schemaReady: true,
    identities: [{ useCaseId, runtimeIdentityId }],
    memberships: [
      {
        useCaseId,
        userId: "owner-1",
        role: "owner",
        status: "active",
        runtimeIdentityId,
        expiresAt: null,
        suspendedAt: null,
        revokedAt: null,
      },
    ],
    instances: [
      {
        id: "instance-1",
        userId: "owner-1",
        tenantId: "tenant-0",
        useCaseId: null,
        runtimeIdentityId: null,
        status: "running",
        subdomain: "aegis-prod.overnightdesk.com",
        hermesOidcClientId: "client-1",
        hermesDashboardAuthStatus: "active",
      },
    ],
    platformBindings: [
      {
        useCaseId,
        runtimeIdentityId,
        provider: "overnightdesk",
        kind: "platform_instance",
        value: "tenant-0",
        state: "compatibility",
      },
    ],
    ...overrides,
  };
}

describe("platform instance link planning", () => {
  it("plans one guarded link from an unlinked instance", () => {
    expect(
      planPlatformInstanceLink(snapshot(), {
        tenantId: "tenant-0",
        now: new Date("2026-07-22T19:30:00Z"),
      }),
    ).toEqual({
      status: "ready",
      instanceId: "instance-1",
      ownerId: "owner-1",
      tenantId: "tenant-0",
      useCaseId,
      runtimeIdentityId,
    });
  });

  it("is an idempotent verified no-op after exact linkage", () => {
    const linked = snapshot();
    linked.instances[0] = {
      ...linked.instances[0],
      useCaseId,
      runtimeIdentityId,
    };

    expect(
      planPlatformInstanceLink(linked, {
        tenantId: "tenant-0",
        now: new Date("2026-07-22T19:30:00Z"),
      }),
    ).toEqual({
      status: "verified_noop",
      instanceId: "instance-1",
      useCaseId,
      runtimeIdentityId,
    });
  });

  it.each([
    ["missing schema", { schemaReady: false }],
    ["ambiguous identity", { identities: [] }],
    ["ambiguous owner", { memberships: [] }],
    ["missing selector binding", { platformBindings: [] }],
    ["ambiguous instance", { instances: [] }],
  ])("fails closed for %s", (_label, overrides) => {
    expect(
      planPlatformInstanceLink(snapshot(overrides), {
        tenantId: "tenant-0",
        now: new Date("2026-07-22T19:30:00Z"),
      }).status,
    ).toBe("blocked");
  });

  it("rejects expired, suspended, revoked, and broad non-owner membership", () => {
    for (const membership of [
      { expiresAt: new Date("2026-07-22T19:29:59Z") },
      { suspendedAt: new Date("2026-07-22T19:00:00Z") },
      { revokedAt: new Date("2026-07-22T19:00:00Z") },
      { role: "member" as const },
    ]) {
      const candidate = snapshot();
      candidate.memberships[0] = {
        ...candidate.memberships[0],
        ...membership,
      };
      expect(
        planPlatformInstanceLink(candidate, {
          tenantId: "tenant-0",
          now: new Date("2026-07-22T19:30:00Z"),
        }).status,
      ).toBe("blocked");
    }
  });

  it("rejects wrong owner, unsafe dashboard state, and conflicting links", () => {
    for (const instance of [
      { userId: "other-owner" },
      { status: "stopped" },
      { subdomain: "not-overnightdesk.example" },
      { hermesOidcClientId: null },
      { hermesDashboardAuthStatus: "pending" },
      { useCaseId, runtimeIdentityId: null },
      {
        useCaseId: "33333333-3333-4333-8333-333333333333",
        runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
      },
    ]) {
      const candidate = snapshot();
      candidate.instances[0] = {
        ...candidate.instances[0],
        ...instance,
      };
      expect(
        planPlatformInstanceLink(candidate, {
          tenantId: "tenant-0",
          now: new Date("2026-07-22T19:30:00Z"),
        }).status,
      ).toBe("blocked");
    }
  });

  it("rejects a selector owned by another runtime", () => {
    const candidate = snapshot();
    candidate.platformBindings[0] = {
      ...candidate.platformBindings[0],
      runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
    };
    expect(
      planPlatformInstanceLink(candidate, {
        tenantId: "tenant-0",
        now: new Date("2026-07-22T19:30:00Z"),
      }).status,
    ).toBe("blocked");
  });
});
