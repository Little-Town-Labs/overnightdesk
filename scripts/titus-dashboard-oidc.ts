import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { instance, oauthClient, resourceBinding } from "@/db/schema";
import {
  activateHermesOidcClient,
  disableHermesOidcClient,
  ensureHermesOidcClient,
  hasExactHermesOidcClientContract,
} from "@/lib/hermes-oidc";
import {
  requireTitusDashboardOidcConfirmation,
  stageTitusDashboardOidcClientId,
  type TitusDashboardOidcMutation,
} from "@/lib/titus-dashboard-oidc-operator";

type Command =
  | "plan"
  | "ensure"
  | "verify-disabled"
  | "activate"
  | "verify-active"
  | "disable";

const tenantId = "titus-dashboard";
const subdomain = "titus-dashboard.overnightdesk.com";

function commandFrom(value?: string): Command {
  const command = value ?? "plan";
  if (
    ![
      "plan",
      "ensure",
      "verify-disabled",
      "activate",
      "verify-active",
      "disable",
    ].includes(command)
  ) {
    throw new Error("Invalid Titus dashboard OIDC command");
  }
  return command as Command;
}

async function targetInstance() {
  const rows = await db
    .select()
    .from(instance)
    .where(eq(instance.tenantId, tenantId))
    .limit(2);
  if (
    rows.length !== 1 ||
    rows[0].subdomain !== subdomain ||
    rows[0].status !== "running" ||
    !rows[0].useCaseId ||
    !rows[0].runtimeIdentityId
  ) {
    throw new Error("Titus dashboard OIDC target is unavailable");
  }
  return rows[0];
}

async function verifyState(desired: "disabled" | "active") {
  const target = await targetInstance();
  if (!target.hermesOidcClientId) {
    throw new Error("Titus dashboard OIDC client is unavailable");
  }
  const [clients, bindings] = await Promise.all([
    db
      .select()
      .from(oauthClient)
      .where(eq(oauthClient.clientId, target.hermesOidcClientId))
      .limit(2),
    db
      .select()
      .from(resourceBinding)
      .where(
        and(
          eq(resourceBinding.provider, "better-auth"),
          eq(resourceBinding.kind, "oidc_client"),
          eq(resourceBinding.value, target.hermesOidcClientId),
          ne(resourceBinding.state, "retired"),
        ),
      )
      .limit(2),
  ]);
  const client = clients[0];
  const binding = bindings[0];
  const disabledState =
    client?.disabled === true &&
    (target.hermesDashboardAuthStatus === "pending" ||
      target.hermesDashboardAuthStatus === "disabled") &&
    binding?.state === "rollback";
  const activeState =
    client?.disabled === false &&
    target.hermesDashboardAuthStatus === "active" &&
    binding?.state === "active";
  if (
    clients.length !== 1 ||
    bindings.length !== 1 ||
    binding.useCaseId !== target.useCaseId ||
    binding.runtimeIdentityId !== target.runtimeIdentityId ||
    !hasExactHermesOidcClientContract(client, {
      instanceId: target.id,
      subdomain,
    }) ||
    (desired === "disabled" ? !disabledState : !activeState)
  ) {
    throw new Error("Titus dashboard OIDC state is unavailable");
  }
  return { target, client };
}

async function mutate(operation: TitusDashboardOidcMutation) {
  requireTitusDashboardOidcConfirmation(
    operation,
    process.env.TITUS_DASHBOARD_OIDC_CONFIRM,
  );
  const target = await targetInstance();
  const input = {
    instanceId: target.id,
    ownerId: target.userId,
    subdomain,
  };
  if (operation === "ensure") {
    await ensureHermesOidcClient(input);
    const verified = await verifyState("disabled");
    await stageTitusDashboardOidcClientId(verified.client.clientId);
    return { status: "verified", state: "disabled", clientStaged: true };
  }
  if (operation === "activate") {
    await activateHermesOidcClient(input);
    await verifyState("active");
    return { status: "verified", state: "active" };
  }
  await disableHermesOidcClient(input);
  await verifyState("disabled");
  return { status: "verified", state: "disabled" };
}

async function main() {
  const command = commandFrom(process.argv[2]);
  let result: Record<string, unknown>;
  if (command === "plan") {
    const target = await targetInstance();
    if (!target.hermesOidcClientId) {
      result = { status: "ready", operation: "ensure" };
    } else {
      try {
        await verifyState("disabled");
        result = { status: "verified_noop", state: "disabled" };
      } catch {
        result = { status: "blocked" };
      }
    }
  } else if (command === "verify-disabled" || command === "verify-active") {
    const desired = command === "verify-disabled" ? "disabled" : "active";
    await verifyState(desired);
    result = { status: "verified", state: desired };
  } else {
    result = await mutate(command);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(() => {
  process.stderr.write("Titus dashboard OIDC operation failed\n");
  process.exitCode = 1;
});
