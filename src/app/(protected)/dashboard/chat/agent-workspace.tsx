import type { AgentWorkspaceComposition } from "@/lib/agent-workspace";
import { getAgentCapabilityStateLabel } from "@/lib/agent-capabilities";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AgentCapabilityList } from "../agent-capability-list";
import { AgentIdentityHeader } from "../agent-identity-header";
import { AgentSelector } from "../agent-selector";

type AvailableComposition = Extract<
  AgentWorkspaceComposition,
  { status: "available" }
>;

export function AgentWorkspace({
  agents,
  composition,
}: {
  agents: readonly AgentDirectoryEntry[];
  composition: AvailableComposition;
}) {
  const { agent, chat, dashboard } = composition;

  return (
    <section className="flex min-h-[calc(100dvh-12rem)] w-full flex-col gap-3">
      <AgentSelector
        agents={agents}
        basePath="/dashboard/chat"
        selectedKey={agent.key}
      />

      <AgentIdentityHeader agent={agent} statusLabel="Agent workspace" />
      <AgentCapabilityList capabilities={[chat, dashboard]} />

      <nav
        aria-label={`${agent.identity.name} workspace actions`}
        className="flex flex-wrap items-center gap-2"
      >
        <a
          className="inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors"
          href="/dashboard"
          style={{
            background: "var(--color-od-raised)",
            borderColor: "var(--color-od-border)",
            color: "var(--color-od-text)",
          }}
        >
          Back to Overview
        </a>
        {dashboard.action && (
          <a
            className="btn-accent inline-flex items-center rounded-lg px-4 py-2.5 text-sm"
            href={dashboard.action.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open Advanced Dashboard
          </a>
        )}
      </nav>

      {chat.workspace ? (
        <div
          className="od-card flex min-h-[32rem] flex-1 overflow-hidden lg:min-h-0"
          data-testid="open-webui-frame"
        >
          <iframe
            allow="clipboard-write"
            className="min-h-full w-full flex-1 border-0"
            src={chat.workspace.workspaceUrl}
            title={`${agent.identity.name} chat workspace`}
          />
        </div>
      ) : (
        <div className="od-card flex min-h-64 items-center justify-center p-6" role="status">
          <div className="max-w-xl text-center">
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--color-od-text)" }}
            >
              Open Chat is {getAgentCapabilityStateLabel(chat.state).toLowerCase()}
            </h3>
            <p
              className="mt-2 text-sm leading-6"
              style={{ color: "var(--color-od-text-2)" }}
            >
              {chat.detail}
            </p>
          </div>
        </div>
      )}

      {chat.workspace && (
        <aside
          aria-label={`Other ways to reach ${agent.identity.name}`}
          className="rounded-lg border px-3 py-2"
          style={{
            background: "var(--color-od-raised)",
            borderColor: "var(--color-od-border)",
          }}
        >
          <p
            className="text-xs leading-5"
            style={{ color: "var(--color-od-text-2)" }}
          >
            {chat.workspace.fallbackMessage}
          </p>
        </aside>
      )}
    </section>
  );
}
