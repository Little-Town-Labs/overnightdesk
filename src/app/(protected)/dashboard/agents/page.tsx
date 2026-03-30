import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getAgents } from "@/lib/engine-client";
import type { EngineAgentResponse } from "@/lib/engine-contracts";
import { formatCents } from "@/lib/format";

export default async function AgentsPage() {
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
          <h1 className="text-2xl font-bold text-white mb-4">Agents</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              Your instance must be running to view agents.
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

  const data = await getAgents(inst.subdomain, inst.engineApiKey);
  const agents: EngineAgentResponse[] = data?.agents ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Agents</h1>
            <p className="text-zinc-400">Registered agents in your instance.</p>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        {agents.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">No agents yet.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {agents.map((agent) => (
              <div key={agent.id} className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium truncate">{agent.name}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        agent.status === "active"
                          ? "bg-green-900/50 text-green-400"
                          : "bg-amber-900/50 text-amber-400"
                      }`}
                    >
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm mt-1">{agent.role}</p>
                  {agent.pause_reason && (
                    <p className="text-amber-400/70 text-xs mt-1">Paused: {agent.pause_reason}</p>
                  )}
                </div>
                <div className="text-right text-sm flex-shrink-0 ml-4">
                  <p className="text-zinc-300">
                    {formatCents(agent.spent_monthly_cents)} / {formatCents(agent.budget_monthly_cents)}
                  </p>
                  <p className="text-zinc-500 text-xs">monthly budget</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
