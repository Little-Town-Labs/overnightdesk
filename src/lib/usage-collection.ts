import { db } from "@/db";
import { instance, usageMetric } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getJobs, getConversations } from "@/lib/engine-client";

interface UsageCounts {
  claudeCalls: number;
  toolExecutions: number;
}

function getTodayUTC(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function isToday(dateString: string): boolean {
  const today = getTodayUTC();
  return dateString.startsWith(today);
}

export async function collectInstanceUsage(
  subdomain: string,
  apiKey: string
): Promise<UsageCounts | null> {
  try {
    const [jobs, conversations] = await Promise.all([
      getJobs(subdomain, apiKey, { limit: "100" }),
      getConversations(subdomain, apiKey, { limit: "100" }),
    ]);

    const todayJobs = jobs.filter((job) => {
      const record = job as Record<string, unknown>;
      const createdAt = record.createdAt ?? record.created_at;
      return typeof createdAt === "string" && isToday(createdAt);
    });

    const todayConversations = conversations.filter((conv) => {
      const record = conv as Record<string, unknown>;
      const startedAt = record.startedAt ?? record.started_at;
      return typeof startedAt === "string" && isToday(startedAt);
    });

    return {
      claudeCalls: todayJobs.length,
      toolExecutions: todayConversations.length,
    };
  } catch {
    return null;
  }
}

export async function runDailyCollection(): Promise<{
  collected: number;
  failed: number;
}> {
  const today = getTodayUTC();

  const runningInstances = await db
    .select()
    .from(instance)
    .where(eq(instance.status, "running"));

  const results = await Promise.allSettled(
    runningInstances.map(async (inst) => {
      if (!inst.subdomain || !inst.engineApiKey) {
        throw new Error(`Instance ${inst.id} missing subdomain or apiKey`);
      }

      const usage = await collectInstanceUsage(
        inst.subdomain,
        inst.engineApiKey
      );

      if (!usage) {
        throw new Error(
          `Failed to collect usage for instance ${inst.id}`
        );
      }

      await db
        .insert(usageMetric)
        .values({
          instanceId: inst.id,
          metricDate: today,
          claudeCalls: usage.claudeCalls,
          toolExecutions: usage.toolExecutions,
        })
        .onConflictDoUpdate({
          target: [usageMetric.instanceId, usageMetric.metricDate],
          set: {
            claudeCalls: usage.claudeCalls,
            toolExecutions: usage.toolExecutions,
          },
        });
    })
  );

  let collected = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      collected++;
    } else {
      failed++;
    }
  }

  return { collected, failed };
}
