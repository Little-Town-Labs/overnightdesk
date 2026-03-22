import { tabs, type NavTab } from "../dashboard-nav";

// The DashboardNav component uses usePathname and Link from next/navigation,
// which require a browser/jsdom environment. We test the exported tab
// configuration and the filtering logic that drives tab visibility.

function getVisibleTabs(allTabs: NavTab[], instanceRunning: boolean, isAdmin = false): NavTab[] {
  return allTabs.filter(
    (tab) =>
      (!tab.requiresRunning || instanceRunning) &&
      (!tab.adminOnly || isAdmin)
  );
}

function getActiveClass(
  pathname: string,
  tabHref: string
): "active" | "inactive" {
  const isActive =
    tabHref === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(tabHref);

  return isActive ? "active" : "inactive";
}

describe("DashboardNav", () => {
  describe("tab configuration", () => {
    it("exports all nine tabs", () => {
      expect(tabs).toHaveLength(9);
    });

    it("has correct tab labels in order", () => {
      const labels = tabs.map((t) => t.label);
      expect(labels).toEqual([
        "Overview",
        "Heartbeat",
        "Jobs",
        "Activity",
        "Logs",
        "Usage",
        "Bridges",
        "Settings",
        "Admin",
      ]);
    });

    it("has correct hrefs for all tabs", () => {
      const hrefs = tabs.map((t) => t.href);
      expect(hrefs).toEqual([
        "/dashboard",
        "/dashboard/heartbeat",
        "/dashboard/jobs",
        "/dashboard/activity",
        "/dashboard/logs",
        "/dashboard/usage",
        "/dashboard/bridges",
        "/dashboard/settings",
        "/dashboard/admin/fleet",
      ]);
    });

    it("marks Overview, Settings, and Admin as not requiring running instance", () => {
      const alwaysVisible = tabs.filter((t) => !t.requiresRunning);
      expect(alwaysVisible.map((t) => t.label)).toEqual([
        "Overview",
        "Settings",
        "Admin",
      ]);
    });

    it("marks Heartbeat, Jobs, Activity, Logs, Usage, Bridges as requiring running instance", () => {
      const managementTabs = tabs.filter((t) => t.requiresRunning);
      expect(managementTabs.map((t) => t.label)).toEqual([
        "Heartbeat",
        "Jobs",
        "Activity",
        "Logs",
        "Usage",
        "Bridges",
      ]);
    });

    it("marks Admin tab as admin-only", () => {
      const adminTabs = tabs.filter((t) => t.adminOnly);
      expect(adminTabs.map((t) => t.label)).toEqual(["Admin"]);
    });
  });

  describe("tab visibility filtering", () => {
    it("shows all non-admin tabs when instance is running (non-admin user)", () => {
      const visible = getVisibleTabs(tabs, true, false);
      expect(visible).toHaveLength(8);
      expect(visible.map((t) => t.label)).toEqual([
        "Overview",
        "Heartbeat",
        "Jobs",
        "Activity",
        "Logs",
        "Usage",
        "Bridges",
        "Settings",
      ]);
    });

    it("shows all tabs including Admin when instance is running and user is admin", () => {
      const visible = getVisibleTabs(tabs, true, true);
      expect(visible).toHaveLength(9);
      expect(visible.map((t) => t.label)).toContain("Admin");
    });

    it("hides management tabs when instance is not running", () => {
      const visible = getVisibleTabs(tabs, false, false);
      expect(visible).toHaveLength(2);
      expect(visible.map((t) => t.label)).toEqual(["Overview", "Settings"]);
    });

    it("shows Admin tab for admin even when instance is not running", () => {
      const visible = getVisibleTabs(tabs, false, true);
      expect(visible).toHaveLength(3);
      expect(visible.map((t) => t.label)).toEqual(["Overview", "Settings", "Admin"]);
    });
  });

  describe("active tab detection", () => {
    it("marks Overview as active on /dashboard", () => {
      expect(getActiveClass("/dashboard", "/dashboard")).toBe("active");
    });

    it("marks Overview as inactive on sub-paths", () => {
      expect(getActiveClass("/dashboard/heartbeat", "/dashboard")).toBe(
        "inactive"
      );
    });

    it("marks Heartbeat as active on /dashboard/heartbeat", () => {
      expect(
        getActiveClass("/dashboard/heartbeat", "/dashboard/heartbeat")
      ).toBe("active");
    });

    it("marks Jobs as active on /dashboard/jobs", () => {
      expect(getActiveClass("/dashboard/jobs", "/dashboard/jobs")).toBe(
        "active"
      );
    });

    it("marks Jobs as active on sub-paths like /dashboard/jobs/123", () => {
      expect(getActiveClass("/dashboard/jobs/123", "/dashboard/jobs")).toBe(
        "active"
      );
    });

    it("marks Settings as inactive when on Overview", () => {
      expect(getActiveClass("/dashboard", "/dashboard/settings")).toBe(
        "inactive"
      );
    });

    it("marks Settings as active on /dashboard/settings", () => {
      expect(
        getActiveClass("/dashboard/settings", "/dashboard/settings")
      ).toBe("active");
    });
  });
});
