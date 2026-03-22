"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface BridgeStatusCardProps {
  type: "telegram" | "discord";
  config: Record<string, unknown> | null;
  instanceSubdomain: string;
}

const brandStyles = {
  telegram: {
    accent: "text-blue-400",
    accentBg: "bg-blue-400/10",
    accentBorder: "border-blue-400/30",
    enabledBg: "bg-blue-600",
    label: "Telegram",
  },
  discord: {
    accent: "text-indigo-400",
    accentBg: "bg-indigo-400/10",
    accentBorder: "border-indigo-400/30",
    enabledBg: "bg-indigo-600",
    label: "Discord",
  },
};

export function BridgeStatusCard({ type, config, instanceSubdomain }: BridgeStatusCardProps) {
  const router = useRouter();
  const brand = brandStyles[type];
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isConfigured = config !== null && typeof config.bot_token === "string";
  const isEnabled = isConfigured && config.enabled === true;
  const allowedUsers = isConfigured
    ? (config.allowed_users as unknown[] | undefined) ?? []
    : [];

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  async function handleDelete() {
    setDeleting(true);
    clearMessage();

    try {
      const response = await fetch(`/api/engine/${type}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage({
          type: "error",
          text: data.error ?? `Failed to delete ${brand.label} configuration`,
        });
        return;
      }

      setMessage({ type: "success", text: `${brand.label} bridge removed` });
      setShowConfirm(false);
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-lg font-semibold ${brand.accent}`}>{brand.label}</h2>
        {isConfigured && (
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              isEnabled
                ? "bg-emerald-400/10 text-emerald-400"
                : "bg-zinc-700/50 text-zinc-400"
            }`}
          >
            {isEnabled ? "Enabled" : "Disabled"}
          </span>
        )}
      </div>

      {!isConfigured ? (
        <div className="text-center py-4">
          <p className="text-zinc-500 text-sm mb-4">
            No {brand.label} bridge configured yet.
          </p>
          <Link
            href={`/dashboard/bridges/${type}`}
            className={`inline-block px-4 py-2 text-sm rounded-md transition-colors ${brand.accentBg} ${brand.accent} hover:opacity-80 border ${brand.accentBorder}`}
          >
            Set Up {brand.label}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-zinc-500">Allowed Users</dt>
              <dd className="text-white text-sm">{allowedUsers.length} user{allowedUsers.length !== 1 ? "s" : ""}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Status</dt>
              <dd className={`text-sm ${isEnabled ? "text-emerald-400" : "text-zinc-400"}`}>
                {isEnabled ? "Active" : "Paused"}
              </dd>
            </div>
          </dl>

          <div className="flex gap-2 pt-2">
            <Link
              href={`/dashboard/bridges/${type}`}
              className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
            >
              Reconfigure
            </Link>
            {!showConfirm ? (
              <button
                onClick={() => setShowConfirm(true)}
                className="px-3 py-1.5 text-sm bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-md transition-colors"
              >
                Delete
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                >
                  {deleting ? "Deleting..." : "Confirm Delete"}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={deleting}
                  className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

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
      )}
    </div>
  );
}

export { brandStyles };
export type { BridgeStatusCardProps };
