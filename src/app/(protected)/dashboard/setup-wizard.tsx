"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProvisioningProgress } from "./provisioning-progress";

interface WizardState {
  completedSteps: number[];
  currentStep: number;
}

interface SetupWizardProps {
  tenantId: string;
  instanceId: string;
  wizardState: WizardState | null;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { num: 1, label: "API Key" },
  { num: 2, label: "Telegram" },
  { num: 3, label: "Personality" },
];

function StepIndicator({ current, completed }: { current: number; completed: number[] }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map(({ num, label }, idx) => {
        const isDone = completed.includes(num);
        const isActive = current === num;
        return (
          <div key={num} className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                isDone
                  ? "bg-emerald-600 text-white"
                  : isActive
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {isDone ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                num
              )}
            </span>
            <span
              className={`text-sm ${
                isDone || isActive ? "text-white" : "text-zinc-500"
              }`}
            >
              {label}
            </span>
            {idx < STEPS.length - 1 && (
              <span className="text-zinc-700 mx-1 select-none">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Common field primitives
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm text-zinc-400 mb-1.5">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
    />
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-400">{message}</p>;
}

function PrimaryButton({
  children,
  loading,
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
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

function SkipButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="text-sm text-zinc-400 hover:text-zinc-300 disabled:opacity-50 transition-colors"
    >
      Skip for now
    </button>
  );
}

// ---------------------------------------------------------------------------
// Timezone options (common subset)
// ---------------------------------------------------------------------------

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

// ---------------------------------------------------------------------------
// Step 1 — OpenRouter API Key
// ---------------------------------------------------------------------------

function Step1({
  completedSteps,
  onComplete,
}: {
  completedSteps: number[];
  onComplete: () => void;
}) {
  const isCompleted = completedSteps.includes(1);
  const [changing, setChanging] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showForm = !isCompleted || changing;

  async function handleSubmit() {
    if (!apiKey.trim()) {
      setError("API key is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wizard/write-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: 1, secrets: { OPENROUTER_API_KEY: apiKey.trim() } }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Validation failed. Please try again.");
        return;
      }
      setChanging(false);
      onComplete();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!showForm) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400">OpenRouter API Key</p>
          <p className="text-white font-mono text-sm mt-0.5">sk-or-••••••••••••••••</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-400 font-medium">Saved</span>
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="text-xs text-zinc-400 hover:text-zinc-300 underline transition-colors"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>
          OpenRouter API Key{" "}
          <span className="text-red-400">*</span>
        </FieldLabel>
        <div className="relative">
          <TextInput
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-v1-..."
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        <FieldError message={error} />
        <p className="mt-1.5 text-xs text-zinc-500">
          Get your key at{" "}
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
        <PrimaryButton loading={loading} onClick={handleSubmit}>
          {loading ? "Validating..." : "Validate & Continue"}
        </PrimaryButton>
        {isCompleted && (
          <button
            type="button"
            onClick={() => { setChanging(false); setError(null); }}
            className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Telegram Bridge
// ---------------------------------------------------------------------------

function Step2({
  completedSteps,
  onComplete,
}: {
  completedSteps: number[];
  onComplete: () => void;
}) {
  const isCompleted = completedSteps.includes(2);
  const [mode, setMode] = useState<"idle" | "configure" | "changing">("idle");
  const [botToken, setBotToken] = useState("");
  const [allowedUsers, setAllowedUsers] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  async function submit(secrets: Record<string, string>) {
    setLoading(true);
    setTokenError(null);
    setUsersError(null);
    try {
      const res = await fetch("/api/wizard/write-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: 2, secrets }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // Surface error under bot token field as the general step error
        setTokenError(data.error ?? "Failed to save. Please try again.");
        return;
      }
      setMode("idle");
      onComplete();
    } catch {
      setTokenError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    await submit({});
  }

  async function handleSave() {
    let valid = true;
    if (!botToken.trim()) {
      setTokenError("Bot token is required.");
      valid = false;
    }
    if (!allowedUsers.trim()) {
      setUsersError("At least one user ID is required.");
      valid = false;
    }
    if (!valid) return;
    await submit({
      TELEGRAM_BOT_TOKEN: botToken.trim(),
      TELEGRAM_ALLOWED_USERS: allowedUsers.trim(),
    });
  }

  if (isCompleted && mode !== "changing") {
    const wasSkipped = mode === "idle";
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400">Telegram Bridge</p>
          <p className="text-sm mt-0.5 text-emerald-400 font-medium">
            {wasSkipped ? "Configured" : "Skipped"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode("changing")}
          className="text-xs text-zinc-400 hover:text-zinc-300 underline transition-colors"
        >
          Change
        </button>
      </div>
    );
  }

  if (mode === "idle" && !isCompleted) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">
          Connect a Telegram bot so you can message your agent from your phone.
          This is optional — you can configure it later from Settings.
        </p>
        <div className="flex items-center gap-4">
          <PrimaryButton onClick={() => setMode("configure")}>
            Configure Telegram
          </PrimaryButton>
          <SkipButton onClick={handleSkip} loading={loading} />
        </div>
        {tokenError && <FieldError message={tokenError} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Bot Token</FieldLabel>
        <TextInput
          type="password"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="1234567890:ABCdef..."
          autoComplete="off"
        />
        <FieldError message={tokenError} />
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
        <FieldLabel>Allowed User IDs</FieldLabel>
        <TextInput
          type="text"
          value={allowedUsers}
          onChange={(e) => setAllowedUsers(e.target.value)}
          placeholder="123456789, 987654321"
        />
        <FieldError message={usersError} />
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
      <div className="flex items-center gap-4">
        <PrimaryButton loading={loading} onClick={handleSave}>
          {loading ? "Saving..." : "Save & Continue"}
        </PrimaryButton>
        <button
          type="button"
          onClick={() => { setMode("idle"); setTokenError(null); setUsersError(null); }}
          className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Agent Personality
// ---------------------------------------------------------------------------

function Step3({
  completedSteps,
  onComplete,
}: {
  completedSteps: number[];
  onComplete: () => void;
}) {
  const isCompleted = completedSteps.includes(3);
  const [changing, setChanging] = useState(false);
  const [agentName, setAgentName] = useState("Agent");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showForm = !isCompleted || changing;

  async function handleSave(useDefaults = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wizard/write-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 3,
          secrets: {
            HERMES_AGENT_NAME: useDefaults ? "Agent" : agentName.trim() || "Agent",
            TIMEZONE: useDefaults ? "America/Chicago" : timezone,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to save. Please try again.");
        return;
      }
      setChanging(false);
      onComplete();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!showForm) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400">Agent Personality</p>
          <p className="text-white text-sm mt-0.5">
            {agentName} · {timezone}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="text-xs text-zinc-400 hover:text-zinc-300 underline transition-colors"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Agent Name</FieldLabel>
        <TextInput
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="Agent"
          maxLength={50}
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          How your agent identifies itself in conversations.
        </p>
      </div>
      <div>
        <FieldLabel>Timezone</FieldLabel>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <FieldError message={error} />
      <div className="flex items-center gap-4">
        <PrimaryButton loading={loading} onClick={() => handleSave(false)}>
          {loading ? "Saving..." : "Save & Continue"}
        </PrimaryButton>
        <SkipButton onClick={() => handleSave(true)} loading={loading} />
        {isCompleted && (
          <button
            type="button"
            onClick={() => { setChanging(false); setError(null); }}
            className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step shell — expand/collapse wrapper
// ---------------------------------------------------------------------------

function StepShell({
  num,
  title,
  subtitle,
  isActive,
  isCompleted,
  children,
}: {
  num: number;
  title: string;
  subtitle: string;
  isActive: boolean;
  isCompleted: boolean;
  children: React.ReactNode;
}) {
  const isFuture = !isActive && !isCompleted;
  return (
    <div
      className={`border rounded-lg p-5 transition-colors ${
        isActive
          ? "border-blue-500/40 bg-zinc-800/40"
          : isCompleted
          ? "border-zinc-700/60 bg-zinc-900/60"
          : "border-zinc-800 bg-zinc-900/40 opacity-50"
      }`}
    >
      <div className="flex items-start gap-3 mb-4">
        <span
          className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium mt-0.5 ${
            isCompleted
              ? "bg-emerald-600 text-white"
              : isActive
              ? "bg-blue-600 text-white"
              : "bg-zinc-700 text-zinc-500"
          }`}
        >
          {isCompleted ? (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            num
          )}
        </span>
        <div>
          <p className={`text-sm font-medium ${isFuture ? "text-zinc-500" : "text-white"}`}>
            {title}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {(isActive || isCompleted) && <div className="ml-9">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export function SetupWizard({ tenantId: _tenantId, instanceId: _instanceId, wizardState }: SetupWizardProps) {
  const router = useRouter();
  const [completedSteps, setCompletedSteps] = useState<number[]>(
    wizardState?.completedSteps ?? []
  );
  const [currentStep, setCurrentStep] = useState<number>(
    wizardState?.currentStep ?? 1
  );
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  function markComplete(step: number) {
    setCompletedSteps((prev) => Array.from(new Set([...prev, step])));
    setCurrentStep(step + 1);
  }

  const allStepsDone = [1, 2, 3].every((s) => completedSteps.includes(s));

  async function handleLaunch() {
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await fetch("/api/wizard/complete", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLaunchError(data.error ?? "Failed to start agent. Please try again.");
        return;
      }
      setProvisioning(true);
      router.refresh();
    } catch {
      setLaunchError("Network error. Please try again.");
    } finally {
      setLaunching(false);
    }
  }

  if (provisioning) {
    return <ProvisioningProgress initialStatus="awaiting_provisioning" />;
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-1">Set Up Your Agent</h2>
      <p className="text-sm text-zinc-400 mb-6">
        Complete the steps below to configure and launch your OvernightDesk agent.
      </p>

      <StepIndicator current={currentStep} completed={completedSteps} />

      <div className="space-y-3">
        <StepShell
          num={1}
          title="OpenRouter API Key"
          subtitle="Required — powers your agent's AI capabilities"
          isActive={currentStep === 1}
          isCompleted={completedSteps.includes(1)}
        >
          <Step1 completedSteps={completedSteps} onComplete={() => markComplete(1)} />
        </StepShell>

        <StepShell
          num={2}
          title="Telegram Bridge"
          subtitle="Optional — message your agent from Telegram"
          isActive={currentStep === 2}
          isCompleted={completedSteps.includes(2)}
        >
          <Step2 completedSteps={completedSteps} onComplete={() => markComplete(2)} />
        </StepShell>

        <StepShell
          num={3}
          title="Agent Personality"
          subtitle="Optional — name and timezone for your agent"
          isActive={currentStep === 3}
          isCompleted={completedSteps.includes(3)}
        >
          <Step3 completedSteps={completedSteps} onComplete={() => markComplete(3)} />
        </StepShell>
      </div>

      {allStepsDone && (
        <div className="mt-6 pt-6 border-t border-zinc-800">
          {launchError && (
            <p className="text-sm text-red-400 mb-3">{launchError}</p>
          )}
          <div className="flex items-center gap-4">
            <PrimaryButton loading={launching} onClick={handleLaunch}>
              {launching ? "Starting..." : "Start My Agent"}
            </PrimaryButton>
            <p className="text-xs text-zinc-500">
              This will provision your container and start your agent.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
