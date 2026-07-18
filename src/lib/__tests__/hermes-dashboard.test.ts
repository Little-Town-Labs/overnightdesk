import { getHermesDashboardUrl } from "@/lib/hermes-dashboard";

describe("getHermesDashboardUrl", () => {
  it("returns the tenant root only for an active linked OIDC client", () => {
    expect(
      getHermesDashboardUrl("tenant-a.overnightdesk.com", {
        authStatus: "active",
        clientId: "public-client-id",
      })
    ).toBe("https://tenant-a.overnightdesk.com");
  });

  it.each([
    { authStatus: "legacy" as const, clientId: null },
    { authStatus: "pending" as const, clientId: "public-client-id" },
    { authStatus: "active" as const, clientId: null },
    { authStatus: "disabled" as const, clientId: "public-client-id" },
    { authStatus: "error" as const, clientId: "public-client-id" },
  ])("keeps the protected login fallback for $authStatus", (linkage) => {
    expect(getHermesDashboardUrl("tenant-a.overnightdesk.com", linkage)).toBe(
      "https://tenant-a.overnightdesk.com/login"
    );
  });
});
