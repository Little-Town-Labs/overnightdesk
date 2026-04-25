"use client";

import { useEffect, useRef, useState, useId } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

interface HermesMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface HermesSession {
  id: string;
  source: string;
  started_at: number;
  ended_at: number | null;
  message_count: number;
  title: string | null;
  est_cost: number;
  messages: HermesMessage[];
}

interface ChatInterfaceProps {
  instanceStatus: string;
  agentName: string;
  initialSessions: HermesSession[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeDate(ts: number): string {
  const now = Date.now();
  const diffMs = now - ts * 1000;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getGroupLabel(ts: number): "Today" | "Yesterday" | "This Week" | "Older" {
  const now = new Date();
  const d = new Date(ts * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((todayStart - d.setHours(0, 0, 0, 0)) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "This Week";
  return "Older";
}

function getSourceIcon(source: string): string {
  switch (source) {
    case "telegram": return "📱";
    case "discord": return "💻";
    case "api_server": return "🌐";
    case "cli": return ">";
    default: return "·";
  }
}

function getSourceLabel(source: string): string {
  switch (source) {
    case "telegram": return "Telegram";
    case "discord": return "Discord";
    case "api_server": return "API";
    case "cli": return "CLI";
    default: return source;
  }
}

function getSourceColorClass(source: string): string {
  switch (source) {
    case "telegram": return "text-blue-400 bg-blue-400/10";
    case "discord": return "text-purple-400 bg-purple-400/10";
    case "api_server": return "text-green-400 bg-green-400/10";
    case "cli": return "text-zinc-400 bg-zinc-700";
    default: return "text-zinc-400 bg-zinc-700";
  }
}

function getSessionPreview(session: HermesSession): string {
  const firstUser = session.messages.find((m) => m.role === "user");
  const text = firstUser?.content ?? session.title ?? "New conversation";
  return text.length > 42 ? text.slice(0, 40) + "…" : text;
}

// ─── Live Chat Panel ─────────────────────────────────────────────────────────

function LiveChatPanel({
  instanceStatus,
  agentName,
}: {
  instanceStatus: string;
  agentName: string;
}) {
  const rawId = useId();
  const sessionId = rawId.replace(/:/g, "");

  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/engine/chat",
      headers: { "x-hermes-session-id": sessionId },
    }),
  });

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === "streaming" || status === "submitted";
  const agentNotRunning = instanceStatus !== "running";
  const isEmpty = messages.length === 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function resizeTextarea() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxHeight = 20 * 5 + 16;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    resizeTextarea();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Session ID strip */}
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-zinc-400 font-mono">
            session <span className="text-zinc-300">{sessionId.slice(0, 12)}</span>
          </span>
        </span>
      </div>

