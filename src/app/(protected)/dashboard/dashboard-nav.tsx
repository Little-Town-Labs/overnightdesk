"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavTab {
  label: string;
  href: string;
  requiresRunning: boolean;
}

const tabs: NavTab[] = [
  { label: "Overview", href: "/dashboard", requiresRunning: false },
  { label: "Heartbeat", href: "/dashboard/heartbeat", requiresRunning: true },
  { label: "Jobs", href: "/dashboard/jobs", requiresRunning: true },
  { label: "Activity", href: "/dashboard/activity", requiresRunning: true },
  { label: "Logs", href: "/dashboard/logs", requiresRunning: true },
  { label: "Bridges", href: "/dashboard/bridges", requiresRunning: true },
  { label: "Settings", href: "/dashboard/settings", requiresRunning: false },
];

interface DashboardNavProps {
  instanceRunning: boolean;
}

export function DashboardNav({ instanceRunning }: DashboardNavProps) {
  const pathname = usePathname();

  const visibleTabs = tabs.filter(
    (tab) => !tab.requiresRunning || instanceRunning
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
