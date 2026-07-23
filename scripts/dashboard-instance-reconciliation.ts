import {
  createDashboardInstanceReconciliationGateway,
  executeDashboardInstanceReconciliation,
  type DashboardInstanceReconciliationCommand,
} from "@/db/dashboard-instance-reconciliation-store";
import type { DashboardInstanceDescriptor } from "@/lib/dashboard-instance-reconciliation";
import { TITUS_IDENTITY_TEMPLATE } from "@/lib/use-case-identity-templates";

const TITUS_DASHBOARD_DESCRIPTOR: DashboardInstanceDescriptor = {
  tenantId: "titus-dashboard",
  hostname: "titus-dashboard.overnightdesk.com",
  containerId: "hermes-titus",
};

function commandFrom(value?: string): DashboardInstanceReconciliationCommand {
  const command = value ?? "plan";
  if (!(command === "plan" || command === "apply" || command === "verify")) {
    throw new Error("Invalid dashboard assignment command");
  }
  return command;
}

function privateRuntimeQualified() {
  return (
    process.env.TITUS_DASHBOARD_PRIVATE_RUNTIME_QUALIFIED ===
    "PRIVATE_TITUS_DASHBOARD_HEALTH_VERIFIED"
  );
}

function output(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const command = commandFrom(process.argv[2]);
  const gateway = createDashboardInstanceReconciliationGateway(
    TITUS_IDENTITY_TEMPLATE,
    TITUS_DASHBOARD_DESCRIPTOR,
    privateRuntimeQualified(),
  );
  const result = await executeDashboardInstanceReconciliation(
    command,
    TITUS_DASHBOARD_DESCRIPTOR,
    {
      actor: process.env.TITUS_DASHBOARD_ASSIGNMENT_ACTOR,
      confirmation: process.env.TITUS_DASHBOARD_ASSIGNMENT_CONFIRM,
    },
    gateway,
  );
  output(result);
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Dashboard assignment command failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
