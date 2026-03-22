import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { db } from "@/db";
import { usageMetric } from "@/db/schema";
import { eq, desc, gte, and } from "drizzle-orm";
import { UsageTable } from "./usage-table";

export default async function UsagePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const inst = await getInstanceForUser(session.user.id);

  if (!inst) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-4">Usage</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              No instance found. Provision your assistant to see usage data.
            </p>
            <a
              href="/dashboard"
              className="text-blue-400 hover:text-blue-300 underline text-sm mt-2 inline-block"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const usageData = await db
    .select({
      date: usageMetric.metricDate,
      claudeCalls: usageMetric.claudeCalls,
      toolExecutions: usageMetric.toolExecutions,
    })
    .from(usageMetric)
    .where(
      and(
        eq(usageMetric.instanceId, inst.id),
        gte(usageMetric.metricDate, thirtyDaysAgoStr)
      )
    )
    .orderBy(desc(usageMetric.metricDate));

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Usage</h1>
            <p className="text-zinc-400">
              Daily usage metrics for your assistant (last 30 days).
            </p>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        <UsageTable usage={usageData} />
      </div>
    </div>
  );
}
