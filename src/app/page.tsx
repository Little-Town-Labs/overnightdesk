"use client";

import { useState } from "react";

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-od-base)", color: "var(--color-od-text)" }}>
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <WhoItsFor />
      <Privacy />
      <WaitlistSection />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b" style={{ borderColor: "var(--color-od-border)" }}>
      <span
        className="text-xl font-bold tracking-tight"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
      >
        OvernightDesk
      </span>
      <div className="flex items-center gap-4">
        <a
          href="/sign-in"
          className="text-sm transition-colors"
          style={{ color: "var(--color-od-text-2)" }}
        >
          Sign in
        </a>
        <a
          href="#waitlist"
          className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors btn-accent"
        >
          Get early access
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="max-w-3xl mx-auto px-6 pt-24 pb-20 text-center">
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-8"
        style={{ background: "var(--color-od-accent-bg)", color: "var(--color-od-accent)", fontFamily: "var(--font-mono)", border: "1px solid rgba(245,158,11,0.2)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--color-od-accent)" }} />
        Always on. Always yours.
      </div>
      <h1
        className="text-5xl md:text-7xl font-extrabold leading-none tracking-tight mb-6"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
      >
        Your business
        <br />
        <span style={{ color: "var(--color-od-accent)" }}>never sleeps.</span>
      </h1>
      <p
        className="text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
        style={{ color: "var(--color-od-text-2)" }}
      >
        A private AI agent that handles your customer support, operations, and
        reporting — while you focus on the work that matters. Or while you sleep.
      </p>
      <a
        href="#waitlist"
        className="inline-block px-8 py-4 text-base font-semibold rounded-lg transition-colors btn-accent"
      >
        Get early access →
      </a>
    </section>
  );
}

