import type { AgentWorkspace } from "@/lib/open-webui-workspace";
import Image from "next/image";
import { AgentSelector } from "../agent-selector";

export function OpenChatUnavailable({
  reason = "unverified",
}: {
  reason?: "unverified" | "not-configured";
}) {
  const unavailableMessage =
    reason === "not-configured"
      ? "None of your authorized agents has an active Open Chat workspace yet. Continue through your existing approved agent channels."
      : "Your authorized workspace assignments could not be safely verified. Refresh after access is restored or continue through your existing approved agent channels.";

  return (
    <section className="flex min-h-[calc(100dvh-12rem)] w-full items-center justify-center">
      <div
        className="od-card max-w-xl px-6 py-16 text-center"
        role="alert"
      >
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-od-text)" }}
        >
          Open Chat is unavailable
        </h2>
        <p
          className="mt-2 text-sm leading-6"
          style={{ color: "var(--color-od-text-2)" }}
        >
          {unavailableMessage}
        </p>
      </div>
    </section>
  );
}

export function OpenWebuiWorkspace({
  selected,
  workspaces,
}: {
  selected: AgentWorkspace;
  workspaces: AgentWorkspace[];
}) {
  return (
    <section className="flex min-h-[calc(100dvh-12rem)] w-full flex-col gap-3">
      <AgentSelector
        agents={workspaces}
        basePath="/dashboard/chat"
        selectedKey={selected.key}
      />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            alt={selected.identity.logo.alt}
            className="h-11 w-11 shrink-0 rounded-xl"
            height={44}
            priority
            src={selected.identity.logo.src}
            width={44}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: "var(--color-status-running)" }}
              />
              <p
                className="text-xs font-medium uppercase tracking-widest"
                style={{
                  color: "var(--color-od-accent)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Open Chat
              </p>
            </div>
            <h2
              className="mt-1 text-xl font-bold tracking-tight"
              style={{
                color: "var(--color-od-text)",
                fontFamily: "var(--font-display)",
              }}
            >
              {selected.identity.name}
            </h2>
            <p className="text-sm" style={{ color: "var(--color-od-text-2)" }}>
              {selected.useCaseName}
            </p>
          </div>
        </div>
        <a
          className="self-start rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:self-auto"
          href="/dashboard"
          style={{
            borderColor: "var(--color-od-border)",
            color: "var(--color-od-text-2)",
          }}
        >
          Back to Overview
        </a>
      </header>

      <div
        className="od-card flex min-h-[32rem] flex-1 overflow-hidden lg:min-h-0"
        data-testid="open-webui-frame"
      >
        <iframe
          allow="clipboard-write"
          className="min-h-full w-full flex-1 border-0"
          src={selected.workspaceUrl}
          title={`${selected.identity.name} chat workspace`}
        />
      </div>

      <aside
        aria-label={`Other ways to reach ${selected.identity.name}`}
        className="rounded-lg border px-3 py-2"
        style={{
          background: "var(--color-od-raised)",
          borderColor: "var(--color-od-border)",
        }}
      >
        <p
          className="text-xs leading-5"
          style={{ color: "var(--color-od-text-2)" }}
        >
          {selected.fallbackMessage}
        </p>
      </aside>
    </section>
  );
}
