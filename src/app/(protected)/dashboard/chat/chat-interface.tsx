"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

interface ChatInterfaceProps {
  instanceStatus: string;
  agentName: string;
}

export function ChatInterface({ instanceStatus, agentName }: ChatInterfaceProps) {
  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/engine/chat" }),
  });

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === "streaming" || status === "submitted";
  const agentNotRunning = instanceStatus !== "running";

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  function resizeTextarea() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lineHeight = 20;
    const maxLines = 5;
    const maxHeight = lineHeight * maxLines + 16; // 16px for padding
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
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Agent-not-running banner */}
      {agentNotRunning && (
        <div className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-zinc-900 px-4 py-3">
          <svg
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <p className="text-sm text-amber-300">
            Your agent is not running.{" "}
            <a href="/dashboard" className="underline hover:text-amber-200 transition-colors">
              Start it from the Overview tab.
            </a>
          </p>
        </div>
      )}

      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isEmpty ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
              <svg
                className="h-6 w-6 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                />
              </svg>
            </div>
            <p className="text-base font-medium text-white">
              Chat with {agentName}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Send a message to get started.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={
                    isUser
                      ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-white"
                      : "mr-auto max-w-[80%] rounded-2xl rounded-bl-sm bg-zinc-800 px-4 py-2 text-zinc-100"
                  }
                >
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {msg.parts?.map((part, i) =>
                      part.type === "text" ? (
                        <span key={i}>{part.text}</span>
                      ) : null
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}

        {/* Error display */}
        {error && (
          <div className="text-center py-2">
            <p className="text-sm text-red-400">{error.message}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
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
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
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
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
