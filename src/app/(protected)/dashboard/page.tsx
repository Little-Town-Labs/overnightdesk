import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveSelectedAgentPageContext } from "@/db/selected-agent-page-context";
import { AuthStatusBadge } from "./auth-status-badge";
import { getEngineStatus } from "@/lib/engine-client";
import { isHermesMitchelTenant, isHermesTenant } from "@/lib/instance";
import { fetchMitchelProspectingSummary } from "@/lib/mitchel-prospecting/trevor-summary-client";
import { MitchelProspectingWorkspace } from "@/components/dashboard/mitchel-prospecting/workspace";
import {
  resolveAgentDirectory,
} from "@/lib/open-webui-workspace";
import {
  getSelectedAgentStatusLabel,
  resolveUnambiguousLegacyInstance,
  resolveSelectedAgentContext,
} from "@/lib/selected-agent-context";
import { buildSelectedAgentCapabilities } from "@/lib/selected-agent-capabilities";
import { AgentOverview } from "./agent-overview";
import { AgentAccessState } from "./agent-access-state";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const agentDirectory = await resolveAgentDirectory(session.user.id);
  const pageContext = await resolveSelectedAgentPageContext(
    session.user.id,
    agentDirectory,
  );
  const resolvedDirectory =
    pageContext.status === "available"
      ? pageContext.directory
      : ({ status: "unavailable" } as const);
  const instances =
    pageContext.status === "available" ? pageContext.instances : [];

  const rawAgent = (await searchParams).agent;
  if (Array.isArray(rawAgent)) notFound();
  const agentResolution = resolveSelectedAgentContext(
    resolvedDirectory,
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
      : resolveUnambiguousLegacyInstance(instances);
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

  const isRunning = inst?.status === "running";

  // ─── Membership-filtered selected-agent overview ───────────────────────────
  if (selectedAgent) {
    const capabilities = buildSelectedAgentCapabilities({
      agent: selectedAgent,
      instance: inst,
    });
    const dashboardUnavailableMessage =
      capabilities.find(
        (capability) =>
          capability.id === "advanced_dashboard" &&
          capability.state === "unavailable",
      )?.detail ?? null;
    const selectedStatusLabel = getSelectedAgentStatusLabel(selectedAgent, inst);
    return (
      <>
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

        {inst && !isRunning && (
          <div className="od-card mt-4 p-6">
            <StatusBadge
              instConfig={{ label: inst.status, color: "text-zinc-400", detail: "" }}
            />
          </div>
        )}

        <div className="mt-4">
          <AccountStrip session={session} />
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
        <AgentAccessState state={agentResolution.status} />
        <div className="mt-4">
          <AccountStrip session={session} />
        </div>
      </>
    );
  }

  // ─── Non-hermes / no instance fallback ──────────────────────────────────────
  return (
    <>
      <div className="mb-4">
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
        </div>
      ) : (
        <div className="od-card p-8 text-center">
          <p className="text-sm" style={{ color: "var(--color-od-text-2)" }}>No runtime is currently available.</p>
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

    </>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function AccountStrip({ session }: {
  session: { user: { name: string; email: string } };
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 rounded-lg text-xs"
      style={{ background: "var(--color-od-raised)", border: "1px solid var(--color-od-border)", color: "var(--color-od-text-3)", fontFamily: "var(--font-mono)" }}
    >
      <span style={{ color: "var(--color-od-text-2)" }}>{session.user.email}</span>
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
