"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/dashboard/admin/fleet", label: "Fleet" },
  { href: "/dashboard/admin/metrics", label: "Metrics" },
  { href: "/dashboard/admin/configuration", label: "Configuration" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="overflow-x-auto">
      <div className="flex min-w-max gap-2">
        {sections.map((section) => {
          const active = pathname.startsWith(section.href);
          return (
            <Link
              href={section.href}
              aria-current={active ? "page" : undefined}
              className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
              key={section.href}
              style={{
                background: active
                  ? "var(--color-od-accent-bg)"
                  : "var(--color-od-raised)",
                borderColor: active
                  ? "var(--color-od-accent-dim)"
                  : "var(--color-od-border)",
                color: active
                  ? "var(--color-od-text)"
                  : "var(--color-od-text-2)",
              }}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
