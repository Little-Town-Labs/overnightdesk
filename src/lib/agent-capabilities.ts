export type AgentCapabilityState =
  | "available"
  | "not_deployed"
  | "unavailable"
  | "not_applicable";

export interface AgentCapabilityAction {
  href: string;
  external?: boolean;
  primary?: boolean;
}

export interface AgentCapability {
  id: "open_chat" | "advanced_dashboard";
  label: string;
  state: AgentCapabilityState;
  detail: string;
  action?: AgentCapabilityAction;
}

export function buildAgentCapabilities({
  agentKey,
  dashboardUnavailableMessage,
  dashboardUrl,
  hasOpenChat,
}: {
  agentKey: string;
  dashboardUnavailableMessage: string | null;
  dashboardUrl: string | null;
  hasOpenChat: boolean;
}): AgentCapability[] {
  return [
    {
      id: "open_chat",
      label: "Open Chat",
      state: hasOpenChat ? "available" : "not_deployed",
      detail: hasOpenChat
        ? "Stateful chat is assigned to this runtime."
        : "No Open Chat deployment is assigned to this runtime.",
      action: hasOpenChat
        ? {
            href: `/dashboard/chat?agent=${encodeURIComponent(agentKey)}`,
            primary: true,
          }
        : undefined,
    },
    {
      id: "advanced_dashboard",
      label: "Advanced Dashboard",
      state: dashboardUrl
        ? "available"
        : dashboardUnavailableMessage
          ? "unavailable"
          : "not_deployed",
      detail: dashboardUrl
        ? "The runtime's advanced management surface is available."
        : dashboardUnavailableMessage ??
          "No advanced dashboard is assigned to this runtime.",
      action: dashboardUrl
        ? { href: dashboardUrl, external: true }
        : undefined,
    },
  ];
}
