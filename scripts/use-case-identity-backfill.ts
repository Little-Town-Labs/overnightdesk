import {
  applyIdentityBackfillPlan,
  applyIdentityFoundationPlan,
  applyMembershipActivationPlan,
  compareMitchelTrevorLegacyAndCanonical,
  generateMitchelTrevorIdentityIds,
  inspectMitchelTrevorIdentityBackfill,
  inspectMitchelTrevorIdentityFoundation,
  verifyMitchelTrevorCanonicalSelectors,
} from "@/db/use-case-identity-backfill-store";
import { db } from "@/db";
import { createPlatformIdentityAudit } from "@/lib/canonical-identity-audit";
import {
  parseCanonicalIdentityReadMode,
  requireCanonicalComparisonConfirmation,
} from "@/lib/canonical-identity-compatibility";
import {
  planMitchelMembershipActivation,
  planMitchelTrevorBackfill,
  planMitchelTrevorFoundation,
  summarizeIdentityBackfillPlan,
  summarizeIdentityFoundationPlan,
  summarizeMembershipActivationPlan,
  type IdentityBackfillInput,
  type IdentityBackfillPlan,
  type IdentityFoundationInput,
  type IdentityFoundationPlan,
  type MembershipActivationPlan,
} from "@/lib/use-case-identity-backfill";

type Scope = "backfill" | "foundation" | "membership" | "compatibility";
type Command = "plan" | "apply" | "verify";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseCommand(value: string | undefined): Command {
  const command = value ?? "plan";
  if (!( ["plan", "apply", "verify"] as const).includes(command as Command)) {
    throw new Error("Command must be plan, apply, or verify");
  }
  return command as Command;
}

function parseInvocation(args: string[]): { scope: Scope; command: Command } {
  if (
    args[0] === "foundation" ||
    args[0] === "membership" ||
    args[0] === "compatibility"
  ) {
    return { scope: args[0] as Scope, command: parseCommand(args[1]) };
  }
  return { scope: "backfill", command: parseCommand(args[0]) };
}

function loadFoundationInput(): IdentityFoundationInput {
  return { actor: requiredEnvironment("IDENTITY_FOUNDATION_ACTOR") };
}

function loadMembershipInput(): IdentityBackfillInput {
  return {
    actor: requiredEnvironment("IDENTITY_MEMBERSHIP_ACTOR"),
    membershipUserId: requiredEnvironment("MITCHEL_BETTER_AUTH_USER_ID"),
  };
}

function loadBackfillInput(): IdentityBackfillInput {
  return {
    actor: requiredEnvironment("IDENTITY_BACKFILL_ACTOR"),
    membershipUserId: requiredEnvironment("MITCHEL_BETTER_AUTH_USER_ID"),
  };
}

