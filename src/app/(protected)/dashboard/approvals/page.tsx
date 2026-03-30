import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getApprovals } from "@/lib/engine-client";
import type { EngineApprovalResponse } from "@/lib/engine-contracts";
import { formatDateTime } from "@/lib/format";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-900/50 text-amber-400",
  approved: "bg-green-900/50 text-green-400",
  rejected: "bg-red-900/50 text-red-400",
  revision_requested: "bg-blue-900/50 text-blue-400",
};

export default async function ApprovalsPage() {
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
          <h1 className="text-2xl font-bold text-white mb-4">Approvals</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              Your instance must be running to view approvals.
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

  const data = await getApprovals(inst.subdomain, inst.engineApiKey, { limit: 50 });
  const approvals: EngineApprovalResponse[] = data?.approvals ?? [];
  const pendingCount = data?.pending_count ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Approvals
              {pendingCount > 0 && (
                <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-amber-900/50 text-amber-400">
                  {pendingCount} pending
                </span>
              )}
            </h1>
            <p className="text-zinc-400">Review and approve agent actions.</p>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        {approvals.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">No approvals yet.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {approvals.map((approval) => (
              <div key={approval.id} className="p-4">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-white font-medium truncate">{approval.title}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      statusStyles[approval.status] ?? "bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {approval.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400 mt-1">
                  <span className="bg-zinc-800 px-2 py-0.5 rounded">{approval.type}</span>
                  <span>Agent: {approval.agent_id.slice(0, 8)}</span>
                  {approval.decided_at && (
                    <span>Decided: {formatDateTime(approval.decided_at)}</span>
                  )}
                  <span className="ml-auto">{formatDateTime(approval.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
