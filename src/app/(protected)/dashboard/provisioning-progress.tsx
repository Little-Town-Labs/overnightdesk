"use client";

import { useEffect, useRef, useState } from "react";

interface ProvisioningProgressProps {
  initialStatus: string;
}

type ProgressStage = "awaiting_provisioning" | "provisioning" | "running" | "error" | string;

interface StageConfig {
  heading: string;
  detail: string;
  color: string;
  done: boolean;
  isError: boolean;
}

function getStageConfig(status: ProgressStage): StageConfig {
  switch (status) {
    case "awaiting_provisioning":
      return {
        heading: "Setup complete — preparing your agent...",
        detail: "We've received your configuration and are getting ready to spin up your container.",
        color: "text-amber-400",
        done: false,
        isError: false,
      };
    case "provisioning":
      return {
        heading: "Creating your container...",
        detail: "Your dedicated agent environment is being built. This usually takes under a minute.",
        color: "text-amber-400",
        done: false,
        isError: false,
      };
    case "running":
      return {
        heading: "Your agent is live!",
        detail: "Setup complete. Refreshing your dashboard...",
        color: "text-emerald-400",
        done: true,
        isError: false,
      };
    case "error":
      return {
        heading: "Something went wrong.",
        detail: "Please contact support at support@overnightdesk.com and we'll get you sorted.",
        color: "text-red-400",
        done: false,
        isError: true,
      };
    default:
      return {
        heading: "Preparing your agent...",
        detail: "Waiting for status update.",
        color: "text-zinc-400",
        done: false,
        isError: false,
      };
  }
}

function Spinner() {
  return (
    <svg
      className="w-8 h-8 animate-spin text-blue-500"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
      <svg
        className="w-5 h-5 text-emerald-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

function ErrorIcon() {
  return (
    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
      <svg
        className="w-5 h-5 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    </div>
  );
}

const POLL_INTERVAL_MS = 5_000;

export function ProvisioningProgress({ initialStatus }: ProvisioningProgressProps) {
  const [status, setStatus] = useState<ProgressStage>(initialStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = getStageConfig(status);
  const shouldPoll = !config.done && !config.isError;

  useEffect(() => {
    if (!shouldPoll) return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/instance/status");
        if (!res.ok) return;
        const data = await res.json();
        const next: ProgressStage = data.status ?? data.data?.status;
        if (next) setStatus(next);
      } catch {
        // Polling failure — continue silently
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [shouldPoll]);

  // When running, stop polling and reload after 2 seconds
  useEffect(() => {
    if (status !== "running") return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    refreshTimerRef.current = setTimeout(() => {
      window.location.reload();
    }, 2_000);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [status]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-0.5">
          {config.done ? (
            <SuccessIcon />
          ) : config.isError ? (
            <ErrorIcon />
          ) : (
            <Spinner />
          )}
        </div>
        <div className="min-w-0">
          <h3 className={`text-base font-semibold ${config.color}`}>
            {config.heading}
          </h3>
          <p className="text-sm text-zinc-400 mt-1">{config.detail}</p>
        </div>
      </div>

      {!config.isError && !config.done && (
        <div className="mt-6">
          <ProgressBar status={status} />
        </div>
      )}
    </div>
  );
}

function ProgressBar({ status }: { status: ProgressStage }) {
  const pct =
    status === "awaiting_provisioning"
      ? 20
      : status === "provisioning"
      ? 60
      : status === "running"
      ? 100
      : 10;

  return (
    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-in-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
