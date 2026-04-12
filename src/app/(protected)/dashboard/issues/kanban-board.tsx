"use client";

import { useState } from "react";
import type { EngineIssueResponse } from "@/lib/engine-contracts";

const COLUMNS = [
  { key: "backlog", label: "Backlog", color: "border-zinc-600" },
  { key: "todo", label: "Todo", color: "border-blue-600" },
  { key: "in_progress", label: "In Progress", color: "border-yellow-500" },
  { key: "in_review", label: "In Review", color: "border-purple-500" },
  { key: "done", label: "Done", color: "border-green-500" },
] as const;

const priorityColors: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-zinc-500/20 text-zinc-400",
  none: "bg-zinc-800 text-zinc-500",
};

interface KanbanBoardProps {
  initialIssues: EngineIssueResponse[];
}

export default function KanbanBoard({ initialIssues }: KanbanBoardProps) {
  const [issues, setIssues] = useState(initialIssues);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    setDraggedId(issueId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", issueId);
  };

  const handleDragOver = (e: React.DragEvent, column: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(column);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    const issueId = e.dataTransfer.getData("text/plain");
    if (!issueId) return;

    const issue = issues.find((i) => i.id === issueId);
    if (!issue || issue.status === newStatus) {
      setDraggedId(null);
      return;
    }

    const revert = () =>
      setIssues((prev) =>
        prev.map((i) =>
          i.id === issueId ? { ...i, status: issue.status } : i
        )
      );

    // Optimistic update
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, status: newStatus } : i))
    );
    setDraggedId(null);
    setUpdating(issueId);

    try {
      const res = await fetch(`/api/engine/issues/${encodeURIComponent(issueId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) revert();
    } catch {
      revert();
    } finally {
      setUpdating(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverColumn(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-12rem)]">
      {COLUMNS.map((col) => {
        const columnIssues = issues.filter((i) => i.status === col.key);
        const isOver = dragOverColumn === col.key;

        return (
          <div
            key={col.key}
            className={`flex-shrink-0 w-72 flex flex-col rounded-lg border-t-2 ${col.color} bg-zinc-900/50 ${
              isOver ? "ring-1 ring-zinc-500" : ""
            }`}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <div className="px-3 py-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-300">{col.label}</h3>
              <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                {columnIssues.length}
              </span>
            </div>

            <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto">
              {columnIssues.map((issue) => (
                <div
                  key={issue.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, issue.id)}
                  onDragEnd={handleDragEnd}
                  className={`p-3 rounded-md border border-zinc-800 bg-zinc-900 cursor-grab active:cursor-grabbing transition-opacity ${
                    draggedId === issue.id ? "opacity-40" : ""
                  } ${updating === issue.id ? "animate-pulse" : ""} hover:border-zinc-700`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-zinc-500">
                      {issue.identifier}
                    </span>
                    {issue.priority && issue.priority !== "none" && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          priorityColors[issue.priority] ?? priorityColors.none
                        }`}
                      >
                        {issue.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white leading-snug line-clamp-2">
                    {issue.title}
                  </p>
                  {issue.assignee_agent_id && (
                    <p className="text-[10px] text-zinc-500 mt-1.5">
                      {issue.assignee_agent_id}
                    </p>
                  )}
                </div>
              ))}

              {columnIssues.length === 0 && (
                <div
                  className={`text-center py-8 text-xs text-zinc-600 rounded border border-dashed ${
                    isOver ? "border-zinc-500 bg-zinc-800/30" : "border-zinc-800"
                  }`}
                >
                  {isOver ? "Drop here" : "No issues"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
