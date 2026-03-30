"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
      <h2 className="text-lg font-semibold text-zinc-300 mb-2">Something went wrong</h2>
      <p className="text-zinc-500 text-sm mb-4">
        Unable to load this page. The engine may be temporarily unavailable.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
