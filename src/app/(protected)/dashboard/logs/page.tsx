import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getEngineLogs } from "@/lib/engine-client";
import { LogViewer } from "./log-viewer";

export default async function LogsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const inst = await getInstanceForUser(session.user.id);

  if (!inst || inst.status !== "running" || !inst.subdomain || !inst.engineApiKey) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
        <p className="text-zinc-400">No running instance.</p>
        <p className="text-zinc-500 text-sm mt-1">
          Logs will appear here once your instance is running.
        </p>
      </div>
    );
  }

  const logs = await getEngineLogs(inst.subdomain, inst.engineApiKey);

  return <LogViewer initialLines={logs} />;
}
