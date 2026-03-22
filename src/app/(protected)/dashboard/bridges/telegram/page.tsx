import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getTelegramConfig } from "@/lib/engine-client";
import { TelegramWizard } from "./telegram-wizard";

export default async function TelegramBridgePage() {
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
          <h1 className="text-2xl font-bold text-white mb-4">Telegram Bridge Setup</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              Your instance must be running to configure the Telegram bridge.
            </p>
            <a
              href="/dashboard/bridges"
              className="text-blue-400 hover:text-blue-300 underline text-sm mt-2 inline-block"
            >
              Back to Bridges
            </a>
          </div>
        </div>
      </div>
    );
  }

  const config = await getTelegramConfig(inst.subdomain, inst.engineApiKey);

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Telegram Bridge Setup</h1>
            <p className="text-zinc-400">
              Connect a Telegram bot to interact with your assistant.
            </p>
          </div>
          <a
            href="/dashboard/bridges"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Bridges
          </a>
        </div>

        <TelegramWizard initialConfig={config} />
      </div>
    </div>
  );
}
