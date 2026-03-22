"use client";

import { useState } from "react";

export function ManageBillingButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch {
      // Portal redirect failed — user can retry
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? "Loading..." : "Manage Billing"}
    </button>
  );
}
