"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface DiscordWizardProps {
  initialConfig: Record<string, unknown> | null;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

export function DiscordWizard({ initialConfig }: DiscordWizardProps) {
  const router = useRouter();
  const isReconfigure = initialConfig !== null && typeof initialConfig.bot_token === "string";

  const [step, setStep] = useState<WizardStep>(1);
  const [botToken, setBotToken] = useState("");
  const [userIds, setUserIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  function addUserId() {
    const trimmed = currentUserId.trim();
    if (trimmed.length === 0) return;
    if (userIds.includes(trimmed)) return;
    setUserIds((prev) => [...prev, trimmed]);
    setCurrentUserId("");
  }

  function removeUserId(id: string) {
    setUserIds((prev) => prev.filter((uid) => uid !== id));
  }

  const canProceedStep3 = botToken.length >= 20;
  const canProceedStep4 = userIds.length > 0;

  async function handleSave() {
    if (botToken.length < 20) {
      setMessage({ type: "error", text: "Invalid bot token" });
      return;
    }
    if (userIds.length === 0) {
      setMessage({ type: "error", text: "Add at least one allowed user" });
      return;
    }

    setSaving(true);
    clearMessage();

    try {
      const response = await fetch("/api/engine/discord", {
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
          text: data.error ?? "Failed to save Discord configuration",
        });
        return;
      }

      setMessage({ type: "success", text: "Discord bridge configured successfully" });
      setTimeout(() => {
        router.push("/dashboard/bridges");
      }, 1500);
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {isReconfigure && (
        <div className="bg-indigo-400/10 border border-indigo-400/30 rounded-lg p-4">
          <p className="text-indigo-400 text-sm">
            A Discord bridge is already configured. Completing this wizard will replace the existing configuration.
          </p>
        </div>
      )}

      {/* Step indicators */}
      <div className="flex items-center gap-3 mb-8">
        {([1, 2, 3, 4, 5] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border transition-colors ${
                step === s
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : step > s
                    ? "bg-indigo-400/20 border-indigo-400/50 text-indigo-400"
                    : "bg-zinc-800 border-zinc-700 text-zinc-500"
              }`}
            >
              {step > s ? "\u2713" : s}
            </div>
            {s < 5 && (
              <div
                className={`w-8 h-px ${
                  step > s ? "bg-indigo-400/50" : "bg-zinc-700"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Create Application */}
      {step === 1 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Step 1: Create a Discord Bot</h2>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 space-y-3">
            <p className="text-zinc-300 text-sm">Follow these steps to create your bot:</p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-400">
              <li>Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline">Discord Developer Portal</a></li>
              <li>Click <span className="text-white font-medium">&quot;New Application&quot;</span> and give it a name</li>
              <li>Navigate to the <span className="text-white font-medium">&quot;Bot&quot;</span> section in the left sidebar</li>
              <li>Click <span className="text-white font-medium">&quot;Reset Token&quot;</span> (or &quot;Add Bot&quot; if new) to get your bot token</li>
              <li>Copy the token for the next steps</li>
            </ol>
          </div>
          <div className="mt-6">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
            >
              I have created my bot
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Enable Intents */}
      {step === 2 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Step 2: Enable Message Content Intent</h2>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 space-y-3">
            <p className="text-zinc-300 text-sm">
              The MESSAGE CONTENT intent is required for the bot to read messages:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-400">
              <li>In the Discord Developer Portal, go to your application</li>
              <li>Navigate to <span className="text-white font-medium">&quot;Bot&quot;</span> in the left sidebar</li>
              <li>Scroll down to <span className="text-white font-medium">&quot;Privileged Gateway Intents&quot;</span></li>
              <li>Enable <span className="text-white font-medium">&quot;MESSAGE CONTENT INTENT&quot;</span></li>
              <li>Click <span className="text-white font-medium">&quot;Save Changes&quot;</span></li>
            </ol>
          </div>
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
            >
              Intent is enabled
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Enter Token */}
      {step === 3 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Step 3: Enter Bot Token</h2>
          <div className="space-y-4">
            <div>
              <label className="text-white text-sm font-medium block mb-1.5">
                Bot Token
              </label>
              <input
                type="text"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GAbCdE.a1b2c3d4e5f6g7h8i9j0..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600 font-mono"
                aria-label="Discord bot token"
              />
              {botToken.length > 0 && !canProceedStep3 && (
                <p className="text-red-400 text-sm mt-1">
                  Token must be at least 20 characters
                </p>
              )}
            </div>
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
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Enter User IDs */}
      {step === 4 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Step 4: Add Allowed Users</h2>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 mb-4">
            <p className="text-zinc-300 text-sm">
              To find your Discord user ID:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-zinc-400 mt-2">
              <li>Open Discord Settings &rarr; <span className="text-white font-medium">Advanced</span></li>
              <li>Enable <span className="text-white font-medium">Developer Mode</span></li>
              <li>Right-click your profile or username &rarr; <span className="text-white font-medium">Copy User ID</span></li>
            </ol>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-white text-sm font-medium block mb-1.5">
                User ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentUserId}
                  onChange={(e) => setCurrentUserId(e.target.value)}
                  placeholder="123456789012345678"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600 font-mono"
                  aria-label="Discord user ID"
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
                      className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white font-mono"
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
                onClick={() => setStep(3)}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(5)}
                disabled={!canProceedStep4}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Review & Save */}
      {step === 5 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Step 5: Review & Save</h2>
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
                <dd className="text-white text-sm font-mono">{userIds.join(", ")}</dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Message Content Intent</dt>
                <dd className="text-emerald-400 text-sm">Confirmed enabled</dd>
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
                  enabled ? "bg-indigo-600" : "bg-zinc-700"
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
                onClick={() => setStep(4)}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
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

export type { DiscordWizardProps };
