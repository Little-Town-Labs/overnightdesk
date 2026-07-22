import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSubscriptionForUser, isAdmin } from "@/lib/billing";
import { ManageBillingButton } from "./manage-billing-button";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AuthStatusBadge } from "./auth-status-badge";
import { OnboardingWizard } from "./onboarding-wizard";
import { RestartButton } from "./restart-button";
import { getEngineStatus } from "@/lib/engine-client";
import { isHermesMitchelTenant, isHermesTenant } from "@/lib/instance";
import { SetupWizard } from "./setup-wizard";
import { ProvisioningProgress } from "./provisioning-progress";
import { fetchMitchelProspectingSummary } from "@/lib/mitchel-prospecting/trevor-summary-client";
import { MitchelProspectingWorkspace } from "@/components/dashboard/mitchel-prospecting/workspace";
import {
  getHermesDashboardUnavailableMessage,
  getHermesDashboardUrl,
} from "@/lib/hermes-dashboard";
import {
  resolveAgentDirectory,
} from "@/lib/open-webui-workspace";
import { resolveSelectedAgentContext } from "@/lib/selected-agent-context";
import { buildAgentCapabilities } from "@/lib/agent-capabilities";
import { AgentOverview } from "./agent-overview";
import { AgentAccessState } from "./agent-access-state";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const userIsAdmin = isAdmin(session.user.email);
  const [rawSub, instances, agentDirectory] = await Promise.all([
    getSubscriptionForUser(session.user.id),
    db.select().from(instance).where(eq(instance.userId, session.user.id)),
    resolveAgentDirectory(session.user.id),
  ]);

  const sub = rawSub
    ? {
        status: rawSub.status,
        plan: rawSub.plan,
        currentPeriodEnd: rawSub.currentPeriodEnd,
        hasStripeCustomer: !!rawSub.stripeCustomerId,
      }
    : null;

  const rawAgent = (await searchParams).agent;
  if (Array.isArray(rawAgent)) notFound();
  const agentResolution = resolveSelectedAgentContext(
    agentDirectory,
    rawAgent,
    instances,
  );
  if (agentResolution.status === "not_found") notFound();
  const agents =
    agentResolution.status === "available" ? agentResolution.agents : [];
  const selectedAgent =
    agentResolution.status === "available"
      ? agentResolution.selected.agent
      : null;
  const hasAgentScopedInstance = instances.some(
    (candidate) =>
      candidate.runtimeIdentityId !== null || isHermesTenant(candidate),
  );
  const inst =
    agentResolution.status === "available"
      ? agentResolution.selected.instance
      : hasAgentScopedInstance
        ? null
        : instances[0] ?? null;
  const hermesAgent = isHermesTenant(inst);
  const mitchelTenant = isHermesMitchelTenant(inst);

  // Non-hermes: engine status
  let engineStatus: Record<string, unknown> | null = null;
  if (inst?.status === "running" && inst.subdomain && inst.engineApiKey && !hermesAgent) {
    engineStatus = await getEngineStatus(inst.subdomain, inst.engineApiKey);
  }

  // Hermes: public status and agent-specific business data (fetched in parallel)
  let hermesStatus: Record<string, unknown> | null = null;
  let mitchelProspectingSummary: Awaited<ReturnType<typeof fetchMitchelProspectingSummary>> | null = null;

  if (hermesAgent && inst?.status === "running" && inst.subdomain && inst.containerId) {
    const [statusRes, prospectingData] = await Promise.allSettled([
      fetch(`https://${inst.subdomain}/api/status`, {
        signal: AbortSignal.timeout(8_000),
        next: { revalidate: 30 },
      }),
      mitchelTenant ? fetchMitchelProspectingSummary(inst.containerId) : Promise.resolve(null),
    ]);

    if (statusRes.status === "fulfilled" && statusRes.value.ok) {
      hermesStatus = await statusRes.value.json();
    }
    if (prospectingData.status === "fulfilled" && prospectingData.value) {
      mitchelProspectingSummary = prospectingData.value;
    }
  }

  const showOnboarding = inst?.status === "running" && inst.claudeAuthStatus !== "connected";
  const isRunning = inst?.status === "running";

  // ─── Membership-filtered selected-agent overview ───────────────────────────
  if (selectedAgent) {
    const hermesDashboardUrl = inst?.subdomain
      ? getHermesDashboardUrl(inst.subdomain, {
          authStatus: inst.hermesDashboardAuthStatus,
          clientId: inst.hermesOidcClientId,
        })
      : null;
    const dashboardUnavailableMessage = inst
      ? getHermesDashboardUnavailableMessage({
          authStatus: inst.hermesDashboardAuthStatus,
          clientId: inst.hermesOidcClientId,
        })
      : null;
    const capabilities = buildAgentCapabilities({
      agentKey: selectedAgent.key,
      dashboardUnavailableMessage,
      dashboardUrl: hermesDashboardUrl,
      hasOpenChat: selectedAgent.workspace !== null,
    });
    const selectedStatusLabel = isRunning
      ? "Online"
      : selectedAgent.workspace
        ? "Workspace ready"
        : selectedAgent.runtime.status === "active"
          ? "Active"
          : selectedAgent.runtime.status;
    const isWizard = inst?.status === "queued";
    const isProvisioning =
      inst?.status === "awaiting_provisioning" || inst?.status === "provisioning";

    return (
      <>
        {sub?.status === "past_due" && <PastDueBanner sub={sub} />}

        <AgentOverview
          agents={agents}
          capabilities={capabilities}
          selected={selectedAgent}
          statusLabel={selectedStatusLabel}
        />

        {isRunning && (
          <div className="mt-3 flex flex-col gap-4 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ background: "var(--color-od-raised)", borderColor: "var(--color-od-border)" }}>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
              {hermesStatus?.version != null && (
                <div>
                  <dt style={{ color: "var(--color-od-text-3)" }}>Version</dt>
                  <dd style={{ color: "var(--color-od-text-2)" }}>v{String(hermesStatus.version)}</dd>
                </div>
              )}
              {hermesStatus?.active_sessions != null && (
                <div>
                  <dt style={{ color: "var(--color-od-text-3)" }}>Active sessions</dt>
                  <dd style={{ color: "var(--color-od-text-2)" }}>{String(hermesStatus.active_sessions)}</dd>
                </div>
              )}
            </dl>
            <RestartButton instanceRunning />
          </div>
        )}

        {dashboardUnavailableMessage && (
          <p className="mt-3 rounded-lg border px-4 py-3 text-sm" style={{ color: "var(--color-od-text-2)", background: "var(--color-od-raised)", borderColor: "var(--color-od-border)" }}>
            {dashboardUnavailableMessage}
          </p>
        )}

        {mitchelProspectingSummary && (
          <MitchelProspectingWorkspace summary={mitchelProspectingSummary} />
        )}

        {isWizard && inst && (
          <div className="mt-4">
            <SetupWizard
              instanceId={inst.id}
              tenantId={inst.tenantId}
              wizardState={inst.wizardState ?? null}
            />
          </div>
        )}
        {isProvisioning && inst && (
          <div className="mt-4">
            <ProvisioningProgress initialStatus={inst.status} />
          </div>
        )}
        {inst && !isRunning && !isWizard && !isProvisioning && (
          <div className="od-card mt-4 p-6">
            <StatusBadge
              instConfig={{ label: inst.status, color: "text-zinc-400", detail: "" }}
            />
          </div>
        )}

        <div className="mt-4">
          <AccountStrip session={session} sub={sub} userIsAdmin={userIsAdmin} />
        </div>
      </>
    );
  }

  if (
    hasAgentScopedInstance &&
    (agentResolution.status === "empty" ||
      agentResolution.status === "unavailable")
  ) {
    return (
      <>
        {sub?.status === "past_due" && <PastDueBanner sub={sub} />}
        <AgentAccessState state={agentResolution.status} />
        <div className="mt-4">
          <AccountStrip session={session} sub={sub} userIsAdmin={userIsAdmin} />
        </div>
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
                <dt className="text-xs mb-1" style={{ color: "var(--color-od-text-3)" }}>AI Runtime</dt>
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
