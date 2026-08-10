import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen px-6 py-16 flex items-center justify-center">
      <section className="w-full max-w-xl" aria-labelledby="workspace-title">
        <p className="font-mono text-sm text-od-accent mb-4">
          Timeless Technology Solutions
        </p>
        <h1
          id="workspace-title"
          className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-od-text"
        >
          OvernightDesk
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-od-text-2">
          Internal workspace for accessing your dashboard and conversations.
        </p>

        <div className="mt-8">
          <Link
            href="/sign-in"
            className="btn-accent inline-flex min-h-11 items-center justify-center px-5 py-3"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
