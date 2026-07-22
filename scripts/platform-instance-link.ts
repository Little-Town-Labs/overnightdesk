import {
  applyPlatformInstanceLink,
  inspectPlatformInstanceLink,
} from "@/db/platform-instance-link-store";
import {
  getPlatformInstanceSelector,
  planPlatformInstanceLink,
} from "@/lib/platform-instance-link";
import { WALTER_IDENTITY_TEMPLATE } from "@/lib/use-case-identity-backfill";

type Command = "plan" | "apply" | "verify";

function commandFrom(value?: string): Command {
  const command = value ?? "plan";
  if (!(["plan", "apply", "verify"] as const).includes(command as Command)) {
    throw new Error("Invalid platform instance link command");
  }
  return command as Command;
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireConfirmation() {
  if (
    process.env.WALTER_PLATFORM_INSTANCE_CONFIRM !==
    "LINK_WALTER_PLATFORM_INSTANCE"
  ) {
    throw new Error(
      "WALTER_PLATFORM_INSTANCE_CONFIRM must equal LINK_WALTER_PLATFORM_INSTANCE",
    );
  }
}

function tenantSelector() {
  return getPlatformInstanceSelector(WALTER_IDENTITY_TEMPLATE).value;
}

function printable(status: "blocked" | "ready" | "verified_noop") {
  if (status === "ready") return { status, instanceLinksToCreate: 1 };
  if (status === "verified_noop") return { status, instanceLinksVerified: 1 };
  return { status };
}

function output(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function inspectAndPlan() {
  const snapshot = await inspectPlatformInstanceLink(WALTER_IDENTITY_TEMPLATE);
  return planPlatformInstanceLink(snapshot, { tenantId: tenantSelector() });
}

async function main() {
  const command = commandFrom(process.argv[2]);
  const before = await inspectAndPlan();

  if (command === "plan") return output(printable(before.status));
  if (command === "verify") {
    if (before.status !== "verified_noop") {
      throw new Error("Canonical platform instance link is not verified");
    }
    return output(printable(before.status));
  }
  if (before.status === "blocked") {
    throw new Error("Canonical platform instance link is blocked");
  }
  if (before.status === "verified_noop") return output(printable(before.status));

  requireConfirmation();
  const actor = requiredEnvironment("WALTER_PLATFORM_INSTANCE_ACTOR");
  await applyPlatformInstanceLink(WALTER_IDENTITY_TEMPLATE, before, actor);

  const after = await inspectAndPlan();
  if (after.status !== "verified_noop") {
    throw new Error("Canonical platform instance link did not verify");
  }
  output(printable(after.status));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown platform instance link error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
