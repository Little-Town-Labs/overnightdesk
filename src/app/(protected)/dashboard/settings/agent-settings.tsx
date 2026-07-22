import type { AgentCapability } from "@/lib/agent-capabilities";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AgentCapabilityList } from "../agent-capability-list";
import { AgentIdentityHeader } from "../agent-identity-header";
import { AgentRuntimePanel } from "../agent-runtime-panel";
import { AgentSelector } from "../agent-selector";
import { AgentCredentials } from "./agent-credentials";

export function AgentSettings({
  agents,
  capabilities,
  selected,
  statusLabel,
}: {
  agents: readonly AgentDirectoryEntry[];
  capabilities: readonly AgentCapability[];
  selected: AgentDirectoryEntry;
  statusLabel: string;
}) {
  return (
    <div className="space-y-3">
      <AgentSelector
        agents={agents}
        basePath="/dashboard/settings"
        selectedKey={selected.key}
      />
      <AgentIdentityHeader agent={selected} statusLabel={statusLabel} />
      <AgentRuntimePanel agent={selected} />
      <AgentCapabilityList capabilities={capabilities} />
      <AgentCredentials agent={selected} />
    </div>
  );
}
