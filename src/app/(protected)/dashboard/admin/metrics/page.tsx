import { requireAdminPage } from "@/lib/admin-page-authorization";
import { computeAdminMetrics } from "@/lib/admin-metrics";
import { MetricsCards } from "./metrics-cards";

export default async function AdminMetricsPage() {
  await requireAdminPage();

  const metrics = await computeAdminMetrics();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-od-accent)", fontFamily: "var(--font-mono)" }}>Global scope</p>
        <h2 className="mt-1 text-xl font-semibold" style={{ color: "var(--color-od-text)" }}>Metrics</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-od-text-2)" }}>
          Business metrics overview for the platform.
        </p>
      </div>

        <MetricsCards
          activeSubscribers={metrics.activeSubscribers}
          runningInstances={metrics.runningInstances}
          avgDailyClaudeCalls={metrics.avgDailyClaudeCalls}
          atRiskTenants={metrics.atRiskTenants}
          provisioningSuccessRate={metrics.provisioningSuccessRate}
        />
    </div>
  );
}
