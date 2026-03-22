"use client";

import { useState } from "react";

interface PricingCardProps {
  name: string;
  plan: "starter" | "pro";
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  isAuthenticated: boolean;
}

export function PricingCard({
  name,
  plan,
  price,
  description,
  features,
  highlighted,
  isAuthenticated,
}: PricingCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    if (!isAuthenticated) {
      window.location.href = `/sign-in?redirect=/pricing`;
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch {
      setError("Failed to start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`rounded-xl border p-8 flex flex-col ${
        highlighted
          ? "border-blue-500 bg-zinc-900/80 ring-1 ring-blue-500/20"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      {highlighted && (
        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
          Most Popular
        </span>
      )}
      <h2 className="text-xl font-bold text-white">{name}</h2>
      <p className="text-zinc-400 text-sm mt-1">{description}</p>

      <div className="mt-6 mb-6">
        <span className="text-4xl font-bold text-white">{price}</span>
        <span className="text-zinc-500 text-sm">/month</span>
      </div>

      <ul className="space-y-3 flex-1">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <svg
              className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-zinc-300">{feature}</span>
          </li>
        ))}
      </ul>

      {error && (
        <p className="text-red-400 text-sm mt-4">{error}</p>
      )}

      <button
        onClick={handleSubscribe}
        disabled={loading}
        className={`mt-8 w-full py-3 px-4 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          highlighted
            ? "bg-blue-600 hover:bg-blue-500 text-white"
            : "bg-zinc-800 hover:bg-zinc-700 text-white"
        }`}
      >
        {loading
          ? "Redirecting..."
          : isAuthenticated
            ? "Subscribe"
            : "Sign in to subscribe"}
      </button>
    </div>
  );
}
