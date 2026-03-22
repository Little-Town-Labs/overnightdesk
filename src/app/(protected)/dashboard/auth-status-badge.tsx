"use client";

const statusConfig = {
  connected: { label: "Connected", dotColor: "bg-emerald-400", textColor: "text-emerald-400" },
  expired: { label: "Expired", dotColor: "bg-amber-400", textColor: "text-amber-400" },
  not_configured: { label: "Not Configured", dotColor: "bg-zinc-500", textColor: "text-zinc-400" },
} as const;

export function AuthStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.not_configured;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
      <span className={`text-sm font-medium ${config.textColor}`}>{config.label}</span>
    </span>
  );
}
