import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getRoutines } from "@/lib/engine-client";
import type { EngineRoutineResponse } from "@/lib/engine-contracts";
import { formatDateTime } from "@/lib/format";

export default async function RoutinesPage() {
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
          <h1 className="text-2xl font-bold text-white mb-4">Routines</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              Your instance must be running to view routines.
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

  const data = await getRoutines(inst.subdomain, inst.engineApiKey);
  const routines: EngineRoutineResponse[] = data?.routines ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Routines</h1>
            <p className="text-zinc-400">Scheduled and recurring agent tasks.</p>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        {routines.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">No routines yet.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {routines.map((routine) => (
              <div key={routine.id} className="p-4">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-white font-medium truncate">{routine.name}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      routine.enabled
                        ? "bg-green-900/50 text-green-400"
                        : "bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {routine.enabled ? "enabled" : "disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400 mt-1">
                  <span className="bg-zinc-800 px-2 py-0.5 rounded">
                    {routine.trigger_type}: {routine.trigger_config}
                  </span>
                  <span>Next: {formatDateTime(routine.next_run_at)}</span>
                  <span>Runs: {routine.run_count}</span>
                  {routine.consecutive_failures > 0 && (
                    <span className="text-red-400">
                      {routine.consecutive_failures} consecutive failure{routine.consecutive_failures !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
