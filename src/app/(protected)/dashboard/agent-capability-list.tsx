import type {
  AgentCapability,
  AgentCapabilityState,
} from "@/lib/agent-capabilities";

export type { AgentCapability } from "@/lib/agent-capabilities";

function stateLabel(state: AgentCapabilityState): string {
  switch (state) {
    case "available":
      return "Available";
    case "not_deployed":
      return "Not deployed";
    case "unavailable":
      return "Unavailable";
    case "not_applicable":
      return "Not applicable";
  }
}

export function AgentCapabilityList({
  capabilities,
}: {
  capabilities: readonly AgentCapability[];
}) {
  return (
    <section aria-labelledby="agent-capabilities" className="od-card p-5 sm:p-6">
      <h3
        className="text-xs font-medium uppercase tracking-wider"
        id="agent-capabilities"
        style={{
          color: "var(--color-od-text-2)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Capabilities
      </h3>
      <ul className="mt-4 divide-y" style={{ borderColor: "var(--color-od-border)" }}>
        {capabilities.map((capability) => (
          <li
            className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            key={capability.id}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-od-text)" }}>
                {capability.label}
              </p>
              {capability.detail && (
                <p className="mt-1 text-xs" style={{ color: "var(--color-od-text-3)" }}>
                  {capability.detail}
                </p>
              )}
            </div>
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{
                color:
                  capability.state === "available"
                    ? "var(--color-od-accent)"
                    : "var(--color-od-text-3)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {stateLabel(capability.state)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
