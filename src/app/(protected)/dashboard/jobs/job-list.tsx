"use client";

import { useState, useCallback } from "react";
import { CreateJobForm } from "./create-job-form";

interface Job {
  id: string;
  name?: string;
  status: string;
  source?: string;
  prompt?: string;
  result?: string;
  error?: string;
  createdAt?: string;
}

interface JobListProps {
  initialJobs: Record<string, unknown>[];
}

const PAGE_SIZE = 20;

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  running: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
};

const sourceColors: Record<string, string> = {
  dashboard: "bg-zinc-700 text-zinc-300",
  heartbeat: "bg-purple-500/20 text-purple-400",
  cron: "bg-indigo-500/20 text-indigo-400",
  telegram: "bg-sky-500/20 text-sky-400",
  discord: "bg-violet-500/20 text-violet-400",
};

function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status] ?? "bg-zinc-700 text-zinc-300";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const color = sourceColors[source] ?? "bg-zinc-700 text-zinc-300";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {source}
    </span>
  );
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function JobList({ initialJobs }: JobListProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs as unknown as Job[]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchJobs = useCallback(async (newOffset: number) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/engine/jobs?offset=${newOffset}&limit=${PAGE_SIZE}`
      );
      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        setJobs(data.data as Job[]);
        setOffset(newOffset);
      }
    } catch {
      setActionMessage({ type: "error", text: "Failed to load jobs" });
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePrevious = useCallback(() => {
    const newOffset = Math.max(0, offset - PAGE_SIZE);
    fetchJobs(newOffset);
  }, [offset, fetchJobs]);

  const handleNext = useCallback(() => {
    fetchJobs(offset + PAGE_SIZE);
  }, [offset, fetchJobs]);

  const handleDelete = useCallback(
    async (jobId: string) => {
      setDeleteConfirm(null);
      setLoading(true);
      try {
        const response = await fetch(`/api/engine/jobs/${jobId}`, {
          method: "DELETE",
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          setActionMessage({
            type: "error",
            text: data.error ?? "Failed to delete job",
          });
          return;
        }

        setActionMessage({ type: "success", text: "Job deleted" });
        await fetchJobs(offset);
      } catch {
        setActionMessage({ type: "error", text: "Network error" });
      } finally {
        setLoading(false);
      }
    },
    [offset, fetchJobs]
  );

  const handleJobCreated = useCallback(() => {
    fetchJobs(0);
  }, [fetchJobs]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-6">
      <CreateJobForm onJobCreated={handleJobCreated} />

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Job History</h2>
        </div>

        {actionMessage && (
          <div className="px-4 pt-3">
            <p
              className={`text-sm ${
                actionMessage.type === "success"
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}
              role="status"
            >
              {actionMessage.text}
            </p>
          </div>
        )}

        {jobs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-zinc-400">No jobs found.</p>
            <p className="text-zinc-500 text-sm mt-1">
              Create a job above to get started.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800" role="list">
            {jobs.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => toggleExpand(job.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors text-left"
                  aria-expanded={expandedId === job.id}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm font-medium truncate block">
                      {job.name || "Untitled"}
                    </span>
                    {job.createdAt && (
                      <span className="text-zinc-500 text-xs">
                        {formatTime(job.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {job.source && <SourceBadge source={job.source} />}
                    <StatusBadge status={job.status} />
                    <span
                      className={`text-zinc-500 text-xs transition-transform ${
                        expandedId === job.id ? "rotate-180" : ""
                      }`}
                    >
                      ▼
                    </span>
                  </div>
                </button>

                {expandedId === job.id && (
                  <div className="px-4 pb-4 border-t border-zinc-800/50">
                    <dl className="space-y-3 mt-3">
                      {job.prompt && (
                        <div>
                          <dt className="text-sm text-zinc-500">Prompt</dt>
                          <dd className="text-white text-sm mt-1 whitespace-pre-wrap bg-zinc-800 rounded-md p-3 max-h-40 overflow-y-auto">
                            {job.prompt}
                          </dd>
                        </div>
                      )}
                      {job.status === "completed" && job.result && (
                        <div>
                          <dt className="text-sm text-zinc-500">Result</dt>
                          <dd className="text-emerald-300 text-sm mt-1 whitespace-pre-wrap bg-zinc-800 rounded-md p-3 max-h-40 overflow-y-auto">
                            {job.result}
                          </dd>
                        </div>
                      )}
                      {job.status === "failed" && job.error && (
                        <div>
                          <dt className="text-sm text-zinc-500">Error</dt>
                          <dd className="text-red-300 text-sm mt-1 whitespace-pre-wrap bg-zinc-800 rounded-md p-3 max-h-40 overflow-y-auto">
                            {job.error}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {job.status === "pending" && (
                      <div className="mt-3">
                        {deleteConfirm === job.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 text-sm">
                              Delete this job?
                            </span>
                            <button
                              onClick={() => handleDelete(job.id)}
                              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(job.id)}
                            className="px-3 py-1 text-xs bg-zinc-800 hover:bg-red-600/20 text-red-400 border border-zinc-700 hover:border-red-600/40 rounded-md transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={offset === 0 || loading}
            className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:text-zinc-600 disabled:cursor-not-allowed text-zinc-300 rounded-md transition-colors"
          >
            Previous
          </button>
          <span className="text-zinc-500 text-sm">
            {loading ? "Loading..." : `Showing ${offset + 1}-${offset + jobs.length}`}
          </span>
          <button
            onClick={handleNext}
            disabled={jobs.length < PAGE_SIZE || loading}
            className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:text-zinc-600 disabled:cursor-not-allowed text-zinc-300 rounded-md transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
