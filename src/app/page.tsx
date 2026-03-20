"use client";

import { useState } from "react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
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
    <nav className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
      <span className="text-xl font-bold tracking-tight">OvernightDesk</span>
      <a
        href="#waitlist"
        className="text-sm font-medium px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
      >
        Join the waitlist
      </a>
    </nav>
  );
}

function Hero() {
  return (
    <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
      <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6">
        Your business
        <br />
        never sleeps.
      </h1>
      <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
        OvernightDesk is a private AI assistant that handles your customer
        support, operations, and reporting — while you focus on the work that
        matters. Or while you sleep.
      </p>
      <a
        href="#waitlist"
        className="inline-block px-8 py-4 bg-gray-900 text-white text-lg font-medium rounded-lg hover:bg-gray-700 transition-colors"
      >
        Get early access
      </a>
    </section>
  );
}

function Problem() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold mb-8">The problem</h2>
      <div className="space-y-6 text-lg text-gray-600 leading-relaxed">
        <p>
          You started your business to do great work for your clients. Instead,
          you spend your evenings answering support emails, your mornings
          catching up on what happened overnight, and your weekends wondering if
          something fell through the cracks.
        </p>
        <p>
          You&apos;ve looked at AI tools, but they all want you to set up
          servers, learn APIs, or trust your client data to someone else&apos;s
          cloud. That&apos;s not going to work — especially when your clients ask
          where their data goes.
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "1",
      title: "Sign up and pick your plan",
      description: "No setup wizards. No downloads. Just pick a plan and go.",
    },
    {
      number: "2",
      title: "Connect your AI key",
      description:
        "Create a free OpenRouter account, grab your API key, paste it in. We walk you through it step by step. You control your own AI costs — no surprises.",
    },
    {
      number: "3",
      title: "Your desk is open",
      description:
        "In about 60 seconds, your private AI assistant is live. It starts handling support, monitoring your systems, and sending you a weekly report every Monday morning.",
    },
  ];

  return (
    <section className="bg-gray-50 py-16">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl font-bold mb-12">How it works</h2>
        <div className="space-y-10">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-6">
              <div className="flex-shrink-0 w-10 h-10 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-lg">
                {step.number}
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed">
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
        "Your clients expect fast replies. OvernightDesk handles the first response while you're in a meeting — or asleep.",
    },
    {
      title: "Healthcare IT",
      description:
        "When someone asks where their data goes, you have a clear answer: it stays on your private instance. Period.",
    },
    {
      title: "Financial advisors",
      description:
        "Audit trail built in. Every action logged. No client data mixed with anyone else's.",
    },
    {
      title: "Government contractors",
      description:
        "Your own isolated environment with encryption at rest. No shared infrastructure with other tenants.",
    },
  ];

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold mb-4">Built for people like you</h2>
      <p className="text-gray-600 mb-10 text-lg">
        Solo entrepreneurs and small teams in industries where privacy
        isn&apos;t optional.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {audiences.map((a) => (
          <div key={a.title} className="border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">{a.title}</h3>
            <p className="text-gray-600 leading-relaxed">{a.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section className="bg-gray-50 py-16">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl font-bold mb-8">Your data stays yours</h2>
        <ul className="space-y-4 text-lg text-gray-600">
          <li className="flex gap-3">
            <span className="text-gray-900 font-bold">&#x2713;</span>
            Your own isolated instance — no other customer can see your data
          </li>
          <li className="flex gap-3">
            <span className="text-gray-900 font-bold">&#x2713;</span>
            API keys encrypted at rest with AES-256
          </li>
          <li className="flex gap-3">
            <span className="text-gray-900 font-bold">&#x2713;</span>
            Every action your assistant takes is logged for your audit trail
          </li>
          <li className="flex gap-3">
            <span className="text-gray-900 font-bold">&#x2713;</span>
            You can export or delete all your data at any time
          </li>
          <li className="flex gap-3">
            <span className="text-gray-900 font-bold">&#x2713;</span>
            You bring your own AI key — we never see your conversations
          </li>
        </ul>
      </div>
    </section>
  );
}

function WaitlistSection() {
  return (
    <section id="waitlist" className="max-w-xl mx-auto px-6 py-20 text-center">
      <h2 className="text-3xl font-bold mb-4">Get early access</h2>
      <p className="text-gray-600 mb-8 text-lg">
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
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
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
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong"
      );
    }
  }

  if (status === "success") {
    return (
      <div className="bg-gray-50 rounded-lg p-8">
        <p className="text-xl font-semibold mb-2">You&apos;re on the list.</p>
        <p className="text-gray-600">
          We&apos;ll email you when your spot opens up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email *
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourbusiness.com"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div>
        <label htmlFor="business" className="block text-sm font-medium mb-1">
          What does your business do?
        </label>
        <input
          id="business"
          type="text"
          value={business}
          onChange={(e) => setBusiness(e.target.value)}
          placeholder="e.g. IT consulting for healthcare"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {status === "error" && (
        <p className="text-red-600 text-sm">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {status === "loading" ? "Joining..." : "Join the waitlist"}
      </button>

      <p className="text-xs text-gray-400 text-center">
        No spam. We&apos;ll only email you when your spot opens.
      </p>
    </form>
  );
}

function Footer() {
  return (
    <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-gray-200 text-center text-sm text-gray-400">
      <p>&copy; {new Date().getFullYear()} OvernightDesk. All rights reserved.</p>
    </footer>
  );
}
