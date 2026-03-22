"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface TelegramWizardProps {
  initialConfig: Record<string, unknown> | null;
}

type WizardStep = 1 | 2 | 3 | 4;

function isValidBotToken(token: string): boolean {
  return token.length >= 20 && token.includes(":");
}

export function TelegramWizard({ initialConfig }: TelegramWizardProps) {
  const router = useRouter();
  const isReconfigure = initialConfig !== null && initialConfig.enabled !== undefined;

  const [step, setStep] = useState<WizardStep>(1);
  const [botToken, setBotToken] = useState("");
  const [userIds, setUserIds] = useState<number[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  function addUserId() {
    const parsed = parseInt(currentUserId, 10);
    if (isNaN(parsed) || parsed <= 0) return;
    if (userIds.includes(parsed)) return;
    setUserIds((prev) => [...prev, parsed]);
    setCurrentUserId("");
  }

  function removeUserId(id: number) {
    setUserIds((prev) => prev.filter((uid) => uid !== id));
  }

  async function handleSave() {
    if (!isValidBotToken(botToken)) {
      setMessage({ type: "error", text: "Invalid bot token format" });
      return;
    }
    if (userIds.length === 0) {
      setMessage({ type: "error", text: "Add at least one allowed user" });
      return;
    }

    setSaving(true);
    clearMessage();

    try {
      const response = await fetch("/api/engine/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: botToken,
          allowed_users: userIds,
          enabled,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage({
          type: "error",
          text: data.error ?? "Failed to save Telegram configuration",
        });
        return;
      }

      setMessage({ type: "success", text: "Telegram bridge configured successfully" });
      setTimeout(() => {
        router.push("/dashboard/bridges");
      }, 1500);
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const canProceedStep2 = isValidBotToken(botToken);
  const canProceedStep3 = userIds.length > 0;

  return (
    <div className="space-y-6">
      {isReconfigure && (
        <div className="bg-blue-400/10 border border-blue-400/30 rounded-lg p-4">
          <p className="text-blue-400 text-sm">
            A Telegram bridge is already configured. Completing this wizard will replace the existing configuration.
          </p>
        </div>
      )}

      {/* Step indicators */}
      <div className="flex items-center gap-3 mb-8">
        {([1, 2, 3, 4] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border transition-colors ${
                step === s
                  ? "bg-blue-600 border-blue-500 text-white"
                  : step > s
                    ? "bg-blue-400/20 border-blue-400/50 text-blue-400"
                    : "bg-zinc-800 border-zinc-700 text-zinc-500"
              }`}
            >
              {step > s ? "\u2713" : s}
            </div>
            {s < 4 && (
              <div
                className={`w-8 h-px ${
                  step > s ? "bg-blue-400/50" : "bg-zinc-700"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Create Bot */}
      {step === 1 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Step 1: Create a Telegram Bot</h2>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 space-y-3">
            <p className="text-zinc-300 text-sm">Follow these steps to create your bot:</p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-400">
              <li>Open Telegram and search for <span className="text-blue-400 font-mono">@BotFather</span></li>
              <li>Send the command <span className="text-blue-400 font-mono">/newbot</span></li>
              <li>Choose a name for your bot (e.g., &quot;My OvernightDesk Bot&quot;)</li>
              <li>Choose a username ending in &quot;bot&quot; (e.g., &quot;myovernightdesk_bot&quot;)</li>
              <li>BotFather will send you a <span className="text-white font-medium">bot token</span> &mdash; copy it for the next step</li>
            </ol>
          </div>
          <div className="mt-6">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
            >
              I have my bot token
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Enter Token */}
      {step === 2 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Step 2: Enter Bot Token</h2>
          <div className="space-y-4">
            <div>
              <label className="text-white text-sm font-medium block mb-1.5">
                Bot Token
              </label>
              <input
                type="text"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCDefGHIjklMNOpqrsTUVwxyz"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-zinc-600 font-mono"
                aria-label="Telegram bot token"
              />
              {botToken.length > 0 && !canProceedStep2 && (
                <p className="text-red-400 text-sm mt-1">
                  Token must be at least 20 characters and contain a colon (:)
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Enter User IDs */}
      {step === 3 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Step 3: Add Allowed Users</h2>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 mb-4">
            <p className="text-zinc-300 text-sm">
              To find your Telegram user ID, message <span className="text-blue-400 font-mono">@userinfobot</span> on Telegram.
              It will reply with your numeric user ID.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-white text-sm font-medium block mb-1.5">
                User ID
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={currentUserId}
                  onChange={(e) => setCurrentUserId(e.target.value)}
                  placeholder="123456789"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-zinc-600"
                  aria-label="Telegram user ID"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addUserId();
                  }}
                />
                <button
                  onClick={addUserId}
                  className="px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors border border-zinc-700"
                >
                  Add
                </button>
              </div>
            </div>

            {userIds.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-zinc-500">Allowed users:</p>
                <div className="flex flex-wrap gap-2">
                  {userIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white"
                    >
                      {id}
                      <button
                        onClick={() => removeUserId(id)}
                        className="text-zinc-500 hover:text-red-400 ml-1"
                        aria-label={`Remove user ${id}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!canProceedStep3}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review & Save */}
      {step === 4 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Step 4: Review & Save</h2>
          <div className="space-y-4">
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-zinc-500">Bot Token</dt>
                <dd className="text-white text-sm font-mono">
                  {botToken.slice(0, 8)}...{botToken.slice(-4)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Allowed Users</dt>
                <dd className="text-white text-sm">{userIds.join(", ")}</dd>
              </div>
            </dl>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-white text-sm font-medium">
                  Enable Bridge
                </label>
                <p className="text-zinc-500 text-sm mt-0.5">
                  Start receiving messages immediately after saving.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? "bg-blue-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
              >
                {saving ? "Saving..." : "Save Configuration"}
              </button>
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
        </div>
      )}
    </div>
  );
}

export { isValidBotToken };
export type { TelegramWizardProps, WizardStep };
