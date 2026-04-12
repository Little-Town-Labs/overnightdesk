import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getIssues } from "@/lib/engine-client";
import type { EngineIssueResponse } from "@/lib/engine-contracts";
import { formatDateTime } from "@/lib/format";
import { Suspense } from "react";
import KanbanBoard from "./kanban-board";
import ViewToggle from "./view-toggle";

const priorityColors: Record<string, string> = {
  urgent: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-zinc-400",
  none: "text-zinc-500",
};

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const inst = await getInstanceForUser(session.user.id);

  if (!inst || inst.status !== "running" || !inst.subdomain || !inst.engineApiKey) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-4">Issues</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              Your instance must be running to view issues.
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

  const data = await getIssues(inst.subdomain, inst.engineApiKey, { limit: 200 });
  const issues: EngineIssueResponse[] = data?.issues ?? [];
  const params = await searchParams;
  const view = params.view === "board" ? "board" : "list";

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className={view === "board" ? "max-w-full mx-auto" : "max-w-4xl mx-auto"}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Issues</h1>
            <p className="text-zinc-400">
              Track work items assigned to agents.
              {data?.total ? ` ${data.total} total.` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Suspense fallback={<div className="h-8 w-28 bg-zinc-800 rounded-md animate-pulse" />}>
              <ViewToggle currentView={view} />
            </Suspense>
            <a
              href="/dashboard"
              className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
            >
              Back to Dashboard
            </a>
          </div>
        </div>

        {view === "board" ? (
          <KanbanBoard initialIssues={issues} />
        ) : (
          <>
            {issues.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
                <p className="text-zinc-400">No issues yet.</p>
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                {issues.map((issue) => (
                  <div key={issue.id} className="p-4">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-zinc-500 text-xs font-mono">{issue.identifier}</span>
                      <span className="text-white font-medium truncate">{issue.title}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span className="bg-zinc-800 px-2 py-0.5 rounded">{issue.status}</span>
                      <span className={priorityColors[issue.priority] ?? "text-zinc-400"}>
                        {issue.priority}
                      </span>
                      {issue.assignee_agent_id && (
                        <span>assigned: {issue.assignee_agent_id.slice(0, 8)}</span>
                      )}
                      <span className="ml-auto">{formatDateTime(issue.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
