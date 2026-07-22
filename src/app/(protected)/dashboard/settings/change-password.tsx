"use client";

import { useState, useCallback } from "react";
import { authClient } from "@/lib/auth-client";

interface FormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const INITIAL_FORM: FormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function ChangePassword() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const validationError = getValidationError(form);

  const handleChange = useCallback(
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setMessage(null);
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const error = getValidationError(form);
      if (error) {
        setMessage({ type: "error", text: error });
        return;
      }

      setSubmitting(true);
      setMessage(null);

      try {
        const result = await authClient.changePassword({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
          revokeOtherSessions: false,
        });

        if (result.error) {
          setMessage({ type: "error", text: result.error.message ?? "Failed to change password" });
        } else {
          setMessage({ type: "success", text: "Password changed successfully." });
          setForm(INITIAL_FORM);
        }
      } catch {
        setMessage({ type: "error", text: "An unexpected error occurred." });
      } finally {
        setSubmitting(false);
      }
    },
    [form]
  );

  return (
    <section className="od-card p-5 sm:p-6" aria-labelledby="change-password-heading">
      <h2
        className="mb-1 text-lg font-semibold"
        id="change-password-heading"
        style={{ color: "var(--color-od-text)" }}
      >
        Account security
      </h2>
      <p className="mb-5 text-sm" style={{ color: "var(--color-od-text-2)" }}>
        Change the password used for your OvernightDesk account.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label htmlFor="currentPassword" className="mb-1 block text-sm" style={{ color: "var(--color-od-text-2)" }}>
            Current Password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={form.currentPassword}
            onChange={handleChange("currentPassword")}
            required
            autoComplete="current-password"
            className="w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1"
            style={{ background: "var(--color-od-base)", borderColor: "var(--color-od-border)", color: "var(--color-od-text)" }}
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="mb-1 block text-sm" style={{ color: "var(--color-od-text-2)" }}>
            New Password
          </label>
          <input
            id="newPassword"
            type="password"
            value={form.newPassword}
            onChange={handleChange("newPassword")}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1"
            style={{ background: "var(--color-od-base)", borderColor: "var(--color-od-border)", color: "var(--color-od-text)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--color-od-text-3)" }}>Minimum 8 characters</p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm" style={{ color: "var(--color-od-text-2)" }}>
            Confirm New Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange("confirmPassword")}
            required
            autoComplete="new-password"
            className="w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1"
            style={{ background: "var(--color-od-base)", borderColor: "var(--color-od-border)", color: "var(--color-od-text)" }}
          />
        </div>

        {message && (
          <p className={message.type === "success" ? "text-emerald-400 text-sm" : "text-red-400 text-sm"}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !!validationError}
          className="btn-accent rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Changing..." : "Change Password"}
        </button>
      </form>
    </section>
  );
}

function getValidationError(form: FormState): string | null {
  if (form.newPassword.length > 0 && form.newPassword.length < 8) {
    return "New password must be at least 8 characters.";
  }
  if (form.confirmPassword.length > 0 && form.newPassword !== form.confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}
