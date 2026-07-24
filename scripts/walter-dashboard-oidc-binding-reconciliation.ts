import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  instance,
  oauthClient,
  resourceBinding,
} from "@/db/schema";
import { readDashboardCanonicalContext } from "@/db/dashboard-canonical-context-store";
import {
  planDashboardOidcBinding,
  reconcileDashboardOidcBindingWithAudit,
} from "@/db/dashboard-oidc-binding-store";
import { requireAuditActor } from "@/lib/audit-actor";
import { hasExactHermesOidcClientContract } from "@/lib/hermes-oidc";

type Command = "plan" | "apply" | "verify";

const tenantId = "tenant-0";
const subdomain = "aegis-prod.overnightdesk.com";

function commandFrom(value?: string): Command {
  const command = value ?? "plan";
  if (!(command === "plan" || command === "apply" || command === "verify")) {
    throw new Error("Invalid Walter dashboard OIDC binding command");
  }
  return command;
}

function requireApplyBoundary() {
  if (
    process.env.WALTER_DASHBOARD_OIDC_BINDING_CONFIRM !==
    "RECONCILE_WALTER_DASHBOARD_OIDC_BINDING"
  ) {
    throw new Error("Walter dashboard OIDC binding confirmation is required");
  }
  if (
    process.env.WALTER_DASHBOARD_PRIVATE_RUNTIME_QUALIFIED !==
    "PRIVATE_WALTER_DASHBOARD_HEALTH_VERIFIED"
  ) {
    throw new Error("Private Walter dashboard runtime is not qualified");
  }
  return requireAuditActor(process.env.WALTER_DASHBOARD_OIDC_BINDING_ACTOR);
}

async function inspect() {
  const targets = await db
    .select()
    .from(instance)
    .where(eq(instance.tenantId, tenantId))
    .limit(2);
  const target = targets[0];
  if (
    targets.length !== 1 ||
    !target ||
    target.subdomain !== subdomain ||
    target.status !== "running" ||
    target.hermesDashboardAuthStatus !== "active" ||
    !target.hermesOidcClientId ||
    !target.useCaseId ||
    !target.runtimeIdentityId
  ) {
    throw new Error("Walter dashboard OIDC binding target is unavailable");
  }

  const baseContextValid = await readDashboardCanonicalContext({
    useCaseId: target.useCaseId,
    runtimeIdentityId: target.runtimeIdentityId,
    useCaseSlug: "overnightdesk-platform-operations",
    runtimeSlug: "hermes-walter",
    tenantId,
    hostname: subdomain,
  });
  if (!baseContextValid) {
    throw new Error("Walter dashboard OIDC binding target is unavailable");
  }

  const [clients, bindings] = await Promise.all([
    db
      .select()
      .from(oauthClient)
      .where(eq(oauthClient.clientId, target.hermesOidcClientId))
      .limit(2),
    db
      .select({
        id: resourceBinding.id,
        useCaseId: resourceBinding.useCaseId,
        runtimeIdentityId: resourceBinding.runtimeIdentityId,
        value: resourceBinding.value,
        state: resourceBinding.state,
      })
      .from(resourceBinding)
      .where(
        and(
          eq(resourceBinding.provider, "better-auth"),
          eq(resourceBinding.kind, "oidc_client"),
          eq(resourceBinding.value, target.hermesOidcClientId),
          ne(resourceBinding.state, "retired"),
        ),
      ),
  ]);
  const client = clients[0];
  if (
    clients.length !== 1 ||
    !client ||
    client.disabled ||
    !hasExactHermesOidcClientContract(client, {
      instanceId: target.id,
      subdomain,
    })
  ) {
    throw new Error("Walter dashboard OIDC binding target is unavailable");
  }

  const plan = planDashboardOidcBinding(
    {
      instances: [
        {
          id: target.id,
          linkedClientId: target.hermesOidcClientId,
          useCaseId: target.useCaseId,
          runtimeIdentityId: target.runtimeIdentityId,
        },
      ],
      bindings,
    },
    target.hermesOidcClientId,
    "active",
  );
  return { target, plan };
}

function summarize(plan: Awaited<ReturnType<typeof inspect>>["plan"]) {
  switch (plan.status) {
    case "insert":
      return { status: "ready", bindingsToCreate: 1 };
    case "update":
      return { status: "ready", bindingsToActivate: 1 };
    case "verified":
      return { status: "verified_noop", bindingsVerified: 1 };
    default:
      return { status: "blocked" };
  }
}

async function apply() {
  const before = await inspect();
  if (before.plan.status === "verified") return summarize(before.plan);
  if (
    before.plan.status === "blocked" ||
    before.plan.status === "legacy_noop"
  ) {
    throw new Error("Walter dashboard OIDC binding reconciliation is blocked");
  }
  const actor = requireApplyBoundary();
  const clientId = before.target.hermesOidcClientId!;
  const reconciled = await reconcileDashboardOidcBindingWithAudit(
    before.target.id,
    clientId,
    "active",
    {
      actor,
      action: "canonical_dashboard_oidc_binding_reconciled",
      target: `instance:${before.target.id}`,
      details: { bindingCount: 1, state: "active" },
    },
  );
  if (!reconciled) {
    throw new Error("Walter dashboard OIDC binding reconciliation failed");
  }
  const after = await inspect();
  if (after.plan.status !== "verified") {
    throw new Error("Walter dashboard OIDC binding reconciliation failed");
  }
  return summarize(after.plan);
}

async function main() {
  const command = commandFrom(process.argv[2]);
  if (command === "apply") {
    process.stdout.write(`${JSON.stringify(await apply(), null, 2)}\n`);
    return;
  }
  const current = await inspect();
  if (command === "verify" && current.plan.status !== "verified") {
    throw new Error("Walter dashboard OIDC binding is not verified");
  }
  process.stdout.write(`${JSON.stringify(summarize(current.plan), null, 2)}\n`);
}

main().catch(() => {
  process.stderr.write("Walter dashboard OIDC binding operation failed\n");
  process.exitCode = 1;
});
