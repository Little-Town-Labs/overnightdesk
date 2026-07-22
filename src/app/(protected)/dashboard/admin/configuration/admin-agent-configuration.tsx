import type { AgentCapability } from "@/lib/agent-capabilities";
import type { ManagedVariableControlDescriptor } from "@/lib/managed-agent-variable";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { SelectedAgentConfiguration } from "../../selected-agent-configuration";

export function AdminAgentConfiguration({
  agents,
  capabilities,
  managedVariables,
  selected,
  statusLabel,
}: {
  agents: readonly AgentDirectoryEntry[];
  capabilities: readonly AgentCapability[];
  managedVariables: readonly ManagedVariableControlDescriptor[];
  selected: AgentDirectoryEntry;
  statusLabel: string;
}) {
  return (
    <section aria-labelledby="admin-configuration-heading" className="space-y-4">
      <div>
        <p
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--color-od-accent)", fontFamily: "var(--font-mono)" }}
        >
          Selected-agent scope
        </p>
        <h2
          className="mt-1 text-xl font-semibold"
          id="admin-configuration-heading"
          style={{ color: "var(--color-od-text)" }}
        >
          Configuration
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-od-text-2)" }}>
          Review configuration availability for one authorized runtime at a time.
        </p>
      </div>
      <SelectedAgentConfiguration
        agents={agents}
        basePath="/dashboard/admin/configuration"
        capabilities={capabilities}
        managedVariables={managedVariables}
        selected={selected}
        statusLabel={statusLabel}
      />
    </section>
  );
}
