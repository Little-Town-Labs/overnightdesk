import type { AgentIdentity } from "@/lib/open-webui-workspace";
import Image from "next/image";

interface SelectableAgent {
  key: string;
  identity: AgentIdentity;
}

export function AgentSelector({
  agents,
  basePath,
  selectedKey,
}: {
  agents: readonly SelectableAgent[];
  basePath:
    | "/dashboard"
    | "/dashboard/chat"
    | "/dashboard/settings"
    | "/dashboard/admin/configuration";
  selectedKey: string;
}) {
  return (
    <nav aria-label="Choose agent" className="flex flex-wrap gap-2">
      {agents.map((agent) => {
        const selected = agent.key === selectedKey;
        return (
          <a
            aria-current={selected ? "page" : undefined}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            href={`${basePath}?agent=${agent.key}`}
            key={agent.key}
            style={{
              background: selected
                ? "var(--color-od-accent-bg)"
                : "var(--color-od-raised)",
              borderColor: selected
                ? "var(--color-od-accent-dim)"
                : "var(--color-od-border)",
              color: selected
                ? "var(--color-od-text)"
                : "var(--color-od-text-2)",
            }}
          >
            <Image
              alt=""
              aria-hidden="true"
              className="h-7 w-7 rounded-md"
              height={28}
              src={agent.identity.logo.src}
              width={28}
            />
            {agent.identity.name}
          </a>
        );
      })}
    </nav>
  );
}
