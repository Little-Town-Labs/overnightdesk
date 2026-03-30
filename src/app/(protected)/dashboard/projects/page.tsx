import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getProjects } from "@/lib/engine-client";
import type { EngineProjectResponse } from "@/lib/engine-contracts";
import { formatDate } from "@/lib/format";

function safeProjectColor(color: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#71717a";
}

export default async function ProjectsPage() {
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
          <h1 className="text-2xl font-bold text-white mb-4">Projects</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              Your instance must be running to view projects.
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

  const data = await getProjects(inst.subdomain, inst.engineApiKey);
  const projects: EngineProjectResponse[] = data?.projects ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-zinc-400">Organize issues into projects.</p>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        {projects.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">No projects yet.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {projects.map((project) => (
              <div key={project.id} className="p-4 flex items-start gap-3">
                <span
                  className="mt-1.5 w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: safeProjectColor(project.color) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium truncate">{project.name}</span>
                    <span className="bg-zinc-800 px-2 py-0.5 rounded text-xs text-zinc-400">
                      {project.status}
                    </span>
                  </div>
                  {project.description && (
                    <p className="text-zinc-400 text-sm mt-1 truncate">{project.description}</p>
                  )}
                </div>
                <div className="text-right text-xs text-zinc-500 flex-shrink-0 ml-4">
                  {project.target_date ? (
                    <p>Target: {formatDate(project.target_date)}</p>
                  ) : (
                    <p>No target date</p>
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
