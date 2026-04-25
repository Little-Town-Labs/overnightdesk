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

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const userIsAdmin = isAdmin(session.user.email);
  const [rawSub, instances] = await Promise.all([
    getSubscriptionForUser(session.user.id),
    db.select().from(instance).where(eq(instance.userId, session.user.id)),
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
  const hermesAgent = isHermesTenant(inst);

  // Non-hermes: engine status
  let engineStatus: Record<string, unknown> | null = null;
  if (inst?.status === "running" && inst.subdomain && inst.engineApiKey && !hermesAgent) {
    engineStatus = await getEngineStatus(inst.subdomain, inst.engineApiKey);
  }

  // Hermes: public status (no auth)
  let hermesStatus: Record<string, unknown> | null = null;
  if (hermesAgent && inst?.status === "running" && inst.subdomain) {
    try {
      const res = await fetch(`https://${inst.subdomain}/api/status`, {
        signal: AbortSignal.timeout(8_000),
        next: { revalidate: 30 },
      });
      if (res.ok) hermesStatus = await res.json();
    } catch { /* non-fatal */ }
  }

  const showOnboarding = inst?.status === "running" && inst.claudeAuthStatus !== "connected";
  const isRunning = inst?.status === "running";

  // ─── Hermes running: hero-first layout ──────────────────────────────────────
  if (hermesAgent && isRunning && inst) {
    return (
      <>
        {sub?.status === "past_due" && <PastDueBanner sub={sub} />}

        {/* Hero agent card */}
        <div
          className="od-card p-8 mb-4 transition-all duration-500"
          style={hermesStatus ? { boxShadow: "0 0 60px var(--color-od-glow), 0 1px 3px rgba(0,0,0,0.4)" } : {}}
        >
          {/* Status row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--color-od-accent)" }} />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-od-accent)" }} />
              </span>
              <span className="text-xs font-medium uppercase tracking-widest" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-accent)" }}>
                Online
              </span>
            </div>
            {hermesStatus?.version != null && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-3)", background: "var(--color-od-raised)" }}>
                v{String(hermesStatus.version)}
              </span>
            )}
          </div>

          {/* Agent identity */}
          <div className="mb-8">
            <h2
              className="text-4xl font-extrabold tracking-tight mb-1"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}
            >
              {inst.tenantId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </h2>
            <p className="text-sm" style={{ color: "var(--color-od-text-2)" }}>
              Your AI agent — always on, always working
            </p>
          </div>

          {/* Primary CTAs */}
          <div className="flex flex-wrap gap-3 mb-8">
            <a
              href={`https://${inst.subdomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors btn-accent"
            >
              Launch Dashboard
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
            <a
              href="/dashboard/chat"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors"
              style={{ background: "var(--color-od-raised)", color: "var(--color-od-text)", border: "1px solid var(--color-od-border)" }}
            >
              Open Chat
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </a>
            <RestartButton instanceRunning />
          </div>

          {/* Secondary stats */}
          <div className="flex flex-wrap gap-6 pt-6 border-t" style={{ borderColor: "var(--color-od-border)" }}>
            {hermesStatus?.active_sessions != null && (
              <div>
                <div className="text-xs mb-0.5" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-3)" }}>Active Sessions</div>
                <div className="text-lg font-bold" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text)" }}>
                  {String(hermesStatus.active_sessions)}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs mb-0.5" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-3)" }}>Endpoint</div>
              <a
                href={`https://${inst.subdomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
                style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-2)" }}
              >
                {inst.subdomain}
              </a>
            </div>
          </div>
        </div>

        {/* Account strip — compact, secondary */}
        <AccountStrip session={session} sub={sub} userIsAdmin={userIsAdmin} />
      </>
    );
  }

  // ─── Hermes wizard / provisioning states ────────────────────────────────────
  if (hermesAgent && inst) {
    const isWizard = inst.status === "queued";
    const isProvisioning = inst.status === "awaiting_provisioning" || inst.status === "provisioning";

    return (
      <>
        {sub?.status === "past_due" && <PastDueBanner sub={sub} />}
        {isWizard && (
          <SetupWizard tenantId={inst.tenantId} instanceId={inst.id} wizardState={inst.wizardState ?? null} />
        )}
        {isProvisioning && <ProvisioningProgress initialStatus={inst.status} />}
        {!isWizard && !isProvisioning && (
          <div className="od-card p-6 mt-2">
            <StatusBadge instConfig={{ label: inst.status, color: "text-zinc-400", detail: "" }} />
          </div>
        )}
        <AccountStrip session={session} sub={sub} userIsAdmin={userIsAdmin} />
      </>
    );
  }

  // ─── Non-hermes / no instance fallback ──────────────────────────────────────
  return (
    <>
      {sub?.status === "past_due" && <PastDueBanner sub={sub} />}

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className="od-card p-6">
          <h2 className="text-xs font-medium mb-4 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-2)" }}>Account</h2>
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
          <h2 className="text-xs font-medium mb-4 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-2)" }}>
            Subscription {userIsAdmin && <span className="ml-1 text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-od-accent-bg)", color: "var(--color-od-accent)" }}>Admin</span>}
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Plan</dt>
              <dd className="text-sm font-medium capitalize" style={{ color: "var(--color-od-text)" }}>{userIsAdmin ? "Pro (Admin)" : (sub?.plan ?? "None")}</dd>
            </div>
          </dl>
          {sub?.hasStripeCustomer && (
            <div className="mt-4" style={{ color: "var(--color-od-accent)" }}>
              <ManageBillingButton className="text-xs underline" />
            </div>
          )}
        </div>
      </div>

      {inst ? (
        <div className="od-card p-6">
          <dl className="space-y-3">
            <div>
              <dt className="text-xs mb-1" style={{ color: "var(--color-od-text-3)" }}>Status</dt>
              <dd className="text-sm font-medium" style={{ color: "var(--color-od-text)" }}>{inst.status}</dd>
            </div>
            {inst.status === "running" && !hermesAgent && (
              <div>
                <dt className="text-xs mb-1" style={{ color: "var(--color-od-text-3)" }}>Claude Code</dt>
                <dd className="mt-1"><AuthStatusBadge status={inst.claudeAuthStatus} /></dd>
              </div>
            )}
          </dl>
          <RestartButton instanceRunning={inst.status === "running"} />
        </div>
      ) : (
        <div className="od-card p-8 text-center">
          <p className="text-sm" style={{ color: "var(--color-od-text-2)" }}>No instance provisioned yet.</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-od-text-3)" }}>Your agent will be created automatically after payment.</p>
        </div>
      )}

      {engineStatus && (
        <div className="mt-4 od-card p-6">
          <h2 className="text-xs font-medium mb-4 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text-2)" }}>Engine Status</h2>
          <dl className="space-y-3">
            {engineStatus.version != null && (
              <div>
                <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Version</dt>
                <dd className="text-sm" style={{ fontFamily: "var(--font-mono)", color: "var(--color-od-text)" }}>{String(engineStatus.version)}</dd>
              </div>
            )}
            {(engineStatus.queue as Record<string, unknown>)?.queue_depth != null && (
              <div>
                <dt className="text-xs mb-0.5" style={{ color: "var(--color-od-text-3)" }}>Queue</dt>
                <dd className="text-sm" style={{ color: "var(--color-od-text)" }}>{String((engineStatus.queue as Record<string, unknown>).queue_depth)} jobs</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {showOnboarding && (
        <div className="mt-4">
          <OnboardingWizard instanceSubdomain={inst!.subdomain ?? ""} authStatus={inst!.claudeAuthStatus} />
        </div>
      )}
    </>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function PastDueBanner({ sub }: { sub: { status: string } }) {
  return (
    <div className="mb-4 rounded-lg p-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
      <p className="text-sm font-medium" style={{ color: "#fcd34d" }}>
        Your payment failed. Please update your payment method to avoid service interruption.
      </p>
      <ManageBillingButton className="mt-2 text-sm underline" />
      <span className="hidden">{sub.status}</span>
    </div>
  );
}

function AccountStrip({
  session,
  sub,
  userIsAdmin,
}: {
  session: { user: { name: string; email: string } };
  sub: { status: string; plan: string; hasStripeCustomer: boolean; currentPeriodEnd: Date | null } | null;
  userIsAdmin: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 rounded-lg text-xs"
      style={{ background: "var(--color-od-raised)", border: "1px solid var(--color-od-border)", color: "var(--color-od-text-3)", fontFamily: "var(--font-mono)" }}
    >
      <span style={{ color: "var(--color-od-text-2)" }}>{session.user.email}</span>
      <span>·</span>
      <span className="capitalize">{userIsAdmin ? "Pro (Admin)" : (sub?.plan ?? "No plan")}</span>
      {sub?.hasStripeCustomer && (
        <>
          <span>·</span>
          <ManageBillingButton className="underline transition-colors" />
        </>
      )}
    </div>
  );
}

function StatusBadge({ instConfig }: { instConfig: { label: string; color: string; detail: string } }) {
  return (
    <div>
      <span className={`text-sm font-medium ${instConfig.color}`}>{instConfig.label}</span>
      {instConfig.detail && (
        <p className="text-xs mt-1" style={{ color: "var(--color-od-text-3)" }}>{instConfig.detail}</p>
      )}
    </div>
  );
}
