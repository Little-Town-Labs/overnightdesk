"use client";

import { useState } from "react";

interface AuditResult {
  type: string;
  auditName: string;
  result: unknown;
}

const audits = [
  { name: "nightly_code_review", label: "Nightly Code Review", description: "Scan source code for security issues" },
  { name: "weekly_gateway", label: "Weekly Gateway Check", description: "Verify redaction patterns and queue health" },
  { name: "monthly_memory", label: "Monthly Memory Scan", description: "Audit memory entries for injection artifacts" },
];

export function AuditPanel() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AuditResult>>({});
  const [error, setError] = useState<string | null>(null);

  async function handleTrigger(auditName: string) {
    setRunning(auditName);
    setError(null);

    try {
      const res = await fetch("/api/engine/security/trigger-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "audit", auditName }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setResults((prev) => ({ ...prev, [auditName]: data.data }));
      } else {
        setError(data.error ?? "Audit failed");
      }
    } catch {
      setError("Failed to trigger audit");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      {audits.map((audit) => (
        <div key={audit.name} className="rounded-md border border-zinc-700 bg-zinc-800/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{audit.label}</p>
              <p className="text-xs text-zinc-400">{audit.description}</p>
            </div>
            <button
              onClick={() => handleTrigger(audit.name)}
              disabled={running !== null}
              className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
            >
              {running === audit.name ? "Running..." : "Run"}
            </button>
          </div>
          {results[audit.name] && (
            <div className="mt-3 rounded-md bg-zinc-900 p-3">
              <p className="text-xs text-zinc-400">Result:</p>
              <pre className="mt-1 max-h-40 overflow-auto text-xs text-zinc-300">
                {JSON.stringify(results[audit.name].result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
