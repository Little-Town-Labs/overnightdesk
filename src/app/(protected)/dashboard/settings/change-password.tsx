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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Change Password</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label htmlFor="currentPassword" className="block text-sm text-zinc-400 mb-1">
            Current Password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={form.currentPassword}
            onChange={handleChange("currentPassword")}
            required
            autoComplete="current-password"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="block text-sm text-zinc-400 mb-1">
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
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
          />
          <p className="text-zinc-600 text-xs mt-1">Minimum 8 characters</p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm text-zinc-400 mb-1">
            Confirm New Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange("confirmPassword")}
            required
            autoComplete="new-password"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
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
          className="px-4 py-2 text-sm rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Changing..." : "Change Password"}
        </button>
      </form>
    </div>
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
