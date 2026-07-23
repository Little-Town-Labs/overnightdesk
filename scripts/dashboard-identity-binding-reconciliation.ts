import {
  createDashboardIdentityBindingGateway,
  executeDashboardIdentityBindingReconciliation,
  type DashboardIdentityBindingCommand,
} from "@/db/dashboard-identity-binding-reconciliation-store";
import { dashboardIdentityBindingDescriptors } from "@/lib/dashboard-identity-binding-reconciliation";
import { TITUS_IDENTITY_TEMPLATE } from "@/lib/use-case-identity-templates";

function commandFrom(value?: string): DashboardIdentityBindingCommand {
  const command = value ?? "plan";
  if (!(command === "plan" || command === "apply" || command === "verify")) {
    throw new Error("Invalid dashboard identity binding command");
  }
  return command;
}

function privateRuntimeQualified() {
  return (
    process.env.TITUS_DASHBOARD_PRIVATE_RUNTIME_QUALIFIED ===
    "PRIVATE_TITUS_DASHBOARD_HEALTH_VERIFIED"
  );
}

async function main() {
  const command = commandFrom(process.argv[2]);
  const descriptors = dashboardIdentityBindingDescriptors(
    TITUS_IDENTITY_TEMPLATE,
  );
  const result = await executeDashboardIdentityBindingReconciliation(
    command,
    descriptors,
    {
      actor: process.env.TITUS_DASHBOARD_BINDING_ACTOR,
      confirmation: process.env.TITUS_DASHBOARD_BINDING_CONFIRM,
      privateRuntimeQualified: privateRuntimeQualified(),
    },
    createDashboardIdentityBindingGateway(TITUS_IDENTITY_TEMPLATE, descriptors),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const message =
    error instanceof Error
      ? error.message
      : "Dashboard identity binding command failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
