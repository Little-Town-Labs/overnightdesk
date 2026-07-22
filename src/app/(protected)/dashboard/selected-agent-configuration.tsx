import type { AgentCapability } from "@/lib/agent-capabilities";
import type { ManagedVariableControlDescriptor } from "@/lib/managed-agent-variable";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AgentCapabilityList } from "./agent-capability-list";
import { AgentIdentityHeader } from "./agent-identity-header";
import { AgentRuntimePanel } from "./agent-runtime-panel";
import { AgentSelector } from "./agent-selector";
import { ManagedAgentVariables } from "./managed-agent-variables";

export function SelectedAgentConfiguration({
  agents,
  basePath = "/dashboard/settings",
  capabilities,
  managedVariables,
  selected,
  statusLabel,
}: {
  agents: readonly AgentDirectoryEntry[];
  basePath?: "/dashboard/settings" | "/dashboard/admin/configuration";
  capabilities: readonly AgentCapability[];
  managedVariables: readonly ManagedVariableControlDescriptor[];
  selected: AgentDirectoryEntry;
  statusLabel: string;
}) {
  return (
    <div className="space-y-3">
      <AgentSelector
        agents={agents}
        basePath={basePath}
        selectedKey={selected.key}
      />
      <AgentIdentityHeader agent={selected} statusLabel={statusLabel} />
      <AgentRuntimePanel agent={selected} />
      <AgentCapabilityList capabilities={capabilities} />
      <ManagedAgentVariables agent={selected} variables={managedVariables} />
    </div>
  );
}
