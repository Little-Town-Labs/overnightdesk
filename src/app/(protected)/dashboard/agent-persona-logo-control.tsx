"use client";

import { useRef, useState, type FormEvent } from "react";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";

const ACCEPTED_LOGO_TYPES = "image/png,image/jpeg,image/webp";
const MAX_LOGO_BYTES = 256 * 1024;

export function AgentPersonaLogoControl({
  agent,
}: {
  agent: AgentDirectoryEntry;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const isOwner = agent.membershipRole === "owner";

  async function submitLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("agent-logo");
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
      setMessage("Choose a logo image first.");
      return;
    }

    const [logo] = input.files;
    if (!ACCEPTED_LOGO_TYPES.split(",").includes(logo.type)) {
      setMessage("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (logo.size > MAX_LOGO_BYTES) {
      setMessage("The logo must be 256 KiB or smaller.");
      return;
    }

    const body = new FormData();
    body.set("runtimeIdentityId", agent.runtimeIdentityId);
    body.set("logo", logo);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/agent-identity/logo", {
        method: "POST",
        body,
      });
      if (!response.ok) {
        setMessage("The logo could not be updated. Try again.");
        return;
      }
      formRef.current?.reset();
      setMessage("Agent logo updated.");
      window.location.reload();
    } catch {
      setMessage("The logo could not be updated. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function restoreDefault() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/agent-identity/logo", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runtimeIdentityId: agent.runtimeIdentityId }),
      });
      if (!response.ok) {
        setMessage("The default logo could not be restored. Try again.");
        return;
      }
      setMessage("Default agent logo restored.");
      window.location.reload();
    } catch {
      setMessage("The default logo could not be restored. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby={`agent-logo-${agent.key}`}
      className="od-card p-5 sm:p-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3
            className="text-lg font-semibold"
            id={`agent-logo-${agent.key}`}
            style={{ color: "var(--color-od-text)" }}
          >
            Agent logo
          </h3>
          <p
            className="mt-1 max-w-2xl text-sm"
            style={{ color: "var(--color-od-text-2)" }}
          >
            This mark follows {agent.identity.name} across the agent selector,
            workspace, and chat model presentation.
          </p>
        </div>
        <span
          className="shrink-0 text-xs font-medium uppercase tracking-wider"
          style={{
            color: isOwner
              ? "var(--color-od-accent)"
              : "var(--color-od-text-3)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {isOwner ? "Owner control" : "Read only"}
        </span>
      </div>

      {isOwner ? (
        <form className="mt-5 space-y-3" onSubmit={submitLogo} ref={formRef}>
          <label
            className="block text-sm font-medium"
            htmlFor={`agent-logo-input-${agent.key}`}
            style={{ color: "var(--color-od-text)" }}
          >
            Choose a replacement
          </label>
          <input
            accept={ACCEPTED_LOGO_TYPES}
            className="block w-full rounded-lg border p-2 text-sm"
            disabled={pending}
            id={`agent-logo-input-${agent.key}`}
            name="agent-logo"
            type="file"
          />
          <p className="text-xs" style={{ color: "var(--color-od-text-3)" }}>
            PNG, JPEG, or WebP. Maximum 256 KiB.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-accent rounded-lg px-4 py-2 text-sm"
              disabled={pending}
              type="submit"
            >
              {pending ? "Saving..." : "Save agent logo"}
            </button>
            {agent.identity.logo.custom && (
              <button
                className="rounded-lg border px-4 py-2 text-sm font-medium"
                disabled={pending}
                onClick={restoreDefault}
                style={{
                  borderColor: "var(--color-od-border)",
                  color: "var(--color-od-text)",
                }}
                type="button"
              >
                Restore default logo
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="mt-5 text-sm" style={{ color: "var(--color-od-text-2)" }}>
          Only an owner can replace this agent logo.
        </p>
      )}
      <p aria-live="polite" className="mt-3 text-sm" role="status">
        {message}
      </p>
    </section>
  );
}
