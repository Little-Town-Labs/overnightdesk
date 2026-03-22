import Link from "next/link";

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-emerald-400"
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
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">
            Subscription active
          </h1>
          <p className="text-zinc-400 mb-6">
            Your payment was successful. Your AI assistant instance is being
            set up.
          </p>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Next steps
            </h2>
            <ol className="text-left text-sm text-zinc-400 space-y-2">
              <li className="flex gap-2">
                <span className="text-zinc-500 font-mono">1.</span>
                Go to your dashboard
              </li>
              <li className="flex gap-2">
                <span className="text-zinc-500 font-mono">2.</span>
                Connect your Claude Code account
              </li>
              <li className="flex gap-2">
                <span className="text-zinc-500 font-mono">3.</span>
                Your assistant starts running 24/7
              </li>
            </ol>
          </div>

          <Link
            href="/dashboard"
            className="mt-8 block w-full py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors text-center"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
