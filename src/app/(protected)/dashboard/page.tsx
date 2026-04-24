import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSubscriptionForUser, isAdmin } from "@/lib/billing";
import { ManageBillingButton } from "./manage-billing-button";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AuthStatusBadge } from "./auth-status-badge";
import { OnboardingWizard } from "./onboarding-wizard";
import { RestartButton } from "./restart-button";
import { getEngineStatus } from "@/lib/engine-client";
import { isHermesTenant } from "@/lib/instance";

const statusConfig: Record<
  string,
  { label: string; color: string; detail: string }
> = {
  queued: {
    label: "Setting up",
    color: "text-amber-400",
    detail: "Your instance is queued for provisioning...",
  },
  provisioning: {
    label: "Creating",
    color: "text-amber-400",
    detail: "Your container is being created...",
  },
  awaiting_auth: {
    label: "Awaiting Auth",
    color: "text-blue-400",
    detail: "Connect your Claude Code account to get started.",
  },
  running: {
    label: "Running",
    color: "text-emerald-400",
    detail: "Your assistant is live and running 24/7.",
  },
  stopped: {
    label: "Stopped",
    color: "text-zinc-400",
    detail: "Your instance has been stopped.",
  },
  error: {
    label: "Error",
    color: "text-red-400",
    detail: "Setup failed. Please contact support.",
  },
  deprovisioned: {
    label: "Deprovisioned",
    color: "text-zinc-500",
    detail: "Your instance has been deprovisioned.",
  },
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const userIsAdmin = isAdmin(session.user.email);
  const [rawSub, instances] = await Promise.all([
    getSubscriptionForUser(session.user.id),
    db
      .select()
      .from(instance)
      .where(eq(instance.userId, session.user.id)),
  ]);

  const sub = rawSub
    ? {
        status: rawSub.status,
        plan: rawSub.plan,
        currentPeriodEnd: rawSub.currentPeriodEnd,
        hasStripeCustomer: !!rawSub.stripeCustomerId,
      }
    : null;

  const inst = instances[0] ?? null;
  const instConfig = inst
    ? (statusConfig[inst.status] ?? {
        label: inst.status,
        color: "text-zinc-400",
        detail: "",
      })
    : { label: "", color: "", detail: "" };

  const showOnboarding =
    inst?.status === "running" && inst.claudeAuthStatus !== "connected";

  const hermesAgent = isHermesTenant(inst);

  // Fetch engine status when the instance is running
  let engineStatus: Record<string, unknown> | null = null;
  if (inst?.status === "running" && inst.subdomain && inst.engineApiKey && !hermesAgent) {
    engineStatus = await getEngineStatus(inst.subdomain, inst.engineApiKey);
  }

  // Hermes: fetch public /api/status (no auth required)
  let hermesStatus: Record<string, unknown> | null = null;
  if (hermesAgent && inst?.status === "running" && inst.subdomain) {
    try {
      const res = await fetch(`https://${inst.subdomain}/api/status`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) hermesStatus = await res.json();
    } catch {
      // non-fatal
    }
  }

  return (
    <>
      {sub?.status === "past_due" && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <p className="text-amber-300 text-sm font-medium">
            Your payment failed. Please update your payment method within the
            grace period to avoid service interruption.
          </p>
          <ManageBillingButton className="mt-2 text-amber-400 hover:text-amber-300 text-sm underline" />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Account Info
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-zinc-500">Name</dt>
              <dd className="text-white">{session.user.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Email</dt>
              <dd className="text-white">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Email Verified</dt>
              <dd className="text-white">
                {session.user.emailVerified ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Subscription
            {userIsAdmin && (
              <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-normal">
                Admin
              </span>
            )}
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-zinc-500">Plan</dt>
              <dd className="text-white capitalize">
                {userIsAdmin ? "Pro (Admin)" : (sub?.plan ?? "None")}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Status</dt>
              <dd className="text-white capitalize">
                {userIsAdmin ? "Active" : (sub?.status ?? "No subscription")}
              </dd>
            </div>
            {sub?.currentPeriodEnd && (
              <div>
                <dt className="text-sm text-zinc-500">Next Billing Date</dt>
                <dd className="text-white">
                  {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
          {sub?.hasStripeCustomer && (
            <div className="mt-4">
              <ManageBillingButton className="text-sm text-blue-400 hover:text-blue-300 underline" />
            </div>
          )}
        </div>
      </div>

      {inst ? (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Instance</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-zinc-500">Status</dt>
              <dd className={`font-medium ${instConfig.color}`}>
                {instConfig.label}
              </dd>
              <dd className="text-zinc-500 text-sm mt-1">
                {instConfig.detail}
              </dd>
            </div>
            {inst.subdomain && inst.status === "running" && (
              <div>
                <dt className="text-sm text-zinc-500">Subdomain</dt>
                <dd className="text-white">
                  <a
                    href={`https://${inst.subdomain}`}
                    className="text-blue-400 hover:text-blue-300 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {inst.subdomain}
                  </a>
                </dd>
              </div>
            )}
            {inst.status === "running" && !hermesAgent && (
              <div>
                <dt className="text-sm text-zinc-500">Claude Code</dt>
                <dd className="mt-1">
                  <AuthStatusBadge status={inst.claudeAuthStatus} />
                </dd>
              </div>
            )}
          </dl>
          <RestartButton instanceRunning={inst.status === "running"} />
        </div>
      ) : (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
          <p className="text-zinc-400">No instance provisioned yet.</p>
          <p className="text-zinc-500 text-sm mt-1">
            Your instance will be created automatically after payment.
          </p>
        </div>
      )}

      {hermesStatus && inst?.subdomain && (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Agent</h2>
          <dl className="space-y-3">
            {hermesStatus.version != null && (
              <div>
                <dt className="text-sm text-zinc-500">Version</dt>
                <dd className="text-white">{String(hermesStatus.version)}</dd>
              </div>
            )}
            {hermesStatus.active_sessions != null && (
              <div>
                <dt className="text-sm text-zinc-500">Active Sessions</dt>
                <dd className="text-white">{String(hermesStatus.active_sessions)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-6">
            <a
              href={`https://${inst.subdomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Launch Agent Dashboard
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>
      )}

      {engineStatus && (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Engine Status
          </h2>
          <dl className="space-y-3">
            {engineStatus.uptime != null && (
              <div>
                <dt className="text-sm text-zinc-500">Uptime</dt>
                <dd className="text-white">
                  {formatUptime(Number(engineStatus.uptime))}
                </dd>
              </div>
            )}
            {(engineStatus.queue as Record<string, unknown>)?.queue_depth != null && (
              <div>
                <dt className="text-sm text-zinc-500">Queue Depth</dt>
                <dd className="text-white">
                  {String((engineStatus.queue as Record<string, unknown>).queue_depth)} jobs
                </dd>
              </div>
            )}
            {(engineStatus.heartbeat as Record<string, unknown>)?.last_run != null && (
              <div>
                <dt className="text-sm text-zinc-500">Last Heartbeat</dt>
                <dd className="text-white">
                  {new Date(
                    String((engineStatus.heartbeat as Record<string, unknown>).last_run)
                  ).toLocaleString()}
                </dd>
              </div>
            )}
            {engineStatus.version != null && (
              <div>
                <dt className="text-sm text-zinc-500">Engine Version</dt>
                <dd className="text-white">{String(engineStatus.version)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {showOnboarding && (
        <div className="mt-6">
          <OnboardingWizard
            instanceSubdomain={inst!.subdomain ?? ""}
            authStatus={inst!.claudeAuthStatus}
          />
        </div>
      )}
    </>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(" ");
}
