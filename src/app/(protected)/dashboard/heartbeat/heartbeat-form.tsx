"use client";

import { useState, useCallback } from "react";

interface HeartbeatConfig {
  enabled?: boolean;
  intervalSeconds?: number;
  prompt?: string;
  lastRun?: string;
  nextRun?: string;
  consecutiveFailures?: number;
  quietHours?: {
    enabled?: boolean;
    startHour?: number;
    endHour?: number;
    timezone?: string;
  };
}

interface HeartbeatFormProps {
  initialConfig: Record<string, unknown>;
}

type IntervalUnit = "minutes" | "hours";

function secondsToDisplay(seconds: number): { value: number; unit: IntervalUnit } {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    return { value: seconds / 3600, unit: "hours" };
  }
  return { value: seconds / 60, unit: "minutes" };
}

function displayToSeconds(value: number, unit: IntervalUnit): number {
  return unit === "hours" ? value * 3600 : value * 60;
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function HeartbeatForm({ initialConfig }: HeartbeatFormProps) {
  const config = initialConfig as HeartbeatConfig;

  const initialInterval = secondsToDisplay(config.intervalSeconds ?? 300);

  const [enabled, setEnabled] = useState(config.enabled ?? false);
  const [intervalValue, setIntervalValue] = useState(initialInterval.value);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initialInterval.unit);
  const [prompt, setPrompt] = useState(config.prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  function getIntervalError(): string | null {
    const totalSeconds = displayToSeconds(intervalValue, intervalUnit);
    if (totalSeconds < 60) return "Minimum interval is 1 minute";
    if (totalSeconds > 86400) return "Maximum interval is 24 hours";
    return null;
  }

  async function handleSave() {
    const intervalError = getIntervalError();
    if (intervalError) {
      setMessage({ type: "error", text: intervalError });
      return;
    }

    setSaving(true);
    clearMessage();

    try {
      const response = await fetch("/api/engine/heartbeat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          intervalSeconds: displayToSeconds(intervalValue, intervalUnit),
          prompt,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage({
          type: "error",
          text: data.error ?? "Failed to save heartbeat configuration",
        });
        return;
      }

      setMessage({ type: "success", text: "Heartbeat configuration saved" });
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const intervalError = getIntervalError();

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Settings</h2>

        <div className="space-y-5">
          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-white text-sm font-medium">
                Heartbeat Enabled
              </label>
              <p className="text-zinc-500 text-sm mt-0.5">
                When enabled, your assistant will run periodic health checks.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? "bg-emerald-600" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Interval */}
          <div>
            <label className="text-white text-sm font-medium block mb-1.5">
              Check Interval
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={intervalValue}
                onChange={(e) => setIntervalValue(Number(e.target.value))}
                className="w-24 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                aria-label="Interval value"
              />
              <select
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                aria-label="Interval unit"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
              </select>
            </div>
            {intervalError && (
              <p className="text-red-400 text-sm mt-1">{intervalError}</p>
            )}
          </div>

          {/* Prompt */}
          <div>
            <label className="text-white text-sm font-medium block mb-1.5">
              Heartbeat Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              maxLength={100_000}
              placeholder="Enter a prompt for the heartbeat check..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600 resize-y"
              aria-label="Heartbeat prompt"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving || !!intervalError}
            className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>

          {message && (
            <p
              className={`text-sm ${
                message.type === "success" ? "text-emerald-400" : "text-red-400"
              }`}
              role="status"
            >
              {message.text}
            </p>
          )}
        </div>
      </div>

      {/* Status section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Status</h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-zinc-500">Last Run</dt>
            <dd className="text-white">{formatDateTime(config.lastRun)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Next Run</dt>
            <dd className="text-white">{formatDateTime(config.nextRun)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Consecutive Failures</dt>
            <dd className={`font-medium ${
              (config.consecutiveFailures ?? 0) > 0 ? "text-red-400" : "text-emerald-400"
            }`}>
              {config.consecutiveFailures ?? 0}
            </dd>
          </div>
        </dl>
      </div>

      {/* Quiet hours info */}
      {config.quietHours?.enabled && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quiet Hours</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-zinc-500">Window</dt>
              <dd className="text-white">
                {config.quietHours.startHour ?? 0}:00 - {config.quietHours.endHour ?? 0}:00
              </dd>
            </div>
            {config.quietHours.timezone && (
              <div>
                <dt className="text-sm text-zinc-500">Timezone</dt>
                <dd className="text-white">{config.quietHours.timezone}</dd>
              </div>
            )}
          </dl>
          <p className="text-zinc-500 text-sm mt-3">
            Heartbeat checks are paused during quiet hours.
          </p>
        </div>
      )}
    </div>
  );
}
