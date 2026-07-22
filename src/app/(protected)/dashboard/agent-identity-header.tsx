import Image from "next/image";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";

export function AgentIdentityHeader({
  agent,
  actions,
  statusLabel,
}: {
  agent: AgentDirectoryEntry;
  actions?: readonly {
    href: string;
    label: string;
    external?: boolean;
    primary?: boolean;
  }[];
  statusLabel: string;
}) {
  return (
    <div className="od-card p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Image
            alt={agent.identity.logo.alt}
            className="h-14 w-14 shrink-0 rounded-xl"
            height={56}
            priority
            src={agent.identity.logo.src}
            width={56}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: "var(--color-status-running)" }}
              />
              <span
                className="text-xs font-medium uppercase tracking-widest"
                style={{
                  color: "var(--color-od-accent)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {statusLabel}
              </span>
            </div>
            <h2
              className="mt-1 text-3xl font-extrabold tracking-tight"
              style={{
                color: "var(--color-od-text)",
                fontFamily: "var(--font-display)",
              }}
            >
              {agent.identity.name}
            </h2>
            <p className="text-sm" style={{ color: "var(--color-od-text-2)" }}>
              {agent.useCaseName}
            </p>
          </div>
        </div>

        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {actions.map((action) => (
              <a
                className={
                  action.primary
                    ? "btn-accent inline-flex items-center rounded-lg px-4 py-2.5 text-sm"
                    : "inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors"
                }
                href={action.href}
                key={`${action.label}:${action.href}`}
                rel={action.external ? "noopener noreferrer" : undefined}
                style={
                  action.primary
                    ? undefined
                    : {
                        background: "var(--color-od-raised)",
                        borderColor: "var(--color-od-border)",
                        color: "var(--color-od-text)",
                      }
                }
                target={action.external ? "_blank" : undefined}
              >
                {action.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
