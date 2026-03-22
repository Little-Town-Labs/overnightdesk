"use client";

interface UsageRow {
  date: string;
  claudeCalls: number;
  toolExecutions: number;
}

interface UsageTableProps {
  usage: UsageRow[];
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function UsageTable({ usage }: UsageTableProps) {
  if (usage.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
        <p className="text-zinc-400">
          No usage data yet. Your assistant&apos;s activity will appear here
          once data is collected.
        </p>
      </div>
    );
  }

  const today = getTodayUTC();
  const maxClaude = Math.max(...usage.map((r) => r.claudeCalls), 1);
  const maxTool = Math.max(...usage.map((r) => r.toolExecutions), 1);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left text-zinc-400 text-sm font-medium px-4 py-3">
              Date
            </th>
            <th className="text-left text-zinc-400 text-sm font-medium px-4 py-3">
              Claude Calls
            </th>
            <th className="text-left text-zinc-400 text-sm font-medium px-4 py-3">
              Tool Executions
            </th>
          </tr>
        </thead>
        <tbody>
          {usage.map((row) => {
            const isToday = row.date === today;
            return (
              <tr
                key={row.date}
                className={`border-b border-zinc-800/50 last:border-b-0 ${
                  isToday ? "bg-zinc-800/30" : ""
                }`}
              >
                <td className="px-4 py-3 text-sm text-zinc-300">
                  {formatDate(row.date)}
                  {isToday && (
                    <span className="ml-2 text-xs text-yellow-400">
                      (in progress)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white w-8 text-right tabular-nums">
                      {row.claudeCalls}
                    </span>
                    <div className="flex-1 h-4 rounded bg-zinc-800">
                      <div
                        className="h-full rounded bg-blue-500/30"
                        style={{
                          width: `${(row.claudeCalls / maxClaude) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white w-8 text-right tabular-nums">
                      {row.toolExecutions}
                    </span>
                    <div className="flex-1 h-4 rounded bg-zinc-800">
                      <div
                        className="h-full rounded bg-purple-500/30"
                        style={{
                          width: `${(row.toolExecutions / maxTool) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { getTodayUTC, formatDate };
export type { UsageRow, UsageTableProps };
