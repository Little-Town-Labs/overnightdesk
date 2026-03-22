import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isAdmin } from "@/lib/billing";
import { db } from "@/db";
import {
  subscription,
  instance,
  usageMetric,
  fleetEvent,
} from "@/db/schema";
import { eq, sql, gte, and } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isAdmin(session.user.email)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

    // Total active subscribers
    const [activeSubResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscription)
      .where(eq(subscription.status, "active"));

    // Total running instances
    const [runningResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(instance)
      .where(eq(instance.status, "running"));

    // Average daily Claude calls (last 7 days)
    const [avgResult] = await db
      .select({
        avg: sql<number>`coalesce(avg(${usageMetric.claudeCalls}), 0)::numeric`,
      })
      .from(usageMetric)
      .where(gte(usageMetric.metricDate, sevenDaysAgoStr));

    // At-risk tenants: running instances with 0 usage in last 7 days
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

    // Provisioning success rate
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

    return NextResponse.json({
      success: true,
      data: {
        activeSubscribers: activeSubResult.count,
        runningInstances: runningResult.count,
        avgDailyClaudeCalls: Math.round(Number(avgResult.avg) * 10) / 10,
        atRiskTenants,
        provisioningSuccessRate: provisioningRate,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to compute metrics";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
