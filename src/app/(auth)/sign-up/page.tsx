"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || "Registration failed. Please try again.");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Check your email</h1>
        <p className="text-zinc-400 mb-6">
          We sent a verification link to <strong className="text-white">{email}</strong>.
          Click the link to verify your account and get started.
        </p>
        <p className="text-zinc-500 text-sm">
          Didn&apos;t receive it? Check your spam folder or{" "}
          <Link href="/sign-in" className="text-blue-400 hover:text-blue-300">
            sign in
          </Link>{" "}
          to resend.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Create your account</h1>
      <p className="text-zinc-400 mb-6">
        Registration is invite-only during early access. If you&apos;ve been
        invited, use the email address your invite was sent to.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-zinc-300 mb-1">
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Your name"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Minimum 12 characters"
          />
          <p className="mt-1 text-xs text-zinc-500">
            {password.length > 0 && password.length < 12
              ? `${12 - password.length} more characters needed`
              : password.length >= 12
                ? "Password meets requirements"
                : "Minimum 12 characters"}
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-md p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-400">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-blue-400 hover:text-blue-300">
          Sign in
        </Link>
      </p>
    </div>
  );
}
