import {
  createDashboardIdentityBindingGateway,
  executeDashboardIdentityBindingReconciliation,
  type DashboardIdentityBindingCommand,
} from "@/db/dashboard-identity-binding-reconciliation-store";
import { dashboardIdentityBindingDescriptors } from "@/lib/dashboard-identity-binding-reconciliation";
import {
  TITUS_IDENTITY_TEMPLATE,
  WALTER_IDENTITY_TEMPLATE,
} from "@/lib/use-case-identity-templates";

function commandFrom(value?: string): DashboardIdentityBindingCommand {
  const command = value ?? "plan";
  if (!(command === "plan" || command === "apply" || command === "verify")) {
    throw new Error("Invalid dashboard identity binding command");
  }
  return command;
}

type Target = "titus" | "walter";

function invocation(args: string[]) {
  const target: Target = args[0] === "walter" ? "walter" : "titus";
  const command = commandFrom(target === "walter" ? args[1] : args[0]);
  return { target, command };
}

function configuration(target: Target) {
  if (target === "walter") {
    return {
      template: WALTER_IDENTITY_TEMPLATE,
      actor: process.env.WALTER_DASHBOARD_BINDING_ACTOR,
      confirmation: process.env.WALTER_DASHBOARD_BINDING_CONFIRM,
      privateRuntimeQualified:
        process.env.WALTER_DASHBOARD_PRIVATE_RUNTIME_QUALIFIED ===
        "PRIVATE_WALTER_DASHBOARD_HEALTH_VERIFIED",
    };
  }
  return {
    template: TITUS_IDENTITY_TEMPLATE,
    actor: process.env.TITUS_DASHBOARD_BINDING_ACTOR,
    confirmation: process.env.TITUS_DASHBOARD_BINDING_CONFIRM,
    privateRuntimeQualified:
      process.env.TITUS_DASHBOARD_PRIVATE_RUNTIME_QUALIFIED ===
      "PRIVATE_TITUS_DASHBOARD_HEALTH_VERIFIED",
  };
}

async function main() {
  const { target, command } = invocation(process.argv.slice(2));
  const config = configuration(target);
  const descriptors = dashboardIdentityBindingDescriptors(config.template);
  const result = await executeDashboardIdentityBindingReconciliation(
    command,
    descriptors,
    {
      actor: config.actor,
      confirmation: config.confirmation,
      target,
      privateRuntimeQualified: config.privateRuntimeQualified,
    },
    createDashboardIdentityBindingGateway(config.template, descriptors),
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
