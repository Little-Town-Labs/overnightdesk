"use client";

import { useState, useCallback } from "react";

interface LogViewerProps {
  initialLines: string[];
}

export function LogViewer({ initialLines }: LogViewerProps) {
  const [lines, setLines] = useState<string[]>(initialLines);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/engine/logs");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setLines(data.data);
      } else {
        setError(data.error ?? "Failed to fetch logs");
      }
    } catch {
      setError("Failed to fetch logs");
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Engine Logs</h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {lines.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
          <p className="text-zinc-400">No logs available.</p>
        </div>
      ) : (
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-h-[600px] overflow-y-auto">
          <div className="p-4 font-mono text-sm">
            {lines.map((line, index) => (
              <div key={index} className="flex gap-4 leading-6">
                <span className="text-zinc-600 select-none shrink-0 w-10 text-right">
                  {index + 1}
                </span>
                <span className="text-zinc-300 break-all min-w-0">
                  {line}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