      {agentNotRunning && (
        <div className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-zinc-900 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm text-amber-300">
            Your agent is not running.{" "}
            <a href="/dashboard" className="underline hover:text-amber-200 transition-colors">
              Start it from the Overview tab.
            </a>
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isEmpty ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
              <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            </div>
            <p className="text-base font-medium text-white">Chat with {agentName}</p>
            <p className="mt-1 text-sm text-zinc-500">Send a message to get started.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={isUser
                  ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-white"
                  : "mr-auto max-w-[80%] rounded-2xl rounded-bl-sm bg-zinc-800 px-4 py-2 text-zinc-100"
                }>
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {msg.parts?.map((part, i) =>
                      part.type === "text" ? <span key={i}>{part.text}</span> : null
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}

        {error && (
          <div className="text-center py-2">
            <p className="text-sm text-red-400">{error.message}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-zinc-800 bg-zinc-950 p-4 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Message your agent..."
          rows={1}
          disabled={isLoading}
          className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 transition-colors"
          style={{ minHeight: "38px" }}
        />

        {isLoading ? (
          <button
            type="button"
            onClick={stop}
            className="flex-shrink-0 rounded-xl bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600 transition-colors"
            aria-label="Stop generation"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  session,
  onBack,
}: {
  session: HermesSession;
  onBack: () => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [session.id]);

  const startedDate = new Date(session.started_at * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
        <button
          onClick={onBack}
          className="md:hidden flex items-center justify-center h-7 w-7 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          aria-label="Back to sessions"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${getSourceColorClass(session.source)}`}>
          <span>{getSourceIcon(session.source)}</span>
          {getSourceLabel(session.source)}
        </span>

        <span className="text-xs text-zinc-500">{startedDate}</span>

        <span className="ml-auto text-xs text-zinc-600">{session.message_count} messages</span>
      </div>

      {/* Past-conversation banner */}
      <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
        <svg className="h-4 w-4 flex-shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
        </svg>
        <p className="text-xs text-zinc-400">
          This is a past conversation. Use{" "}
          <button
            onClick={onBack}
            className="text-zinc-300 underline hover:text-white transition-colors"
          >
            Live Chat
          </button>{" "}
          to talk to your agent.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {session.messages.length === 0 ? (
          <div className="flex h-full min-h-[100px] items-center justify-center">
            <p className="text-sm text-zinc-600">No messages in this session.</p>
          </div>
        ) : (
          session.messages.map((msg) => {
            const isUser = msg.role === "user";
            const time = new Date(msg.timestamp * 1000).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            return (
              <div key={msg.id} className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
                <div className={isUser
                  ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600/80 px-4 py-2 text-white"
                  : "mr-auto max-w-[80%] rounded-2xl rounded-bl-sm bg-zinc-800 px-4 py-2 text-zinc-200"
                }>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
                <span className="text-[10px] text-zinc-600 px-1">{time}</span>
              </div>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Continue button for api_server sessions */}
      {session.source === "api_server" && (
        <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-3 flex justify-center">
          <button
            onClick={onBack}
            className="rounded-xl border border-blue-500/40 bg-blue-600/10 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-600/20 transition-colors"
          >
            Continue in Live Chat
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sessions Sidebar ─────────────────────────────────────────────────────────

const GROUP_ORDER: ReturnType<typeof getGroupLabel>[] = ["Today", "Yesterday", "This Week", "Older"];

function SessionsSidebar({
  sessions,
  activeView,
  onSelect,
}: {
  sessions: HermesSession[];
  activeView: "live" | string;
  onSelect: (id: "live" | string) => void;
}) {
  // Group sessions
  const grouped = GROUP_ORDER.reduce<Record<string, HermesSession[]>>((acc, label) => {
    acc[label] = [];
    return acc;
  }, {});

  for (const s of sessions) {
    const label = getGroupLabel(s.started_at);
    grouped[label].push(s);
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-zinc-100">Conversations</span>
        <button
          onClick={() => onSelect("live")}
          title="New Chat"
          className="flex items-center justify-center h-7 w-7 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          aria-label="New Chat"
        >
          {/* Pencil icon */}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* Live Chat item */}
        <button
          onClick={() => onSelect("live")}
          className={`w-full text-left px-3 py-2.5 mx-1 rounded-lg transition-colors flex items-center gap-2.5 ${
            activeView === "live"
              ? "bg-zinc-700 text-white"
              : "text-zinc-300 hover:bg-zinc-800"
          }`}
          style={{ width: "calc(100% - 8px)" }}
        >
          <span className="flex items-center justify-center h-5 w-5 flex-shrink-0">
            <span className="h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="text-sm font-medium">Live Chat</span>
        </button>

        {GROUP_ORDER.map((label) => {
          const group = grouped[label];
          if (group.length === 0) return null;
          return (
            <div key={label} className="mt-3">
              <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {label}
              </p>
              {group.map((session) => {
                const isActive = activeView === session.id;
                return (
                  <button
                    key={session.id}
                    onClick={() => onSelect(session.id)}
                    className={`w-full text-left px-3 py-2 mx-1 rounded-lg transition-colors ${
                      isActive ? "bg-zinc-700" : "hover:bg-zinc-800"
                    }`}
                    style={{ width: "calc(100% - 8px)" }}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs" aria-hidden="true">
                        {getSourceIcon(session.source)}
                      </span>
                      <span className="flex-1 truncate text-xs text-zinc-300 font-medium">
                        {getSessionPreview(session)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pl-5">
                      <span className="text-[10px] text-zinc-600">
                        {formatRelativeDate(session.started_at)}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {session.message_count}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}

        {sessions.length === 0 && (
          <p className="px-4 pt-4 text-xs text-zinc-600">No past conversations yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Root Component ──────────────────────────────────────────────────────────

export function ChatInterface({ instanceStatus, agentName, initialSessions }: ChatInterfaceProps) {
  const [activeView, setActiveView] = useState<"live" | string>("live");
  const [showSidebar, setShowSidebar] = useState(true);

  const activeSession =
    activeView !== "live"
      ? initialSessions.find((s) => s.id === activeView) ?? null
      : null;

  function handleSelect(id: "live" | string) {
    setActiveView(id);
    // On mobile, hide the sidebar when a session is selected
    setShowSidebar(false);
  }

  function handleBack() {
    setActiveView("live");
    setShowSidebar(true);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      {/* Sidebar */}
      <div
        className={`
          flex-shrink-0 w-64
          ${showSidebar ? "flex" : "hidden"}
          md:flex flex-col
        `}
      >
        <SessionsSidebar
          sessions={initialSessions}
          activeView={activeView}
          onSelect={handleSelect}
        />
      </div>

      {/* Mobile sidebar toggle (when sidebar is hidden) */}
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="md:hidden absolute left-4 top-4 z-10 flex items-center justify-center h-8 w-8 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white transition-colors"
          aria-label="Show sidebar"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Right panel */}
      <div
        className={`
          flex-1 min-w-0 overflow-hidden
          ${!showSidebar ? "flex" : "hidden"}
          md:flex flex-col
        `}
      >
        {activeSession ? (
          <HistoryPanel session={activeSession} onBack={handleBack} />
        ) : (
          <LiveChatPanel instanceStatus={instanceStatus} agentName={agentName} />
        )}
      </div>
    </div>
  );
}
