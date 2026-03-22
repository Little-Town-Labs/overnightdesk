import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/billing";
import { computeAdminMetrics } from "@/lib/admin-metrics";
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

  const metrics = await computeAdminMetrics();

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
          activeSubscribers={metrics.activeSubscribers}
          runningInstances={metrics.runningInstances}
          avgDailyClaudeCalls={metrics.avgDailyClaudeCalls}
          atRiskTenants={metrics.atRiskTenants}
          provisioningSuccessRate={metrics.provisioningSuccessRate}
        />
      </div>
    </div>
  );
}
