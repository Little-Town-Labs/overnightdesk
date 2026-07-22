import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";

const candidateVariables = [
  {
    label: "OpenRouter API key",
    detail: "Model-provider credential used by the selected runtime.",
  },
  {
    label: "Telegram bridge",
    detail: "Bot token and approved-user configuration for messaging access.",
  },
] as const;

export function AgentCredentials({ agent }: { agent: AgentDirectoryEntry }) {
  const headingId = `agent-configuration-${agent.key}`;

  return (
    <section aria-labelledby={headingId} className="od-card p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3
            className="text-lg font-semibold"
            id={headingId}
            style={{ color: "var(--color-od-text)" }}
          >
            Agent configuration
          </h3>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--color-od-text-2)" }}>
            Existing values are never displayed. Replacement controls remain unavailable until this runtime has one reviewed secret boundary and audit-safe provisioner support.
          </p>
        </div>
        <span
          className="shrink-0 text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--color-od-text-3)", fontFamily: "var(--font-mono)" }}
        >
          Read only
        </span>
      </div>

      <ul className="mt-5 divide-y" style={{ borderColor: "var(--color-od-border)" }}>
        {candidateVariables.map((variable) => (
          <li className="py-3 first:pt-0 last:pb-0" key={variable.label}>
            <p className="text-sm font-medium" style={{ color: "var(--color-od-text)" }}>
              {variable.label}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-od-text-3)" }}>
              {variable.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
