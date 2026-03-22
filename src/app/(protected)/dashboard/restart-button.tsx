"use client";

import { useState, useCallback } from "react";

interface RestartButtonProps {
  instanceRunning: boolean;
}

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export function RestartButton({ instanceRunning }: RestartButtonProps) {
  const [status, setStatus] = useState<"idle" | "confirming" | "restarting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRestartAt, setLastRestartAt] = useState<number | null>(null);

  const isInCooldown = lastRestartAt !== null && Date.now() - lastRestartAt < COOLDOWN_MS;
  const isDisabled = status === "restarting" || isInCooldown;

  const handleClick = useCallback(() => {
    if (status === "confirming") {
      return;
    }
    setStatus("confirming");
    setErrorMessage(null);
  }, [status]);

  const handleCancel = useCallback(() => {
    setStatus("idle");
  }, []);

  const handleConfirm = useCallback(async () => {
    setStatus("restarting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/engine/restart", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setLastRestartAt(Date.now());
      } else {
        setStatus("error");
        setErrorMessage(data.error ?? "Restart failed");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
    }
  }, []);

  if (!instanceRunning) {
    return null;
  }

  return (
    <div className="mt-4">
      {status === "confirming" ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <p className="text-amber-300 text-sm mb-3">
            Are you sure? This will restart your AI assistant. It will be temporarily unavailable.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors"
            >
              Yes, restart
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {status === "restarting" ? "Restarting..." : "Restart Instance"}
          </button>

          {status === "success" && (
            <p className="text-emerald-400 text-sm mt-2">Instance restarting...</p>
          )}

          {status === "error" && errorMessage && (
            <p className="text-red-400 text-sm mt-2">{errorMessage}</p>
          )}

          {isInCooldown && status !== "restarting" && (
            <p className="text-zinc-500 text-xs mt-1">
              Restart available after cooldown period.
            </p>
          )}
        </>
      )}
    </div>
  );
}
