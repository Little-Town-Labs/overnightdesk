import { tabs, type NavTab } from "../dashboard-nav";

// The DashboardNav component uses usePathname and Link from next/navigation,
// which require a browser/jsdom environment. We test the exported tab
// configuration and the filtering logic that drives tab visibility.

function getVisibleTabs(allTabs: NavTab[], instanceRunning: boolean): NavTab[] {
  return allTabs.filter((tab) => !tab.requiresRunning || instanceRunning);
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
    it("exports all seven tabs", () => {
      expect(tabs).toHaveLength(7);
    });

    it("has correct tab labels in order", () => {
      const labels = tabs.map((t) => t.label);
      expect(labels).toEqual([
        "Overview",
        "Heartbeat",
        "Jobs",
        "Activity",
        "Logs",
        "Bridges",
        "Settings",
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
        "/dashboard/bridges",
        "/dashboard/settings",
      ]);
    });

    it("marks Overview and Settings as not requiring running instance", () => {
      const alwaysVisible = tabs.filter((t) => !t.requiresRunning);
      expect(alwaysVisible.map((t) => t.label)).toEqual([
        "Overview",
        "Settings",
      ]);
    });

    it("marks Heartbeat, Jobs, Activity, Logs, Bridges as requiring running instance", () => {
      const managementTabs = tabs.filter((t) => t.requiresRunning);
      expect(managementTabs.map((t) => t.label)).toEqual([
        "Heartbeat",
        "Jobs",
        "Activity",
        "Logs",
        "Bridges",
      ]);
    });
  });

  describe("tab visibility filtering", () => {
    it("shows all tabs when instance is running", () => {
      const visible = getVisibleTabs(tabs, true);
      expect(visible).toHaveLength(7);
      expect(visible.map((t) => t.label)).toEqual([
        "Overview",
        "Heartbeat",
        "Jobs",
        "Activity",
        "Logs",
        "Bridges",
        "Settings",
      ]);
    });

    it("hides management tabs when instance is not running", () => {
      const visible = getVisibleTabs(tabs, false);
      expect(visible).toHaveLength(2);
      expect(visible.map((t) => t.label)).toEqual(["Overview", "Settings"]);
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
