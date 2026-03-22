"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

type VerifyState = "verifying" | "success" | "error" | "request";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<VerifyState>(token ? "verifying" : "request");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;

    async function verify() {
      try {
        const result = await authClient.verifyEmail({ query: { token: token! } });
        if (result.error) {
          setState("error");
          setMessage(result.error.message || "Verification failed.");
        } else {
          setState("success");
        }
      } catch {
        setState("error");
        setMessage("Verification link is invalid or expired.");
      }
    }

    verify();
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await authClient.sendVerificationEmail({ email });
      setMessage("Verification email sent. Check your inbox.");
    } catch {
      setMessage("Could not send verification email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (state === "verifying") {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Verifying your email...</h1>
        <p className="text-zinc-400">Please wait while we verify your email address.</p>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Email verified</h1>
        <p className="text-zinc-400 mb-6">
          Your email has been verified. You can now sign in.
        </p>
        <Link
          href="/sign-in"
          className="inline-block py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-md transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Verification failed</h1>
        <p className="text-zinc-400 mb-6">
          {message || "The verification link is invalid or has expired."}
        </p>
        <button
          onClick={() => setState("request")}
          className="inline-block py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-md transition-colors"
        >
          Resend verification email
        </button>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Resend verification</h1>
      <p className="text-zinc-400 mb-6">
        Enter your email to receive a new verification link.
      </p>

      <form onSubmit={handleResend} className="space-y-4">
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

        {message && (
          <div className="bg-blue-900/20 border border-blue-800 rounded-md p-3 text-blue-400 text-sm">
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
        >
          {loading ? "Sending..." : "Send verification email"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-400">
        <Link href="/sign-in" className="text-blue-400 hover:text-blue-300">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
