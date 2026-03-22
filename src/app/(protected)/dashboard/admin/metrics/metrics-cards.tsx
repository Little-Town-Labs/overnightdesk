"use client";

interface MetricsCardsProps {
  activeSubscribers: number;
  runningInstances: number;
  avgDailyClaudeCalls: number;
  atRiskTenants: string[];
  provisioningSuccessRate: number;
}

function MetricCard({
  title,
  value,
  accent,
  children,
}: {
  title: string;
  value: string | number;
  accent: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`bg-zinc-900 border rounded-lg p-6 ${accent}`}
    >
      <p className="text-sm text-zinc-400 mb-1">{title}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {children}
    </div>
  );
}

export function MetricsCards({
  activeSubscribers,
  runningInstances,
  avgDailyClaudeCalls,
  atRiskTenants,
  provisioningSuccessRate,
}: MetricsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <MetricCard
        title="Active Subscribers"
        value={activeSubscribers}
        accent="border-blue-500/30"
      />

      <MetricCard
        title="Running Instances"
        value={runningInstances}
        accent="border-emerald-500/30"
      />

      <MetricCard
        title="Avg Daily Claude Calls"
        value={avgDailyClaudeCalls}
        accent="border-purple-500/30"
      >
        <p className="text-xs text-zinc-500 mt-1">Last 7 days</p>
      </MetricCard>

      <MetricCard
        title="At-Risk Tenants"
        value={atRiskTenants.length}
        accent={
          atRiskTenants.length > 0
            ? "border-red-500/30"
            : "border-zinc-800"
        }
      >
        {atRiskTenants.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-red-400 mb-2">
              No usage in 7 days:
            </p>
            <ul className="space-y-1">
              {atRiskTenants.map((tenantId) => (
                <li
                  key={tenantId}
                  className="text-xs text-zinc-400 font-mono bg-zinc-800/50 rounded px-2 py-1"
                >
                  {tenantId}
                </li>
              ))}
            </ul>
          </div>
        )}
      </MetricCard>

      <MetricCard
        title="Provisioning Success Rate"
        value={`${provisioningSuccessRate}%`}
        accent={
          provisioningSuccessRate >= 80
            ? "border-green-500/30"
            : "border-red-500/30"
        }
      />
    </div>
  );
}

export type { MetricsCardsProps };
