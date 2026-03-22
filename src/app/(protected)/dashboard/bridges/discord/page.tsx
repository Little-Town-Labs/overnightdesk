import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getDiscordConfig } from "@/lib/engine-client";
import { DiscordWizard } from "./discord-wizard";

export default async function DiscordBridgePage() {
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
          <h1 className="text-2xl font-bold text-white mb-4">Discord Bridge Setup</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              Your instance must be running to configure the Discord bridge.
            </p>
            <a
              href="/dashboard/bridges"
              className="text-indigo-400 hover:text-indigo-300 underline text-sm mt-2 inline-block"
            >
              Back to Bridges
            </a>
          </div>
        </div>
      </div>
    );
  }

  const config = await getDiscordConfig(inst.subdomain, inst.engineApiKey);

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Discord Bridge Setup</h1>
            <p className="text-zinc-400">
              Connect a Discord bot to interact with your assistant.
            </p>
          </div>
          <a
            href="/dashboard/bridges"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Bridges
          </a>
        </div>

        <DiscordWizard initialConfig={config} />
      </div>
    </div>
  );
}
