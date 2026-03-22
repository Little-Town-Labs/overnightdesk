"use client";

import { useCallback, useState } from "react";

interface FleetEventItem {
  id: number;
  instanceId: string | null;
  eventType: string;
  details: unknown;
  createdAt: Date;
}

interface FleetEventsListProps {
  initialEvents: FleetEventItem[];
}

const EVENT_TYPES = [
  "health_check_pass",
  "health_check_fail",
  "instance_unhealthy",
  "instance_recovered",
  "instance.queued",
  "instance.provisioning",
  "instance.running",
  "instance.stopped",
  "instance.error",
] as const;

function getEventBadgeColor(eventType: string): string {
  if (eventType.includes("pass") || eventType.includes("recovered")) {
    return "bg-emerald-900/50 text-emerald-400 border-emerald-800";
  }
  if (eventType.includes("fail")) {
    return "bg-amber-900/50 text-amber-400 border-amber-800";
  }
  if (eventType.includes("unhealthy") || eventType.includes("error")) {
    return "bg-red-900/50 text-red-400 border-red-800";
  }
  return "bg-zinc-800 text-zinc-400 border-zinc-700";
}

function formatTimestamp(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function FleetEventsList({ initialEvents }: FleetEventsListProps) {
  const [events, setEvents] = useState(initialEvents);
  const [filterType, setFilterType] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(initialEvents.length);
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const fetchEvents = useCallback(
    async (newOffset: number, eventType: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("offset", String(newOffset));
        if (eventType) {
          params.set("eventType", eventType);
        }

        const response = await fetch(
          `/api/admin/fleet/events?${params.toString()}`
        );
        if (response.ok) {
          const json = await response.json();
          if (json.success) {
            setEvents(json.data.events);
            setTotal(json.data.total);
            setOffset(newOffset);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleFilterChange = useCallback(
    (eventType: string) => {
      setFilterType(eventType);
      fetchEvents(0, eventType);
    },
    [fetchEvents]
  );

  const handlePrev = useCallback(() => {
    const newOffset = Math.max(0, offset - limit);
    fetchEvents(newOffset, filterType);
  }, [offset, filterType, fetchEvents]);

  const handleNext = useCallback(() => {
    const newOffset = offset + limit;
    if (newOffset < total) {
      fetchEvents(newOffset, filterType);
    }
  }, [offset, total, filterType, fetchEvents]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Fleet Events</h3>
        <select
          value={filterType}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 focus:border-zinc-600 focus:outline-none"
        >
          <option value="">All events</option>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-zinc-500">No events found.</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 rounded-lg border border-zinc-800/50 bg-zinc-950/50 px-3 py-2"
            >
              <span
                className={`mt-0.5 inline-block rounded border px-2 py-0.5 text-xs font-medium ${getEventBadgeColor(event.eventType)}`}
              >
                {event.eventType}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  {event.instanceId && (
                    <span className="font-mono">{event.instanceId.slice(0, 8)}</span>
                  )}
                  <span>{formatTimestamp(event.createdAt)}</span>
                </div>
                {event.details != null && (
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    {String(JSON.stringify(event.details))}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {total > limit && (
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handlePrev}
              disabled={offset === 0 || loading}
              className="rounded bg-zinc-800 px-3 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={offset + limit >= total || loading}
              className="rounded bg-zinc-800 px-3 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
