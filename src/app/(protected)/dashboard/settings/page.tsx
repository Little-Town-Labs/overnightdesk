import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveAgentDirectory } from "@/lib/open-webui-workspace";
import {
  getSelectedAgentStatusLabel,
  resolveSelectedAgentContext,
} from "@/lib/selected-agent-context";
import { buildAgentCapabilities } from "@/lib/agent-capabilities";
import {
  getHermesDashboardUnavailableMessage,
  getHermesDashboardUrl,
} from "@/lib/hermes-dashboard";
import { ChangePassword } from "./change-password";
import { DeleteAccount } from "./delete-account";
import { AgentSettings } from "./agent-settings";
import { SettingsSurface } from "./settings-surface";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const [instances, directory] = await Promise.all([
    db.select().from(instance).where(eq(instance.userId, session.user.id)),
    resolveAgentDirectory(session.user.id),
  ]);
  const rawAgent = (await searchParams).agent;
  if (Array.isArray(rawAgent)) notFound();

  const resolution = resolveSelectedAgentContext(
    directory,
    rawAgent,
    instances,
  );
  if (resolution.status === "not_found") notFound();

  const accountProps = {
    accountSecurity: <ChangePassword />,
    dangerZone: <DeleteAccount />,
    email: session.user.email,
    name: session.user.name,
  };

  if (resolution.status !== "available") {
    return <SettingsSurface {...accountProps} agentState={resolution.status} />;
  }

  const { agent, instance: selectedInstance } = resolution.selected;
  const dashboardUrl = selectedInstance?.subdomain
    ? getHermesDashboardUrl(selectedInstance.subdomain, {
        authStatus: selectedInstance.hermesDashboardAuthStatus,
        clientId: selectedInstance.hermesOidcClientId,
      })
    : null;
  const dashboardUnavailableMessage = selectedInstance
    ? getHermesDashboardUnavailableMessage({
        authStatus: selectedInstance.hermesDashboardAuthStatus,
        clientId: selectedInstance.hermesOidcClientId,
      })
    : null;
  const capabilities = buildAgentCapabilities({
    agentKey: agent.key,
    dashboardUnavailableMessage,
    dashboardUrl,
    hasOpenChat: agent.workspace !== null,
  });

  return (
    <SettingsSurface
      {...accountProps}
      agentContent={
        <AgentSettings
          agents={resolution.agents}
          capabilities={capabilities}
          selected={agent}
          statusLabel={getSelectedAgentStatusLabel(agent, selectedInstance)}
        />
      }
    />
  );
}
