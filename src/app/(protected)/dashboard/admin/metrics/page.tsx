import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/billing";
import { db } from "@/db";
import {
  subscription,
  instance,
  usageMetric,
  fleetEvent,
} from "@/db/schema";
import { eq, sql, gte, and } from "drizzle-orm";
import { MetricsCards } from "./metrics-cards";

export default async function AdminMetricsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  if (!isAdmin(session.user.email)) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-4">
            Admin Metrics
          </h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-red-400">Access denied. Admin only.</p>
          </div>
        </div>
      </div>
    );
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const [activeSubResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(subscription)
    .where(eq(subscription.status, "active"));

  const [runningResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(instance)
    .where(eq(instance.status, "running"));

  const [avgResult] = await db
    .select({
      avg: sql<number>`coalesce(avg(${usageMetric.claudeCalls}), 0)::numeric`,
    })
    .from(usageMetric)
    .where(gte(usageMetric.metricDate, sevenDaysAgoStr));

  const runningInstances = await db
    .select({ id: instance.id, tenantId: instance.tenantId })
    .from(instance)
    .where(eq(instance.status, "running"));

  const recentUsage = await db
    .select({ instanceId: usageMetric.instanceId })
    .from(usageMetric)
    .where(
      and(
        gte(usageMetric.metricDate, sevenDaysAgoStr),
        sql`${usageMetric.claudeCalls} > 0 OR ${usageMetric.toolExecutions} > 0`
      )
    );

  const activeInstanceIds = new Set(
    recentUsage.map((r) => r.instanceId)
  );
  const atRiskTenants = runningInstances
    .filter((inst) => !activeInstanceIds.has(inst.id))
    .map((inst) => inst.tenantId);

  const [queuedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fleetEvent)
    .where(sql`${fleetEvent.eventType} LIKE '%queued%'`);

  const [runningCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fleetEvent)
    .where(sql`${fleetEvent.eventType} LIKE '%running%'`);

  const provisioningRate =
    queuedCount.count > 0
      ? Math.round((runningCount.count / queuedCount.count) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Admin Metrics
            </h1>
            <p className="text-zinc-400">
              Business metrics overview for the platform.
            </p>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        <MetricsCards
          activeSubscribers={activeSubResult.count}
          runningInstances={runningResult.count}
          avgDailyClaudeCalls={
            Math.round(Number(avgResult.avg) * 10) / 10
          }
          atRiskTenants={atRiskTenants}
          provisioningSuccessRate={provisioningRate}
        />
      </div>
    </div>
  );
}
