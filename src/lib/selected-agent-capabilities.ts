import { buildAgentCapabilities } from "@/lib/agent-capabilities";
import {
  getHermesDashboardUnavailableMessage,
  getHermesDashboardUrl,
  type HermesDashboardLinkage,
} from "@/lib/hermes-dashboard";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";

export interface SelectedAgentDashboardInstance {
  runtimeIdentityId: string | null;
  subdomain: string | null;
  hermesDashboardAuthStatus: HermesDashboardLinkage["authStatus"];
  hermesOidcClientId: string | null;
}

export function buildSelectedAgentCapabilities({
  agent,
  instance,
}: {
  agent: AgentDirectoryEntry;
  instance: SelectedAgentDashboardInstance | null;
}) {
  const exactInstance =
    instance?.runtimeIdentityId === agent.runtimeIdentityId ? instance : null;
  const linkage = exactInstance
    ? {
        authStatus: exactInstance.hermesDashboardAuthStatus,
        clientId: exactInstance.hermesOidcClientId,
      }
    : undefined;
  const dashboardUrl = exactInstance?.subdomain
    ? getHermesDashboardUrl(exactInstance.subdomain, linkage)
    : null;
  const dashboardUnavailableMessage = exactInstance
    ? getHermesDashboardUnavailableMessage(linkage)
    : null;

  return buildAgentCapabilities({
    agentKey: agent.key,
    dashboardUnavailableMessage,
    dashboardUrl,
    hasOpenChat: agent.workspace !== null,
  });
}