function Problem() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h2
        className="text-3xl font-bold mb-8"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
      >
        The problem
      </h2>
      <div className="space-y-5 text-lg leading-relaxed" style={{ color: "var(--color-od-text-2)" }}>
        <p>
          You started your business to do great work for your clients. Instead,
          you spend your evenings answering support emails, your mornings
          catching up on what happened overnight, and your weekends wondering if
          something fell through the cracks.
        </p>
        <p>
          You&apos;ve looked at AI tools, but they all want you to trust your
          client data to someone else&apos;s cloud. That&apos;s not going to work —
          especially when your clients ask where their data goes.
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Sign up and configure",
      description:
        "Pick a plan, provide your OpenRouter API key through our setup wizard. No downloads, no servers.",
    },
    {
      number: "02",
      title: "Connect your channels",
      description:
        "Link your Telegram or Discord bot. Your agent starts listening on your channels immediately.",
    },
    {
      number: "03",
      title: "Your desk is open",
      description:
        "In about 60 seconds, your private AI agent is live — handling support, monitoring operations, and reporting back to you.",
    },
  ];

  return (
    <section className="py-16" style={{ background: "var(--color-od-surface)" }}>
      <div className="max-w-3xl mx-auto px-6">
        <h2
          className="text-3xl font-bold mb-12"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
        >
          How it works
        </h2>
        <div className="space-y-10">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-6">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold"
                style={{ background: "var(--color-od-accent-bg)", color: "var(--color-od-accent)", fontFamily: "var(--font-mono)", border: "1px solid rgba(245,158,11,0.2)" }}
              >
                {step.number}
              </div>
              <div>
                <h3
                  className="text-lg font-semibold mb-1"
                  style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
                >
                  {step.title}
                </h3>
                <p className="leading-relaxed" style={{ color: "var(--color-od-text-2)" }}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhoItsFor() {
  const audiences = [
    {
      title: "Consultants",
      description:
        "Your clients expect fast replies. OvernightDesk handles the first response while you&apos;re in a meeting — or asleep.",
    },
    {
      title: "Healthcare IT",
      description:
        "When someone asks where their data goes, you have a clear answer: your private instance. Period.",
    },
    {
      title: "Financial advisors",
      description:
        "Audit trail built in. Every action logged. No client data mixed with anyone else&apos;s.",
    },
    {
      title: "Government contractors",
      description:
        "Your own isolated environment. No shared infrastructure with other tenants.",
    },
  ];

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h2
        className="text-3xl font-bold mb-3"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
      >
        Built for people like you
      </h2>
      <p className="mb-10 text-lg" style={{ color: "var(--color-od-text-2)" }}>
        Solo entrepreneurs and small teams in industries where privacy
        isn&apos;t optional.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {audiences.map((a) => (
          <div
            key={a.title}
            className="od-card p-6 transition-colors"
          >
            <h3
              className="font-semibold text-base mb-2"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
            >
              {a.title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-od-text-2)" }}
               dangerouslySetInnerHTML={{ __html: a.description }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function Privacy() {
  const points = [
    "Your own isolated instance — no other customer can see your data",
    "API credentials managed in Phase.dev — never stored in our database in plaintext",
    "Every action your agent takes is logged for your audit trail",
    "You can export or delete all your data at any time",
  ];

  return (
    <section className="py-16" style={{ background: "var(--color-od-surface)" }}>
      <div className="max-w-3xl mx-auto px-6">
        <h2
          className="text-3xl font-bold mb-8"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
        >
          Your data stays yours
        </h2>
        <ul className="space-y-4">
          {points.map((point) => (
            <li key={point} className="flex gap-3 items-start">
              <span className="mt-0.5 text-sm font-bold" style={{ color: "var(--color-od-accent)" }}>✓</span>
              <span className="leading-relaxed" style={{ color: "var(--color-od-text-2)" }}>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WaitlistSection() {
  return (
    <section id="waitlist" className="max-w-xl mx-auto px-6 py-24 text-center">
      <h2
        className="text-3xl font-bold mb-3"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
      >
        Get early access
      </h2>
      <p className="mb-10 text-lg" style={{ color: "var(--color-od-text-2)" }}>
        We&apos;re opening spots soon. Join the waitlist and be first in line.
      </p>
      <WaitlistForm />
    </section>
  );
}

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, business }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Something went wrong");
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "var(--color-od-raised)",
    border: "1px solid var(--color-od-border)",
    borderRadius: "0.5rem",
    color: "var(--color-od-text)",
    fontFamily: "var(--font-body)",
    fontSize: "0.875rem",
    outline: "none",
    transition: "border-color 0.15s",
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 500,
    marginBottom: "0.375rem",
    color: "var(--color-od-text-2)",
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  };

  if (status === "success") {
    return (
      <div className="od-card p-8">
        <p className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}>
          You&apos;re on the list.
        </p>
        <p style={{ color: "var(--color-od-text-2)" }}>
          We&apos;ll email you when your spot opens up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label htmlFor="email" style={labelStyle}>Email *</label>
        <input
          id="email" type="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourbusiness.com"
          style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = "var(--color-od-accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--color-od-border)")}
        />
      </div>
      <div>
        <label htmlFor="name" style={labelStyle}>Name</label>
        <input
          id="name" type="text"
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = "var(--color-od-accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--color-od-border)")}
        />
      </div>
      <div>
        <label htmlFor="business" style={labelStyle}>What does your business do?</label>
        <input
          id="business" type="text"
          value={business} onChange={(e) => setBusiness(e.target.value)}
          placeholder="e.g. IT consulting for healthcare"
          style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = "var(--color-od-accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--color-od-border)")}
        />
      </div>
      {status === "error" && (
        <p className="text-sm" style={{ color: "var(--color-status-error)" }}>{errorMsg}</p>
      )}
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full px-6 py-3 text-sm font-semibold rounded-lg transition-colors btn-accent disabled:opacity-50"
      >
        {status === "loading" ? "Joining..." : "Join the waitlist"}
      </button>
      <p className="text-xs text-center" style={{ color: "var(--color-od-text-3)" }}>
        No spam. We&apos;ll only email you when your spot opens.
      </p>
    </form>
  );
}

function Footer() {
  return (
    <footer
      className="max-w-5xl mx-auto px-6 py-10 text-center text-sm border-t"
      style={{ borderColor: "var(--color-od-border)", color: "var(--color-od-text-3)" }}
    >
      <span style={{ fontFamily: "var(--font-mono)" }}>
        &copy; {new Date().getFullYear()} OvernightDesk
      </span>
      {" · "}
      <span>All rights reserved.</span>
    </footer>
  );
}
