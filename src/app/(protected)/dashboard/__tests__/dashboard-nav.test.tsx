import { tabs, type NavTab } from "../dashboard-nav";

// The DashboardNav component uses usePathname and Link from next/navigation,
// which require a browser/jsdom environment. We test the exported tab
// configuration and the filtering logic that drives tab visibility.

function getVisibleTabs(allTabs: NavTab[], instanceRunning: boolean, isAdmin = false, plan?: string): NavTab[] {
  return allTabs.filter(
    (tab) =>
      (!tab.requiresRunning || instanceRunning) &&
      (!tab.adminOnly || isAdmin) &&
      (!tab.requiresPro || isAdmin || plan === "pro")
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
    it("exports all fifteen tabs", () => {
      expect(tabs).toHaveLength(15);
    });

    it("includes Chat tab", () => {
      const chat = tabs.find((t) => t.label === "Chat");
      expect(chat).toBeDefined();
      expect(chat?.href).toBe("/dashboard/chat");
      expect(chat?.requiresRunning).toBe(false);
    });

    it("has correct tab labels in order", () => {
      const labels = tabs.map((t) => t.label);
      expect(labels).toEqual([
        "Overview",
        "Agents",
        "Issues",
        "Projects",
        "Routines",
        "Approvals",
        "Skills",
        "Costs",
        "Activity",
        "Logs",
        "Bridges",
        "Settings",
        "Chat",
        "Security",
        "Admin",
      ]);
    });

    it("has correct hrefs for all tabs", () => {
      const hrefs = tabs.map((t) => t.href);
      expect(hrefs).toEqual([
        "/dashboard",
        "/dashboard/agents",
        "/dashboard/issues",
        "/dashboard/projects",
        "/dashboard/routines",
        "/dashboard/approvals",
        "/dashboard/skills",
        "/dashboard/costs",
        "/dashboard/activity",
        "/dashboard/logs",
        "/dashboard/bridges",
        "/dashboard/settings",
        "/dashboard/chat",
        "/dashboard/security",
        "/dashboard/admin/fleet",
      ]);
    });

    it("marks Overview, Settings, Chat, and Admin as not requiring running instance", () => {
      const alwaysVisible = tabs.filter((t) => !t.requiresRunning);
      expect(alwaysVisible.map((t) => t.label)).toEqual([
        "Overview",
        "Settings",
        "Chat",
        "Admin",
      ]);
    });

    it("marks management tabs as requiring running instance", () => {
      const managementTabs = tabs.filter((t) => t.requiresRunning);
      expect(managementTabs.map((t) => t.label)).toEqual([
        "Agents",
        "Issues",
        "Projects",
        "Routines",
        "Approvals",
        "Skills",
        "Costs",
        "Activity",
        "Logs",
        "Bridges",
        "Security",
      ]);
    });

    it("marks Admin tab as admin-only", () => {
      const adminTabs = tabs.filter((t) => t.adminOnly);
      expect(adminTabs.map((t) => t.label)).toEqual(["Admin"]);
    });

    it("marks Security tab as requiring pro", () => {
      const proTabs = tabs.filter((t) => t.requiresPro);
      expect(proTabs.map((t) => t.label)).toEqual(["Security"]);
    });
  });

  describe("tab visibility filtering", () => {
    it("shows all non-admin non-pro tabs when instance is running (non-admin user)", () => {
      const visible = getVisibleTabs(tabs, true, false);
      expect(visible).toHaveLength(13);
      expect(visible.map((t) => t.label)).not.toContain("Admin");
      expect(visible.map((t) => t.label)).not.toContain("Security");
    });

    it("shows all tabs including Admin and Security when instance is running and user is admin", () => {
      const visible = getVisibleTabs(tabs, true, true);
      expect(visible).toHaveLength(15);
      expect(visible.map((t) => t.label)).toContain("Admin");
      expect(visible.map((t) => t.label)).toContain("Security");
    });

    it("shows Security for pro plan users", () => {
      const visible = getVisibleTabs(tabs, true, false, "pro");
      expect(visible.map((t) => t.label)).toContain("Security");
    });

    it("hides management tabs when instance is not running", () => {
      const visible = getVisibleTabs(tabs, false, false);
      expect(visible).toHaveLength(3);
      expect(visible.map((t) => t.label)).toEqual(["Overview", "Settings", "Chat"]);
    });

    it("shows Admin tab for admin even when instance is not running", () => {
      const visible = getVisibleTabs(tabs, false, true);
      expect(visible).toHaveLength(4);
      expect(visible.map((t) => t.label)).toEqual(["Overview", "Settings", "Chat", "Admin"]);
    });
  });

  describe("active tab detection", () => {
    it("marks Overview as active on /dashboard", () => {
      expect(getActiveClass("/dashboard", "/dashboard")).toBe("active");
    });

    it("marks Overview as inactive on sub-paths", () => {
      expect(getActiveClass("/dashboard/agents", "/dashboard")).toBe(
        "inactive"
      );
    });

    it("marks Agents as active on /dashboard/agents", () => {
      expect(
        getActiveClass("/dashboard/agents", "/dashboard/agents")
      ).toBe("active");
    });

    it("marks Issues as active on /dashboard/issues", () => {
      expect(getActiveClass("/dashboard/issues", "/dashboard/issues")).toBe(
        "active"
      );
    });

    it("marks Issues as active on sub-paths like /dashboard/issues/123", () => {
      expect(getActiveClass("/dashboard/issues/123", "/dashboard/issues")).toBe(
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
