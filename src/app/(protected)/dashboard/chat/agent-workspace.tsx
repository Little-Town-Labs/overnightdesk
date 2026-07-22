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
        {chat.workspace && (
          <a
            className="inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors"
            href={chat.workspace.workspaceUrl}
            rel="noopener noreferrer"
            target="_blank"
            style={{
              background: "var(--color-od-raised)",
              borderColor: "var(--color-od-border)",
              color: "var(--color-od-text)",
            }}
          >
            Open Chat in New Window
          </a>
        )}
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

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
        {chat.workspace ? (
          <div
            className="od-card flex h-[calc(100dvh-2rem)] min-h-[32rem] overflow-hidden lg:min-h-[48rem]"
            data-testid="open-webui-frame"
          >
            <iframe
              allow="clipboard-write"
              className="h-full w-full border-0"
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

        <aside
          aria-label={`${agent.identity.name} workspace context`}
          className="space-y-3 xl:sticky xl:top-3"
        >
          <AgentIdentityHeader agent={agent} statusLabel="Agent workspace" />
          <AgentCapabilityList capabilities={[chat, dashboard]} />
          {chat.workspace && (
            <div
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
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
