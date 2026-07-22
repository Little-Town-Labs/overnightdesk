"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface FormState {
  password: string;
  confirmation: string;
}

const INITIAL_FORM: FormState = {
  password: "",
  confirmation: "",
};

export function DeleteAccount() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = form.password.length > 0 && form.confirmation === "DELETE";

  const handleChange = useCallback(
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setError(null);
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!isValid) {
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        const res = await fetch("/api/account/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: form.password,
            confirmation: form.confirmation,
          }),
        });

        const data = await res.json();

        if (data.success) {
          router.push("/");
        } else {
          setError(data.error ?? "Failed to delete account.");
        }
      } catch {
        setError("An unexpected error occurred.");
      } finally {
        setSubmitting(false);
      }
    },
    [form, isValid, router]
  );

  return (
    <section className="rounded-lg border border-red-500/30 p-5 sm:p-6" style={{ background: "var(--color-od-surface)" }} aria-labelledby="delete-account-heading">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-red-400" style={{ fontFamily: "var(--font-mono)" }}>Danger zone</p>
      <h2 className="mb-2 text-lg font-semibold text-red-400" id="delete-account-heading">Delete account</h2>
      <p className="mb-4 text-sm" style={{ color: "var(--color-od-text-2)" }}>
        Deleting your account is permanent. Your subscription will be canceled and your instance will be deprovisioned.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label htmlFor="deletePassword" className="mb-1 block text-sm" style={{ color: "var(--color-od-text-2)" }}>
            Current Password
          </label>
          <input
            id="deletePassword"
            type="password"
            value={form.password}
            onChange={handleChange("password")}
            required
            autoComplete="current-password"
            className="w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1"
            style={{ background: "var(--color-od-base)", borderColor: "var(--color-od-border)", color: "var(--color-od-text)" }}
          />
        </div>

        <div>
          <label htmlFor="deleteConfirmation" className="mb-1 block text-sm" style={{ color: "var(--color-od-text-2)" }}>
            Type <span className="font-mono text-red-400">DELETE</span> to confirm
          </label>
          <input
            id="deleteConfirmation"
            type="text"
            value={form.confirmation}
            onChange={handleChange("confirmation")}
            required
            autoComplete="off"
            placeholder="DELETE"
            className="w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1"
            style={{ background: "var(--color-od-base)", borderColor: "var(--color-od-border)", color: "var(--color-od-text)" }}
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !isValid}
          className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Deleting..." : "Delete Account"}
        </button>
      </form>
    </section>
  );
}
