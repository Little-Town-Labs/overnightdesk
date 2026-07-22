import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AgentSelector } from "./agent-selector";
import { AgentIdentityHeader } from "./agent-identity-header";
import { AgentRuntimePanel } from "./agent-runtime-panel";
import {
  AgentCapabilityList,
  type AgentCapability,
} from "./agent-capability-list";

export function AgentOverview({
  agents,
  capabilities,
  selected,
  statusLabel,
}: {
  agents: AgentDirectoryEntry[];
  capabilities: readonly AgentCapability[];
  selected: AgentDirectoryEntry;
  statusLabel: string;
}) {
  const actions = capabilities.flatMap((capability) =>
    capability.action
      ? [{ ...capability.action, label: capability.label }]
      : [],
  );

  return (
    <section className="space-y-3">
      <AgentSelector
        agents={agents}
        basePath="/dashboard"
        selectedKey={selected.key}
      />

      <AgentIdentityHeader
        actions={actions}
        agent={selected}
        statusLabel={statusLabel}
      />

      <AgentRuntimePanel agent={selected} />
      <AgentCapabilityList capabilities={capabilities} />
    </section>
  );
}
