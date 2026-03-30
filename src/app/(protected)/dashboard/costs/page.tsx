import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getCosts } from "@/lib/engine-client";
import { formatCents, formatTokens } from "@/lib/format";

export default async function CostsPage() {
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
          <h1 className="text-2xl font-bold text-white mb-4">Costs</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              Your instance must be running to view costs.
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

  const data = await getCosts(inst.subdomain, inst.engineApiKey);

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Costs</h1>
            <p className="text-zinc-400">Token usage and cost breakdown.</p>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        {!data ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">No cost data yet.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wider">Total Cost</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {formatCents(data.summary.TotalCostCents)}
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wider">Total Runs</p>
                <p className="text-2xl font-bold text-white mt-1">{data.summary.TotalRuns}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wider">Tokens</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {formatTokens(data.summary.TotalInput + data.summary.TotalOutput)}
                </p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {formatTokens(data.summary.TotalInput)} in / {formatTokens(data.summary.TotalOutput)} out
                </p>
              </div>
            </div>

            {data.by_agent && data.by_agent.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-3">By Agent</h2>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                  {data.by_agent.map((agent) => (
                    <div key={agent.AgentID} className="p-4 flex items-center justify-between">
                      <div>
                        <span className="text-zinc-300 text-sm font-mono">
                          {agent.AgentID.slice(0, 8)}
                        </span>
                        <span className="text-zinc-500 text-xs ml-3">
                          {agent.RunCount} run{agent.RunCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-white font-medium">
                          {formatCents(agent.TotalCostCents)}
                        </span>
                        <span className="text-zinc-500 text-xs ml-2">
                          {formatTokens(agent.TotalInput + agent.TotalOutput)} tokens
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.by_project && data.by_project.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-3">By Project</h2>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                  {data.by_project.map((project) => (
                    <div key={project.ProjectID} className="p-4 flex items-center justify-between">
                      <div>
                        <span className="text-zinc-300 text-sm font-mono">
                          {project.ProjectID.slice(0, 8)}
                        </span>
                        <span className="text-zinc-500 text-xs ml-3">
                          {project.RunCount} run{project.RunCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-white font-medium">
                        {formatCents(project.TotalCostCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