function printResult(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function planFoundation(
  input: IdentityFoundationInput,
): Promise<IdentityFoundationPlan> {
  return planMitchelTrevorFoundation(
    input,
    await inspectMitchelTrevorIdentityFoundation(),
    generateMitchelTrevorIdentityIds(),
  );
}

async function planMembership(
  input: IdentityBackfillInput,
): Promise<MembershipActivationPlan> {
  return planMitchelMembershipActivation(
    input,
    await inspectMitchelTrevorIdentityBackfill(input),
    generateMitchelTrevorIdentityIds().membershipId,
  );
}

async function planBackfill(
  input: IdentityBackfillInput,
): Promise<IdentityBackfillPlan> {
  return planMitchelTrevorBackfill(
    input,
    await inspectMitchelTrevorIdentityBackfill(input),
    generateMitchelTrevorIdentityIds(),
  );
}

async function verifyFoundation(
  plan: Extract<IdentityFoundationPlan, { status: "verified_noop" }>,
) {
  return verifyMitchelTrevorCanonicalSelectors(
    plan.useCaseId,
    plan.runtimeIdentityId,
  );
}

async function runFoundation(command: Command): Promise<void> {
  const input = loadFoundationInput();
  const plan = await planFoundation(input);
  if (plan.status === "blocked") return failBlocked(plan);
  if (command === "plan") return printResult(summarizeIdentityFoundationPlan(plan));
  if (command === "verify") {
    if (plan.status !== "verified_noop") return failNotApplied();
    return printResult({
      ...summarizeIdentityFoundationPlan(plan),
      selectors: await verifyFoundation(plan),
    });
  }
  requireConfirmation("IDENTITY_FOUNDATION_CONFIRM", "TENET_1_FOUNDATION");
  if (plan.status === "ready") await applyIdentityFoundationPlan(plan);
  const verified = await planFoundation(input);
  if (verified.status !== "verified_noop") throw new Error("Foundation verification did not converge");
  printResult({
    status: plan.status === "ready" ? "applied" : "verified_noop",
    selectors: await verifyFoundation(verified),
  });
}

async function runMembership(command: Command): Promise<void> {
  const input = loadMembershipInput();
  const plan = await planMembership(input);
  if (plan.status === "blocked") return failBlocked(plan);
  if (command === "plan" || command === "verify") {
    if (command === "verify" && plan.status !== "verified_noop") {
      return failNotApplied();
    }
    return printResult(summarizeMembershipActivationPlan(plan));
  }
  requireConfirmation(
    "IDENTITY_MEMBERSHIP_CONFIRM",
    "ACTIVATE_TENET_1_MITCHEL",
  );
  if (plan.status === "ready") await applyMembershipActivationPlan(plan);
  const verified = await planMembership(input);
  if (verified.status !== "verified_noop") throw new Error("Membership verification did not converge");
  printResult({ status: plan.status === "ready" ? "applied" : "verified_noop" });
}

async function runCompatibility(command: Command): Promise<void> {
  if (command !== "verify") {
    throw new Error("Compatibility command must be verify");
  }
  const mode = parseCanonicalIdentityReadMode(
    process.env.CANONICAL_IDENTITY_READ_MODE,
  );
  requireCanonicalComparisonConfirmation(
    mode,
    process.env.IDENTITY_COMPARISON_CONFIRM,
  );

  if (mode === "legacy") {
    const summary = await compareMitchelTrevorLegacyAndCanonical(
      mode,
      "00000000-0000-0000-0000-000000000000",
      "00000000-0000-0000-0000-000000000000",
      async () => undefined,
    );
    return printResult({ status: "verified", ...summary });
  }

  const foundation = await planFoundation({
    actor: "operator:identity-comparison",
  });
  if (foundation.status === "blocked") return failBlocked(foundation);
  if (foundation.status === "ready") {
    return failBlocked({
      status: "blocked",
      reasons: ["canonical_foundation_missing"],
    });
  }

  const summary = await compareMitchelTrevorLegacyAndCanonical(
    mode,
    foundation.useCaseId,
    foundation.runtimeIdentityId,
    createPlatformIdentityAudit(db),
  );
  const verified =
    summary.legacyMatched === 1 &&
    summary.canonicalChecked > 0 &&
    summary.canonicalMatched === summary.canonicalChecked &&
    summary.canonicalMismatches.length === 0 &&
    summary.canonicalErrors.length === 0;
  printResult({ status: verified ? "verified" : "failed", ...summary });
  if (!verified) process.exitCode = 2;
}

async function runBackfill(command: Command): Promise<void> {
  const input = loadBackfillInput();
  const plan = await planBackfill(input);
  if (plan.status === "blocked") return failBlocked(plan);
  if (command === "plan") return printResult(summarizeIdentityBackfillPlan(plan));
  if (command === "verify") {
    if (plan.status !== "verified_noop") return failNotApplied();
    return printResult({
      ...summarizeIdentityBackfillPlan(plan),
      selectors: await verifyFoundation(plan),
    });
  }
  requireConfirmation("IDENTITY_BACKFILL_CONFIRM", "TENET_1_MITCHEL_TREVOR");
  if (plan.status === "ready") await applyIdentityBackfillPlan(plan);
  const verified = await planBackfill(input);
  if (verified.status !== "verified_noop") throw new Error("Backfill verification did not converge");
  printResult({
    status: plan.status === "ready" ? "applied" : "verified_noop",
    selectors: await verifyFoundation(verified),
  });
}

function requireConfirmation(name: string, expected: string): void {
  if (process.env[name] !== expected) {
    throw new Error(`${name} must equal ${expected}`);
  }
}

function failBlocked(plan: { status: "blocked"; reasons: string[] }): void {
  printResult(plan);
  process.exitCode = 2;
}

function failNotApplied(): void {
  printResult({ status: "not_applied" });
  process.exitCode = 3;
}

async function run(): Promise<void> {
  const invocation = parseInvocation(process.argv.slice(2));
  if (invocation.scope === "foundation") {
    return runFoundation(invocation.command);
  }
  if (invocation.scope === "membership") {
    return runMembership(invocation.command);
  }
  if (invocation.scope === "compatibility") {
    return runCompatibility(invocation.command);
  }
  return runBackfill(invocation.command);
}

run().catch((error) => {
  const kind = error instanceof Error ? error.name : "non-Error rejection";
  console.error(`Identity command failed (${kind})`);
  process.exitCode = 1;
});
