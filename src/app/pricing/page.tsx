import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { PricingCard } from "./pricing-card";

const plans = [
  {
    name: "Starter",
    plan: "starter" as const,
    price: "$29",
    description: "For solo operators getting started",
    features: [
      "Isolated AI assistant instance",
      "256 MB RAM / 0.25 CPU",
      "Heartbeat scheduler",
      "Cron job engine",
      "Telegram & Discord bridges",
      "Web terminal access",
      "Email support",
    ],
  },
  {
    name: "Pro",
    plan: "pro" as const,
    price: "$59",
    description: "For businesses that need more power",
    features: [
      "Everything in Starter",
      "512 MB RAM / 0.5 CPU",
      "Priority provisioning",
      "Priority support",
    ],
    highlighted: true,
  },
];

export default async function PricingPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Your AI assistant runs 24/7 in an isolated container. Pick a plan,
            connect your Claude Code subscription, and you&apos;re live.
          </p>
          <div className="mt-4 inline-block bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2">
            <p className="text-zinc-400 text-sm">
              <span className="text-amber-400 font-medium">BYOS:</span> You
              bring your own{" "}
              <a
                href="https://claude.ai"
                className="text-blue-400 hover:text-blue-300 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Claude Code subscription
              </a>
              . We never see your credentials.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <PricingCard
              key={plan.plan}
              {...plan}
              isAuthenticated={!!session}
            />
          ))}
        </div>

        <p className="text-center text-zinc-500 text-sm mt-12">
          All plans include full feature access. Plans differ by container
          resources only.
          <br />
          Cancel anytime — no contracts, no hidden fees.
        </p>
      </div>
    </div>
  );
}
