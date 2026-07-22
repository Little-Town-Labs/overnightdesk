import { requireAdminPage } from "@/lib/admin-page-authorization";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();

  return (
    <section aria-labelledby="admin-heading" className="space-y-6">
      <div>
        <p
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--color-od-accent)", fontFamily: "var(--font-mono)" }}
        >
          Owner-only controls
        </p>
        <h1
          className="mt-1 text-2xl font-bold"
          id="admin-heading"
          style={{ color: "var(--color-od-text)", fontFamily: "var(--font-display)" }}
        >
          Administration
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-od-text-2)" }}>
          Platform-wide operations and selected-agent configuration share one protected surface.
        </p>
      </div>
      <AdminNav />
      {children}
    </section>
  );
}
