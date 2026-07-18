import { getHermesDashboardUrl } from "@/lib/hermes-dashboard";

describe("getHermesDashboardUrl", () => {
  it("opens the Hermes password login page instead of the broken auto-SSO root", () => {
    expect(getHermesDashboardUrl("aegis-prod.overnightdesk.com")).toBe(
      "https://aegis-prod.overnightdesk.com/login"
    );
  });
});
