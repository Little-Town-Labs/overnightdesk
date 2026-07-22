"use client";

import { useCallback, useState } from "react";

interface InstanceHealth {
  id: string;
  tenantId: string;
  status: string;
  subdomain: string | null;
  lastHealthCheck: Date | null;
  consecutiveHealthFailures: number;
  claudeAuthStatus: string;
}

interface FleetHealthTableProps {
  instances: InstanceHealth[];
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never";

  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getFailureColor(failures: number): string {
  if (failures === 0) return "text-emerald-400";
  if (failures < 3) return "text-amber-400";
  return "text-red-400";
}

function getStatusColor(status: string): string {
  switch (status) {
    case "running":
      return "text-emerald-400";
    case "error":
      return "text-red-400";
    case "stopped":
    case "deprovisioned":
      return "text-zinc-500";
    default:
      return "text-amber-400";
  }
}

export function FleetHealthTable({ instances }: FleetHealthTableProps) {
  const [data, setData] = useState(instances);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/fleet/health");
      if (response.ok) {
        const json = await response.json();
        if (json.success) {
          setData(json.data);
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <section className="od-card p-5 sm:p-6" aria-labelledby="instance-health-heading">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium" id="instance-health-heading" style={{ color: "var(--color-od-text)" }}>Instance health</h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
          style={{ background: "var(--color-od-raised)", borderColor: "var(--color-od-border)", color: "var(--color-od-text-2)" }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-od-text-3)" }}>No instances found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--color-od-border)", color: "var(--color-od-text-3)" }}>
                <th className="pb-2 pr-4 font-medium">Tenant</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Subdomain</th>
                <th className="pb-2 pr-4 font-medium">Last Check</th>
                <th className="pb-2 pr-4 font-medium">Failures</th>
                <th className="pb-2 font-medium">Auth</th>
              </tr>
            </thead>
            <tbody>
              {data.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--color-od-border)" }}
                >
                  <td className="py-2 pr-4 text-xs" style={{ color: "var(--color-od-text)", fontFamily: "var(--font-mono)" }}>
                    {inst.tenantId}
                  </td>
                  <td className={`py-2 pr-4 ${getStatusColor(inst.status)}`}>
                    {inst.status}
                  </td>
                  <td className="py-2 pr-4" style={{ color: "var(--color-od-text-2)" }}>
                    {inst.subdomain ?? "—"}
                  </td>
                  <td className="py-2 pr-4" style={{ color: "var(--color-od-text-2)" }}>
                    {formatRelativeTime(inst.lastHealthCheck)}
                  </td>
                  <td
                    className={`py-2 pr-4 ${getFailureColor(inst.consecutiveHealthFailures)}`}
                  >
                    {inst.consecutiveHealthFailures}
                  </td>
                  <td className="py-2" style={{ color: "var(--color-od-text-2)" }}>
                    {inst.claudeAuthStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
