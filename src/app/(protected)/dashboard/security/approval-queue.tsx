"use client";

import { useCallback, useEffect, useState } from "react";

interface QueueItem {
  id: string;
  source: string;
  sender: string | null;
  subject: string | null;
  content: string;
  redactionCount: number;
  injectionSignals: string[];
  createdAt: string;
  expiresAt: string;
  status: string;
}

export function ApprovalQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/engine/security/queue");
      const data = await res.json();
      if (data.success) {
        setItems(data.data?.items ?? []);
        setError(null);
      } else {
        setError(data.error ?? "Failed to load queue");
      }
    } catch {
      setError("Failed to connect to security service");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  async function handleResolve(id: string, decision: "approved" | "rejected") {
    const confirmMsg = decision === "approved"
      ? "Approve this item? It will be processed."
      : "Reject this item? It will be discarded.";
    if (!confirm(confirmMsg)) return;

    setResolving(id);
    try {
      const res = await fetch(`/api/engine/security/queue/${encodeURIComponent(id)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchQueue();
      } else {
        alert(data.error ?? "Failed to resolve item");
      }
    } catch {
      alert("Failed to resolve item");
    } finally {
      setResolving(null);
    }
  }

  if (loading) {
    return <p className="text-zinc-500">Loading approval queue...</p>;
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-zinc-400">
        <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        No pending approvals
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">{items.length} item(s) pending review</p>
      {items.map((item) => {
        const expiresIn = Math.max(0, Math.floor((new Date(item.expiresAt).getTime() - Date.now()) / 60_000));
        const isUrgent = expiresIn < 120;

        return (
          <div
            key={item.id}
            className={`rounded-md border p-4 ${
              isUrgent ? "border-yellow-700 bg-yellow-950/20" : "border-zinc-700 bg-zinc-800/50"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="rounded bg-zinc-700 px-1.5 py-0.5">{item.source}</span>
                  {item.sender && <span>{item.sender}</span>}
                  {isUrgent && (
                    <span className="text-yellow-400">Expires in {expiresIn}m</span>
                  )}
                </div>
                {item.subject && (
                  <p className="mt-1 text-sm font-medium text-white">{item.subject}</p>
                )}
                <p className="mt-1 text-sm text-zinc-300 line-clamp-3">
                  {item.content.length > 300 ? item.content.slice(0, 300) + "..." : item.content}
                </p>
                <div className="mt-2 flex gap-2 text-xs text-zinc-500">
                  {item.redactionCount > 0 && (
                    <span>{item.redactionCount} redaction(s)</span>
                  )}
                  {item.injectionSignals.length > 0 && (
                    <span className="text-yellow-500">
                      Signals: {item.injectionSignals.join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => handleResolve(item.id, "approved")}
                  disabled={resolving === item.id}
                  className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
                >
                  {resolving === item.id ? "..." : "Approve"}
                </button>
                <button
                  onClick={() => handleResolve(item.id, "rejected")}
                  disabled={resolving === item.id}
                  className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {resolving === item.id ? "..." : "Reject"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
