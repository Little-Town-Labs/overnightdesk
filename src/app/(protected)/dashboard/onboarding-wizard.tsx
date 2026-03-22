"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { TerminalEmbed } from "./terminal-embed";

interface OnboardingWizardProps {
  instanceSubdomain: string;
  authStatus: string;
}

export function OnboardingWizard({ instanceSubdomain, authStatus: initialAuthStatus }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAuthStatus, setCurrentAuthStatus] = useState(initialAuthStatus);

  const isReconnect = initialAuthStatus === "expired";
  const handleDisconnect = useCallback(() => setTerminalOpen(false), []);

  // Poll auth status during Step 2
  useEffect(() => {
    if (step !== 2) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/instance/auth-status");
        const data = await res.json();
        if (data.data?.claudeAuthStatus === "connected") {
          setCurrentAuthStatus("connected");
          setStep(3);
        }
      } catch {
        // Polling failure — continue silently
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [step]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/instance/terminal-ticket", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to connect");
        setLoading(false);
        return;
      }

      setTicket(data.data.ticket);
      setWsUrl(data.data.wsUrl);
      setTerminalOpen(true);
      setStep(2);
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  if (currentAuthStatus === "connected" || step === 3) {
    return (
      <div className="bg-zinc-900 border border-emerald-500/30 rounded-lg p-6 text-center">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-white font-semibold">Claude Code Connected</h3>
        <p className="text-zinc-400 text-sm mt-1">
          Your AI assistant is authenticated and running 24/7.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-1">
        {isReconnect ? "Reconnect Claude Code" : "Connect Claude Code"}
      </h3>
      <p className="text-zinc-400 text-sm mb-6">
        {isReconnect
          ? "Your Claude Code session expired. Reconnect to resume your assistant."
          : "Connect your Claude Code subscription to activate your AI assistant."}
      </p>

      {/* Step indicators */}
      <div className="flex items-center gap-3 mb-6">
        {[
          { num: 1, label: "Connect" },
          { num: 2, label: "Log in" },
          { num: 3, label: "Done" },
        ].map(({ num, label }) => (
          <div key={num} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                step >= num
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {num}
            </span>
            <span className={`text-sm ${step >= num ? "text-white" : "text-zinc-500"}`}>
              {label}
            </span>
            {num < 3 && <span className="text-zinc-700 mx-1">—</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Connect button */}
      {step === 1 && (
        <div>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 mb-4">
            <p className="text-zinc-300 text-sm">
              Clicking Connect will open a terminal to your instance. Claude Code will
              launch and ask you to log in to your Anthropic account in a new browser tab.
            </p>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mb-4">
            <p className="text-blue-300 text-xs">
              You&apos;re logging into YOUR Claude Code account. We never see your credentials.
              Authentication happens directly in your container.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "Connecting..." : isReconnect ? "Reconnect" : "Connect Claude Code"}
          </button>
        </div>
      )}

      {/* Step 2: Terminal */}
      {step === 2 && terminalOpen && ticket && wsUrl && (
        <div>
          <p className="text-zinc-400 text-sm mb-3">
            A new tab should open for Anthropic login. Complete authentication there,
            then this terminal will confirm the connection.
          </p>
          <TerminalEmbed
            wsUrl={wsUrl}
            ticket={ticket}
            onDisconnect={handleDisconnect}
          />
          <p className="text-zinc-500 text-xs mt-2 text-center">
            Status will update automatically when authentication completes.
          </p>
        </div>
      )}
    </div>
  );
}
