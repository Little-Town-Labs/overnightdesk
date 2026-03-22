import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/billing";
import { db } from "@/db";
import { instance, fleetEvent } from "@/db/schema";
import { desc } from "drizzle-orm";
import { FleetHealthTable } from "./fleet-health-table";
import { FleetEventsList } from "./fleet-events-list";

export default async function FleetMonitoringPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  if (!isAdmin(session.user.email)) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold text-white">Access Denied</h2>
        <p className="mt-2 text-zinc-400">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

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
        <h2 className="text-lg font-semibold text-white">Fleet Monitoring</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Health status and event history for all instances.
        </p>
      </div>

      <FleetHealthTable instances={instances} />
      <FleetEventsList initialEvents={recentEvents} />
    </div>
  );
}
