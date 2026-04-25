"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavTab {
  label: string;
  href: string;
  requiresRunning: boolean;
  adminOnly?: boolean;
  requiresPro?: boolean;
}

const tabs: NavTab[] = [
  { label: "Overview", href: "/dashboard", requiresRunning: false },
  { label: "Agents", href: "/dashboard/agents", requiresRunning: true },
  { label: "Issues", href: "/dashboard/issues", requiresRunning: true },
  { label: "Projects", href: "/dashboard/projects", requiresRunning: true },
  { label: "Routines", href: "/dashboard/routines", requiresRunning: true },
  { label: "Approvals", href: "/dashboard/approvals", requiresRunning: true },
  { label: "Skills", href: "/dashboard/skills", requiresRunning: true },
  { label: "Costs", href: "/dashboard/costs", requiresRunning: true },
  { label: "Activity", href: "/dashboard/activity", requiresRunning: true },
  { label: "Logs", href: "/dashboard/logs", requiresRunning: true },
  { label: "Bridges", href: "/dashboard/bridges", requiresRunning: true },
  { label: "Settings", href: "/dashboard/settings", requiresRunning: false },
  { label: "Chat", href: "/dashboard/chat", requiresRunning: false },
  { label: "Security", href: "/dashboard/security", requiresRunning: true, requiresPro: true },
  { label: "Admin", href: "/dashboard/admin/fleet", requiresRunning: false, adminOnly: true },
];

interface DashboardNavProps {
  instanceRunning: boolean;
  isAdmin?: boolean;
  plan?: string;
  isHermesTenant?: boolean;
}

const HERMES_ALLOWED_TABS = new Set(["/dashboard", "/dashboard/settings", "/dashboard/chat", "/dashboard/admin/fleet"]);

export function DashboardNav({ instanceRunning, isAdmin: isAdminUser = false, plan, isHermesTenant = false }: DashboardNavProps) {
  const pathname = usePathname();

  const visibleTabs = tabs.filter(
    (tab) =>
      (!tab.requiresRunning || instanceRunning) &&
      (!tab.adminOnly || isAdminUser) &&
      (!tab.requiresPro || isAdminUser || plan === "pro") &&
      (!isHermesTenant || HERMES_ALLOWED_TABS.has(tab.href))
  );

  return (
    <nav className="mb-6 overflow-x-auto">
      <div className="flex gap-1 whitespace-nowrap">
        {visibleTabs.map((tab) => {
          const isActive =
            tab.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export { tabs };
export type { NavTab, DashboardNavProps };
