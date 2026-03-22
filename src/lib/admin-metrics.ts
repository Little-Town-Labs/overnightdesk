import { db } from "@/db";
import {
  subscription,
  instance,
  usageMetric,
  fleetEvent,
} from "@/db/schema";
import { eq, sql, gte, and } from "drizzle-orm";

export interface AdminMetrics {
  activeSubscribers: number;
  runningInstances: number;
  avgDailyClaudeCalls: number;
  atRiskTenants: string[];
  provisioningSuccessRate: number;
}

export async function computeAdminMetrics(): Promise<AdminMetrics> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const [
    [activeSubResult],
    [runningResult],
    [avgResult],
    runningInstances,
    recentUsage,
    [queuedCount],
    [runningCount],
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscription)
      .where(eq(subscription.status, "active")),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(instance)
      .where(eq(instance.status, "running")),

    db
      .select({
        avg: sql<number>`coalesce(avg(${usageMetric.claudeCalls}), 0)::numeric`,
      })
      .from(usageMetric)
      .where(gte(usageMetric.metricDate, sevenDaysAgoStr)),

    db
      .select({ id: instance.id, tenantId: instance.tenantId })
      .from(instance)
      .where(eq(instance.status, "running")),

    db
      .select({ instanceId: usageMetric.instanceId })
      .from(usageMetric)
      .where(
        and(
          gte(usageMetric.metricDate, sevenDaysAgoStr),
          sql`${usageMetric.claudeCalls} > 0 OR ${usageMetric.toolExecutions} > 0`
        )
      ),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(fleetEvent)
      .where(eq(fleetEvent.eventType, "instance.queued")),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(fleetEvent)
      .where(eq(fleetEvent.eventType, "instance.running")),
  ]);

  const activeInstanceIds = new Set(
    recentUsage.map((r) => r.instanceId)
  );
  const atRiskTenants = runningInstances
    .filter((inst) => !activeInstanceIds.has(inst.id))
    .map((inst) => inst.tenantId);

  const provisioningRate =
    queuedCount.count > 0
      ? Math.round((runningCount.count / queuedCount.count) * 100)
      : 0;

  return {
    activeSubscribers: activeSubResult.count,
    runningInstances: runningResult.count,
    avgDailyClaudeCalls: Math.round(Number(avgResult.avg) * 10) / 10,
    atRiskTenants,
    provisioningSuccessRate: provisioningRate,
  };
}
