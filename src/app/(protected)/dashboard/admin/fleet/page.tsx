import { requireAdminPage } from "@/lib/admin-page-authorization";
import { db } from "@/db";
import { instance, fleetEvent } from "@/db/schema";
import { desc } from "drizzle-orm";
import { FleetHealthTable } from "./fleet-health-table";
import { FleetEventsList } from "./fleet-events-list";

export default async function FleetMonitoringPage() {
  await requireAdminPage();

  const [instances, recentEvents] = await Promise.all([
    db
      .select({
        id: instance.id,
        tenantId: instance.tenantId,
        status: instance.status,
        subdomain: instance.subdomain,
        lastHealthCheck: instance.lastHealthCheck,
        consecutiveHealthFailures: instance.consecutiveHealthFailures,
        claudeAuthStatus: instance.claudeAuthStatus,
      })
      .from(instance),
    db
      .select()
      .from(fleetEvent)
      .orderBy(desc(fleetEvent.createdAt))
      .limit(50),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-od-accent)", fontFamily: "var(--font-mono)" }}>Global scope</p>
        <h2 className="mt-1 text-xl font-semibold" style={{ color: "var(--color-od-text)" }}>Fleet</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-od-text-2)" }}>
          Health status and event history for all instances.
        </p>
      </div>

      <FleetHealthTable instances={instances} />
      <FleetEventsList initialEvents={recentEvents} />
    </div>
  );
}
