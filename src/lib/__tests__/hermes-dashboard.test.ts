import {
  getHermesDashboardUnavailableMessage,
  getHermesDashboardUrl,
} from "@/lib/hermes-dashboard";

describe("getHermesDashboardUrl", () => {
  it("returns the tenant root only for an active linked OIDC client", () => {
    expect(
      getHermesDashboardUrl("tenant-a.overnightdesk.com", {
        authStatus: "active",
        clientId: "public-client-id",
      })
    ).toBe("https://tenant-a.overnightdesk.com");
  });

  it("keeps the protected login fallback for legacy tenants", () => {
    expect(
      getHermesDashboardUrl("tenant-a.overnightdesk.com", {
        authStatus: "legacy",
        clientId: null,
      })
    ).toBe("https://tenant-a.overnightdesk.com/login");
  });

  it.each([
    { authStatus: "pending" as const, clientId: "public-client-id" },
    { authStatus: "active" as const, clientId: null },
    { authStatus: "disabled" as const, clientId: "public-client-id" },
    { authStatus: "error" as const, clientId: "public-client-id" },
  ])("does not produce an unsafe launch for $authStatus", (linkage) => {
    expect(getHermesDashboardUrl("tenant-a.overnightdesk.com", linkage)).toBeNull();
  });

  it("provides safe customer recovery states", () => {
    expect(getHermesDashboardUnavailableMessage({ authStatus: "pending" })).toContain("configured");
    expect(getHermesDashboardUnavailableMessage({ authStatus: "disabled" })).toContain("disabled");
    expect(getHermesDashboardUnavailableMessage({ authStatus: "error" })).toContain("Recovery");
    expect(
      getHermesDashboardUnavailableMessage({
        authStatus: "active",
        clientId: null,
      })
    ).toContain("Recovery");
    expect(
      getHermesDashboardUnavailableMessage({
        authStatus: "active",
        clientId: "client-id",
      })
    ).toBeNull();
  });
});
