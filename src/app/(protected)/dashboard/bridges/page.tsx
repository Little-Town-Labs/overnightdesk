import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser } from "@/lib/instance";
import { getTelegramConfig, getDiscordConfig } from "@/lib/engine-client";
import { BridgeStatusCard } from "./bridge-status-card";

export default async function BridgesPage() {
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
          <h1 className="text-2xl font-bold text-white mb-4">Messaging Bridges</h1>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-zinc-400">
              Your instance must be running to configure messaging bridges.
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

  const [telegramConfig, discordConfig] = await Promise.all([
    getTelegramConfig(inst.subdomain, inst.engineApiKey),
    getDiscordConfig(inst.subdomain, inst.engineApiKey),
  ]);

  // Strip sensitive fields before passing to client component
  const safeTelegram = telegramConfig ? { ...telegramConfig, bot_token: undefined } : null;
  const safeDiscord = discordConfig ? { ...discordConfig, bot_token: undefined } : null;

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Messaging Bridges</h1>
            <p className="text-zinc-400">
              Connect Telegram or Discord to interact with your assistant via chat.
            </p>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <BridgeStatusCard
            type="telegram"
            config={safeTelegram}
            instanceSubdomain={inst.subdomain}
          />
          <BridgeStatusCard
            type="discord"
            config={safeDiscord}
            instanceSubdomain={inst.subdomain}
          />
        </div>
      </div>
    </div>
  );
}
