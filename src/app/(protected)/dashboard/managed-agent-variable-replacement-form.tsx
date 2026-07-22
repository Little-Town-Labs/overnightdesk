"use client";

import { useState } from "react";
import type { ManagedVariableControlDescriptor } from "@/lib/managed-agent-variable";

export function ManagedAgentVariableReplacementForm({
  agentKey,
  variable,
}: {
  agentKey: string;
  variable: ManagedVariableControlDescriptor & { availability: "write_only" };
}) {
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const inputId = `managed-variable-${agentKey}-${variable.id}`;

  async function replaceValue(event: React.FormEvent) {
    event.preventDefault();
    if (!value || !confirmed || submitting) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/agent-variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentKey,
          variableId: variable.id,
          value,
          requestId: crypto.randomUUID(),
          confirmation: variable.confirmation,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setMessage({
          kind: "error",
          text:
            result.error?.message ??
            "The replacement could not be completed. No value was returned.",
        });
        return;
      }

      setValue("");
      setConfirmed(false);
      setMessage({
        kind: "success",
        text: "Replacement completed and the declared runtime action finished.",
      });
    } catch {
      setMessage({
        kind: "error",
        text: "The replacement service is temporarily unavailable.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      aria-label={`Replace ${variable.label}`}
      className="space-y-4 py-4 first:pt-0 last:pb-0"
      onSubmit={replaceValue}
    >
      <div>
        <label
          className="text-sm font-medium"
          htmlFor={inputId}
          style={{ color: "var(--color-od-text)" }}
        >
          {variable.label}
        </label>
        <p className="mt-1 text-xs" style={{ color: "var(--color-od-text-3)" }}>
          {variable.help} {variable.availabilityDetail}
        </p>
      </div>
      <input
        autoComplete="new-password"
        className="w-full max-w-xl rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        id={inputId}
        name="replacement-value"
        onChange={(event) => {
          setValue(event.target.value);
          setMessage(null);
        }}
        required
        style={{
          background: "var(--color-od-base)",
          borderColor: "var(--color-od-border)",
          color: "var(--color-od-text)",
        }}
        type={variable.sensitivity === "secret" ? "password" : "text"}
        value={value}
      />
      <label className="flex max-w-xl items-start gap-2 text-xs" style={{ color: "var(--color-od-text-2)" }}>
        <input
          checked={confirmed}
          className="mt-0.5"
          name="confirm-runtime-effect"
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />
        I understand this replacement requires a {variable.runtimeEffect} and the existing value cannot be recovered here.
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn-accent rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!value || !confirmed || submitting}
          type="submit"
        >
          {submitting ? "Replacing..." : "Replace value"}
        </button>
        {message && (
          <p
            aria-live="polite"
            className={message.kind === "error" ? "text-sm text-red-400" : "text-sm text-emerald-400"}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
