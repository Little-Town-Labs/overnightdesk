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
import { SetupWizard } from "./setup-wizard";
import { ProvisioningProgress } from "./provisioning-progress";

const statusConfig: Record<
  string,
  { label: string; color: string; detail: string }
> = {
  queued: {
    label: "Setup Required",
    color: "text-sky-400",
    detail: "Complete the setup wizard to activate your agent.",
  },
  awaiting_provisioning: {
    label: "Starting Up",
    color: "text-amber-400",
    detail: "Your setup is complete — spinning up your agent now...",
  },
  provisioning: {
    label: "Provisioning",
    color: "text-amber-400",
    detail: "Your agent container is being created...",
  },
  awaiting_auth: {
    label: "Awaiting Auth",
    color: "text-sky-400",
    detail: "Authentication required to activate.",
  },
  running: {
    label: "Online",
    color: "text-emerald-400",
    detail: "Your agent is live and ready.",
  },
  stopped: {
    label: "Offline",
    color: "text-od-text-2",
    detail: "Your agent has been stopped.",
  },
  error: {
    label: "Error",
    color: "text-red-400",
    detail: "Something went wrong. Please contact support.",
  },
  deprovisioned: {
    label: "Deprovisioned",
    color: "text-od-text-3",
    detail: "This instance has been deprovisioned.",
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

      <div className="grid gap-4 md:grid-cols-2">
        <div className="od-card p-6">
          <h2 className="text-sm font-medium mb-4 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-2)" }}>
            Account
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Name</dt>
              <dd className="text-sm font-medium" style={{ color: "var(--color-od-text)" }}>{session.user.name}</dd>
            </div>
            <div>
              <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Email</dt>
              <dd className="text-sm" style={{ color: "var(--color-od-text-2)" }}>{session.user.email}</dd>
            </div>
          </dl>
        </div>

        <div className="od-card p-6">
          <h2 className="text-sm font-medium mb-4 uppercase tracking-wider flex items-center gap-2" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-2)" }}>
            Subscription
            {userIsAdmin && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-od-accent-bg)", color: "var(--color-od-accent)" }}>
                Admin
              </span>
            )}
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Plan</dt>
              <dd className="text-sm font-medium capitalize" style={{ color: "var(--color-od-text)" }}>
                {userIsAdmin ? "Pro (Admin)" : (sub?.plan ?? "None")}
              </dd>
            </div>
            <div>
              <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Status</dt>
              <dd className="text-sm capitalize" style={{ color: "var(--color-od-text-2)" }}>
                {userIsAdmin ? "Active" : (sub?.status ?? "No subscription")}
              </dd>
            </div>
            {sub?.currentPeriodEnd && (
              <div>
                <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Renews</dt>
                <dd className="text-sm" style={{ color: "var(--color-od-text-2)" }}>
                  {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
          {sub?.hasStripeCustomer && (
            <div className="mt-4" style={{ color: "var(--color-od-accent)" }}>
              <ManageBillingButton className="text-xs underline" />
            </div>
          )}
        </div>
      </div>

      {inst ? (
        <>
          {/* Hermes tenants: setup wizard replaces the instance card while queued */}
          {hermesAgent && inst.status === "queued" ? (
            <div className="mt-6">
              <SetupWizard
                tenantId={inst.tenantId}
                instanceId={inst.id}
                wizardState={inst.wizardState ?? null}
              />
            </div>
          ) : hermesAgent && (inst.status === "awaiting_provisioning" || inst.status === "provisioning") ? (
            <div className="mt-6">
              <ProvisioningProgress initialStatus={inst.status} />
            </div>
          ) : (
            <div className="mt-4 od-card p-6">
              <h2 className="text-sm font-medium mb-4 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-2)" }}>
                Instance
              </h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs mb-1" style={{ color: "var(--color-od-text-3)" }}>Status</dt>
                  <dd className={`text-sm font-medium ${instConfig.color}`}>
                    {instConfig.label}
                  </dd>
                  <dd className="text-xs mt-0.5" style={{ color: "var(--color-od-text-3)" }}>
                    {instConfig.detail}
                  </dd>
                </div>
                {inst.subdomain && inst.status === "running" && (
                  <div>
                    <dt className="text-xs mb-1" style={{ color: "var(--color-od-text-3)" }}>Endpoint</dt>
                    <dd>
                      <a
                        href={`https://${inst.subdomain}`}
                        className="text-xs underline transition-colors"
                        style={{ color: "var(--color-od-accent)", fontFamily: "var(--font-mono)" }}
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
                    <dt className="text-xs mb-1" style={{ color: "var(--color-od-text-3)" }}>Claude Code</dt>
                    <dd className="mt-1">
                      <AuthStatusBadge status={inst.claudeAuthStatus} />
                    </dd>
                  </div>
                )}
              </dl>
              <RestartButton instanceRunning={inst.status === "running"} />
            </div>
          )}
        </>
      ) : (
        <div className="mt-4 od-card p-8 text-center">
          <p className="text-sm" style={{ color: "var(--color-od-text-2)" }}>No instance provisioned yet.</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-od-text-3)" }}>
            Your agent will be created automatically after payment.
          </p>
        </div>
      )}

      {hermesStatus && inst?.subdomain && (
        <div className="mt-4 od-card p-6" style={inst.status === "running" ? { boxShadow: "0 0 40px var(--color-od-glow)" } : {}}>
          <h2 className="text-sm font-medium mb-4 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-2)" }}>
            Agent
          </h2>
          <dl className="space-y-3">
            {hermesStatus.version != null && (
              <div>
                <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Version</dt>
                <dd className="text-sm" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text)" }}>{String(hermesStatus.version)}</dd>
              </div>
            )}
            {hermesStatus.active_sessions != null && (
              <div>
                <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Active Sessions</dt>
                <dd className="text-sm" style={{ color: "var(--color-od-text)" }}>{String(hermesStatus.active_sessions)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-5">
            <a
              href={`https://${inst.subdomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors btn-accent"
            >
              Launch Agent Dashboard
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
