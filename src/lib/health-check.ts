import { db } from "@/db";
import { instance, fleetEvent } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getEngineStatus } from "@/lib/engine-client";
import { sendOwnerAlert } from "@/lib/owner-notifications";

export async function checkInstanceHealth(
  subdomain: string,
  apiKey: string
): Promise<boolean> {
  const status = await getEngineStatus(subdomain, apiKey);
  return status !== null;
}

interface HealthCheckResult {
  checked: number;
  passed: number;
  failed: number;
  alerts: number;
}

export async function runFleetHealthCheck(): Promise<HealthCheckResult> {
  const runningInstances = await db
    .select()
    .from(instance)
    .where(eq(instance.status, "running"));

  const summary: HealthCheckResult = {
    checked: runningInstances.length,
    passed: 0,
    failed: 0,
    alerts: 0,
  };

  const results = await Promise.allSettled(
    runningInstances.map(async (inst) => {
      if (!inst.subdomain || !inst.engineApiKey) {
        return;
      }

      const healthy = await checkInstanceHealth(
        inst.subdomain,
        inst.engineApiKey
      );

      if (healthy) {
        const wasUnhealthy = inst.consecutiveHealthFailures >= 3;

        await db
          .update(instance)
          .set({
            lastHealthCheck: new Date(),
            consecutiveHealthFailures: 0,
            updatedAt: new Date(),
          })
          .where(eq(instance.id, inst.id));

        await db.insert(fleetEvent).values({
          instanceId: inst.id,
          eventType: "health_check_pass",
          details: { subdomain: inst.subdomain },
        });

        if (wasUnhealthy) {
          await db.insert(fleetEvent).values({
            instanceId: inst.id,
            eventType: "instance_recovered",
            details: {
              subdomain: inst.subdomain,
              previousFailures: inst.consecutiveHealthFailures,
            },
          });

          await sendOwnerAlert(
            `✅ <b>Instance Recovered</b>\n` +
              `Subdomain: ${inst.subdomain}\n` +
              `Tenant: ${inst.tenantId}\n` +
              `Previous failures: ${inst.consecutiveHealthFailures}`
          );
        }

        summary.passed++;
      } else {
        const newFailureCount = inst.consecutiveHealthFailures + 1;

        await db
          .update(instance)
          .set({
            consecutiveHealthFailures: newFailureCount,
            updatedAt: new Date(),
          })
          .where(eq(instance.id, inst.id));

        await db.insert(fleetEvent).values({
          instanceId: inst.id,
          eventType: "health_check_fail",
          details: {
            subdomain: inst.subdomain,
            consecutiveFailures: newFailureCount,
          },
        });

        if (newFailureCount === 3) {
          await db.insert(fleetEvent).values({
            instanceId: inst.id,
            eventType: "instance_unhealthy",
            details: {
              subdomain: inst.subdomain,
              consecutiveFailures: newFailureCount,
            },
          });

          await sendOwnerAlert(
            `🚨 <b>Instance Unhealthy</b>\n` +
              `Subdomain: ${inst.subdomain}\n` +
              `Tenant: ${inst.tenantId}\n` +
              `Consecutive failures: ${newFailureCount}`
          );

          summary.alerts++;
        }

        summary.failed++;
      }
    })
  );

  // Count any rejected promises as failures
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Health check error for instance:", result.reason);
    }
  }

  return summary;
}
