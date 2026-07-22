import type { AgentCapability } from "@/lib/agent-capabilities";
import type {
  AgentDirectoryEntry,
  AgentWorkspace,
} from "@/lib/open-webui-workspace";

type ChatCapability = AgentCapability & {
  id: "open_chat";
  workspace: AgentWorkspace | null;
};

type DashboardCapability = AgentCapability & {
  id: "advanced_dashboard";
};

export type AgentWorkspaceComposition =
  | {
      status: "available";
      agent: AgentDirectoryEntry;
      chat: ChatCapability;
      dashboard: DashboardCapability;
    }
  | { status: "unavailable" };

function hasValidActionState(capability: AgentCapability): boolean {
  return capability.state === "available"
    ? capability.action !== undefined
    : capability.action === undefined;
}

function hasSafeChatContract(
  agent: AgentDirectoryEntry,
  capability: AgentCapability,
): boolean {
  if (!hasValidActionState(capability)) return false;
  if (capability.state !== "available") return agent.workspace === null;
  if (!agent.workspace || agent.workspace.key !== agent.key) return false;

  return (
    capability.action?.external !== true &&
    capability.action?.href ===
      `/dashboard/chat?agent=${encodeURIComponent(agent.key)}`
  );
}

function hasSafeDashboardContract(capability: AgentCapability): boolean {
  if (!hasValidActionState(capability)) return false;
  if (capability.state !== "available") return true;
  if (capability.action?.external !== true) return false;

  try {
    const target = new URL(capability.action.href);
    return (
      target.protocol === "https:" &&
      !target.username &&
      !target.password &&
      !target.port &&
      !target.hash &&
      target.hostname === target.hostname.toLowerCase() &&
      target.hostname.endsWith(".overnightdesk.com")
    );
  } catch {
    return false;
  }
}

export function buildAgentWorkspaceComposition({
  agent,
  capabilities,
}: {
  agent: AgentDirectoryEntry;
  capabilities: readonly AgentCapability[];
}): AgentWorkspaceComposition {
  if (capabilities.length !== 2) return { status: "unavailable" };

  const chatCapabilities = capabilities.filter(
    (capability) => capability.id === "open_chat",
  );
  const dashboardCapabilities = capabilities.filter(
    (capability) => capability.id === "advanced_dashboard",
  );
  if (chatCapabilities.length !== 1 || dashboardCapabilities.length !== 1) {
    return { status: "unavailable" };
  }

  const [chat] = chatCapabilities;
  const [dashboard] = dashboardCapabilities;
  if (
    !hasSafeChatContract(agent, chat) ||
    !hasSafeDashboardContract(dashboard)
  ) {
    return { status: "unavailable" };
  }

  return {
    status: "available",
    agent,
    chat: { ...chat, id: "open_chat", workspace: agent.workspace },
    dashboard: { ...dashboard, id: "advanced_dashboard" },
  };
}
