import type { SectionStatus } from "@/lib/mitchel-prospecting/types";

function statusTone(status: SectionStatus["status"]): string {
  switch (status) {
    case "ok":
      return "text-emerald-300";
    case "empty":
      return "text-zinc-400";
    case "unavailable":
      return "text-amber-300";
  }
}

export function SectionMetric({ label, section }: { label: string; section: SectionStatus }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className={`text-xs font-medium uppercase ${statusTone(section.status)}`}>
          {section.status.replace("_", " ")}
        </span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{section.count}</div>
      <p className="mt-1 text-xs text-zinc-500">{section.message}</p>
    </div>
  );
}
