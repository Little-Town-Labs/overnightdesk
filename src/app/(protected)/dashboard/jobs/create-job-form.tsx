"use client";

import { useState, useCallback } from "react";

interface CreateJobFormProps {
  onJobCreated: () => void;
}

const MAX_PROMPT_LENGTH = 100_000;
const MAX_NAME_LENGTH = 255;

export function CreateJobForm({ onJobCreated }: CreateJobFormProps) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearMessage();

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setMessage({ type: "error", text: "Prompt is required" });
      return;
    }

    if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
      setMessage({
        type: "error",
        text: `Prompt must be ${MAX_PROMPT_LENGTH.toLocaleString()} characters or fewer`,
      });
      return;
    }

    if (name.length > MAX_NAME_LENGTH) {
      setMessage({
        type: "error",
        text: `Name must be ${MAX_NAME_LENGTH} characters or fewer`,
      });
      return;
    }

    setSubmitting(true);

    try {
      const body: Record<string, string> = { prompt: trimmedPrompt };
      if (name.trim()) {
        body.name = name.trim();
      }

      const response = await fetch("/api/engine/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage({
          type: "error",
          text: data.error ?? "Failed to create job",
        });
        return;
      }

      setMessage({ type: "success", text: "Job created successfully" });
      setName("");
      setPrompt("");
      onJobCreated();
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Create Job</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="job-name"
            className="text-white text-sm font-medium block mb-1.5"
          >
            Name{" "}
            <span className="text-zinc-500 font-normal">(optional)</span>
          </label>
          <input
            id="job-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Give your job a name..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="job-prompt"
              className="text-white text-sm font-medium"
            >
              Prompt
            </label>
            <span
              className={`text-xs ${
                prompt.length > MAX_PROMPT_LENGTH
                  ? "text-red-400"
                  : "text-zinc-500"
              }`}
            >
              {prompt.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()}
            </span>
          </div>
          <textarea
            id="job-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            maxLength={MAX_PROMPT_LENGTH}
            placeholder="What should the assistant do?"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600 resize-y"
            required
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting || !prompt.trim()}
            className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            {submitting ? "Creating..." : "Create Job"}
          </button>

          {message && (
            <p
              className={`text-sm ${
                message.type === "success"
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}
              role="status"
            >
              {message.text}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
