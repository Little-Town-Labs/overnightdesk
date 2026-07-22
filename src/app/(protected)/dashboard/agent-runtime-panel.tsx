import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";

function runtimeStatusLabel(status: AgentDirectoryEntry["runtime"]["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "planned":
      return "Planned";
    case "suspended":
      return "Suspended";
    case "retired":
      return "Retired";
  }
}

export function AgentRuntimePanel({ agent }: { agent: AgentDirectoryEntry }) {
  const headingId = `agent-runtime-${agent.key}`;

  return (
    <section aria-labelledby={headingId} className="od-card p-5 sm:p-6">
      <h3
        className="text-xs font-medium uppercase tracking-wider"
        id={headingId}
        style={{
          color: "var(--color-od-text-2)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Runtime
      </h3>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs" style={{ color: "var(--color-od-text-3)" }}>
            Identity
          </dt>
          <dd
            className="mt-1 text-sm"
            style={{ color: "var(--color-od-text)", fontFamily: "var(--font-mono)" }}
          >
            {agent.runtime.slug}
          </dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: "var(--color-od-text-3)" }}>
            State
          </dt>
          <dd className="mt-1 text-sm" style={{ color: "var(--color-od-text)" }}>
            {runtimeStatusLabel(agent.runtime.status)}
          </dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: "var(--color-od-text-3)" }}>
            Access
          </dt>
          <dd className="mt-1 text-sm capitalize" style={{ color: "var(--color-od-text)" }}>
            {agent.membershipRole}
          </dd>
        </div>
      </dl>
    </section>
  );
}
