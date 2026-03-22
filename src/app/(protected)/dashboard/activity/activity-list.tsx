"use client";

import { useState, useCallback } from "react";

interface Conversation {
  id: string;
  channel: string;
  started_at: string;
  last_activity: string;
  [key: string]: unknown;
}

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
  [key: string]: unknown;
}

interface ActivityListProps {
  initialConversations: unknown[];
}

const PAGE_SIZE = 20;

export function ActivityList({ initialConversations }: ActivityListProps) {
  const [conversations, setConversations] = useState<Conversation[]>(
    initialConversations as Conversation[]
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchConversations = useCallback(async (newOffset: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/engine/conversations?offset=${newOffset}&limit=${PAGE_SIZE}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setConversations(data.data as Conversation[]);
        setOffset(newOffset);
        setExpandedId(null);
      }
    } catch {
      // Keep current data on error
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(id);

    if (messages[id]) {
      return;
    }

    setLoadingMessages(id);
    try {
      const res = await fetch(`/api/engine/conversations/${id}/messages`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setMessages((prev) => ({ ...prev, [id]: data.data as Message[] }));
      }
    } catch {
      // Keep empty on error
    } finally {
      setLoadingMessages(null);
    }
  }, [expandedId, messages]);

  if (conversations.length === 0 && offset === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
        <p className="text-zinc-400">No activity yet.</p>
        <p className="text-zinc-500 text-sm mt-1">
          Your assistant will show activity here once it runs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {conversations.map((conv) => {
          const isExpanded = expandedId === conv.id;
          const convMessages = messages[conv.id];
          const isLoadingThis = loadingMessages === conv.id;

          return (
            <div key={conv.id}>
              <button
                type="button"
                onClick={() => handleExpand(conv.id)}
                disabled={loading}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-sm font-medium text-zinc-300 shrink-0">
                    {conv.channel}
                  </span>
                  <span className="text-xs text-zinc-500 truncate">
                    Started {formatTimestamp(conv.started_at)}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-zinc-500">
                    Last activity {formatTimestamp(conv.last_activity)}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    {isExpanded ? "\u25B2" : "\u25BC"}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-zinc-800/50">
                  {isLoadingThis ? (
                    <p className="text-zinc-500 text-sm py-3">Loading messages...</p>
                  ) : convMessages && convMessages.length > 0 ? (
                    <div className="space-y-2 mt-3">
                      {convMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className="flex gap-3 text-sm"
                        >
                          <span className="text-zinc-500 shrink-0 w-20 text-right">
                            {msg.role}
                          </span>
                          <span className="text-zinc-300 break-words min-w-0">
                            {msg.content}
                          </span>
                          <span className="text-zinc-600 text-xs shrink-0 ml-auto">
                            {formatTimestamp(msg.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-sm py-3">No messages in this conversation.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={() => fetchConversations(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0 || loading}
          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <span className="text-xs text-zinc-500">
          {loading ? "Loading..." : `Showing ${offset + 1}\u2013${offset + conversations.length}`}
        </span>
        <button
          type="button"
          onClick={() => fetchConversations(offset + PAGE_SIZE)}
          disabled={conversations.length < PAGE_SIZE || loading}
          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString();
  } catch {
    return ts;
  }
}
