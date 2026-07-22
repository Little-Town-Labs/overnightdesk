import type { ManagedVariableControlDescriptor } from "@/lib/managed-agent-variable";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { ManagedAgentVariableReplacementForm } from "./managed-agent-variable-replacement-form";

export function ManagedAgentVariables({
  agent,
  variables,
}: {
  agent: AgentDirectoryEntry;
  variables: readonly ManagedVariableControlDescriptor[];
}) {
  const headingId = `agent-configuration-${agent.key}`;
  const hasWritableVariable = variables.some(
    (variable) => variable.availability === "write_only",
  );

  return (
    <section aria-labelledby={headingId} className="od-card p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold" id={headingId} style={{ color: "var(--color-od-text)" }}>
            Agent configuration
          </h3>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--color-od-text-2)" }}>
            Existing values are never displayed. Only cataloged replacements with an exact reviewed boundary can be enabled.
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium uppercase tracking-wider" style={{ color: hasWritableVariable ? "var(--color-od-accent)" : "var(--color-od-text-3)", fontFamily: "var(--font-mono)" }}>
          {hasWritableVariable ? "Write only" : "Read only"}
        </span>
      </div>

      <div className="mt-5 divide-y" style={{ borderColor: "var(--color-od-border)" }}>
        {variables.map((variable) =>
          variable.availability === "write_only" ? (
            <ManagedAgentVariableReplacementForm
              agentKey={agent.key}
              key={variable.id}
              variable={variable as ManagedVariableControlDescriptor & { availability: "write_only" }}
            />
          ) : (
            <div className="py-3 first:pt-0 last:pb-0" key={variable.id}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--color-od-text)" }}>
                    {variable.label}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-od-text-3)" }}>
                    {variable.help} {variable.availabilityDetail}
                  </p>
                </div>
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-od-text-3)", fontFamily: "var(--font-mono)" }}>
                  Read only
                </span>
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
