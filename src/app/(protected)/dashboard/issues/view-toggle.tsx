"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface ViewToggleProps {
  currentView: string;
}

export default function ViewToggle({ currentView }: ViewToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggle = (view: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "list") {
      params.delete("view");
    } else {
      params.set("view", view);
    }
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "/dashboard/issues");
  };

  return (
    <div className="flex bg-zinc-800 rounded-md p-0.5">
      <button
        onClick={() => toggle("list")}
        className={`px-3 py-1.5 text-xs rounded transition-colors ${
          currentView === "list"
            ? "bg-zinc-700 text-white"
            : "text-zinc-400 hover:text-zinc-300"
        }`}
      >
        List
      </button>
      <button
        onClick={() => toggle("board")}
        className={`px-3 py-1.5 text-xs rounded transition-colors ${
          currentView === "board"
            ? "bg-zinc-700 text-white"
            : "text-zinc-400 hover:text-zinc-300"
        }`}
      >
        Board
      </button>
    </div>
  );
}
