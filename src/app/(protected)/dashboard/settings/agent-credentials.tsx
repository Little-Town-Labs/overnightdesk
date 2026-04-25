"use client";

import { useState, useRef } from "react";

// ---------------------------------------------------------------------------
// Shared primitives (mirrors setup-wizard.tsx style)
// ---------------------------------------------------------------------------

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-white mb-1">
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
    />
  );
}

function EyeOpen() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeClosed() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
        aria-label={show ? "Hide value" : "Show value"}
      >
        {show ? <EyeClosed /> : <EyeOpen />}
      </button>
    </div>
  );
}

function SaveButton({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
    >
      {loading && (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hook: post secrets and surface result for 3 seconds
// ---------------------------------------------------------------------------

type SaveStatus = { kind: "success"; message: string } | { kind: "error"; message: string } | null;

function useSaveCredential() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(secrets: Record<string, string>): Promise<boolean> {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/settings/update-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secrets }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setStatus({ kind: "error", message: data.error ?? "Failed to update. Please try again." });
        return false;
      }

      setStatus({ kind: "success", message: "Key updated — agent restarting..." });
      timerRef.current = setTimeout(() => setStatus(null), 3000);
      return true;
    } catch {
      setStatus({ kind: "error", message: "Network error. Please try again." });
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { loading, status, save };
}

// ---------------------------------------------------------------------------
// OpenRouter API Key section
// ---------------------------------------------------------------------------

function OpenRouterSection() {
  const [apiKey, setApiKey] = useState("");
  const { loading, status, save } = useSaveCredential();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    const ok = await save({ OPENROUTER_API_KEY: apiKey.trim() });
    if (ok) setApiKey("");
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white">OpenRouter API Key</h3>
        <p className="text-sm text-zinc-400 mt-0.5">
          Update the key your agent uses to access AI models.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="openrouter-key">API Key</FieldLabel>
          <PasswordInput
            id="openrouter-key"
            value={apiKey}
            onChange={setApiKey}
            placeholder="sk-or-••••••••"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Get a key at{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              openrouter.ai/keys
            </a>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SaveButton loading={loading}>
            {loading ? "Saving..." : "Save Key"}
          </SaveButton>
          {status?.kind === "success" && (
            <p className="text-sm text-emerald-400">{status.message}</p>
          )}
          {status?.kind === "error" && (
            <p className="text-sm text-red-400">{status.message}</p>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telegram Bridge section
// ---------------------------------------------------------------------------

function TelegramSection() {
  const [botToken, setBotToken] = useState("");
  const [allowedUsers, setAllowedUsers] = useState("");
  const { loading, status, save } = useSaveCredential();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const secrets: Record<string, string> = {};
    if (botToken.trim()) secrets.TELEGRAM_BOT_TOKEN = botToken.trim();
    if (allowedUsers.trim()) secrets.TELEGRAM_ALLOWED_USERS = allowedUsers.trim();

    // Allow saving empty values to remove the bridge
    if (Object.keys(secrets).length === 0) {
      secrets.TELEGRAM_BOT_TOKEN = "";
      secrets.TELEGRAM_ALLOWED_USERS = "";
    }

    const ok = await save(secrets);
    if (ok) {
      setBotToken("");
      setAllowedUsers("");
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white">Telegram Bridge</h3>
        <p className="text-sm text-zinc-400 mt-0.5">
          Update your Telegram bot credentials. Leave both fields blank to remove the bridge.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="telegram-token">Bot Token</FieldLabel>
          <PasswordInput
            id="telegram-token"
            value={botToken}
            onChange={setBotToken}
            placeholder="1234567890:ABCdef..."
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Create a bot at{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              @BotFather
            </a>{" "}
            and paste the token here.
          </p>
        </div>

        <div>
          <FieldLabel htmlFor="telegram-users">Allowed User IDs</FieldLabel>
          <TextInput
            id="telegram-users"
            type="text"
            value={allowedUsers}
            onChange={(e) => setAllowedUsers(e.target.value)}
            placeholder="123456789, 987654321"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Comma-separated Telegram user IDs. Use{" "}
            <a
              href="https://t.me/userinfobot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              @userinfobot
            </a>{" "}
            to find yours.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SaveButton loading={loading}>
            {loading ? "Saving..." : "Save Telegram"}
          </SaveButton>
          {status?.kind === "success" && (
            <p className="text-sm text-emerald-400">{status.message}</p>
          )}
          {status?.kind === "error" && (
            <p className="text-sm text-red-400">{status.message}</p>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export function AgentCredentials() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Agent Credentials</h2>
        <p className="text-sm text-zinc-400 mt-0.5">
          Update API keys and integrations for your running agent. Changes take effect after an automatic restart.
        </p>
      </div>
      <OpenRouterSection />
      <TelegramSection />
    </div>
  );
}
