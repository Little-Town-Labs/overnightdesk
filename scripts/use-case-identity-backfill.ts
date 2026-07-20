import {
  applyIdentityBackfillPlan,
  applyIdentityFoundationPlan,
  applyMembershipActivationPlan,
  compareMitchelTrevorLegacyAndCanonical,
  generateMitchelTrevorIdentityIds,
  generateTitusIdentityIds,
  generateWalterIdentityIds,
  inspectMitchelTrevorIdentityBackfill,
  inspectMitchelTrevorIdentityFoundation,
  inspectTitusIdentityBackfill,
  inspectTitusIdentityFoundation,
  inspectWalterIdentityBackfill,
  inspectWalterIdentityFoundation,
  verifyMitchelTrevorCanonicalSelectors,
  verifyTitusCanonicalSelectors,
  verifyWalterCanonicalSelectors,
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
  planTitusFoundation,
  planTitusMembershipActivation,
  planWalterFoundation,
  planWalterMembershipActivation,
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
type IdentityTarget = "mitchel-trevor" | "titus" | "walter";

function isIdentityTarget(value: string | undefined): value is IdentityTarget {
  return value === "mitchel-trevor" || value === "titus" || value === "walter";
}

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

function parseInvocation(args: string[]): {
  scope: Scope;
  target: IdentityTarget;
  command: Command;
} {
  if (
    args[0] === "foundation" ||
    args[0] === "membership" ||
    args[0] === "compatibility"
  ) {
    const hasExplicitTarget = isIdentityTarget(args[1]);
    if (args[0] === "compatibility" && hasExplicitTarget) {
      throw new Error("Compatibility does not accept an identity target");
    }
    const target = hasExplicitTarget ? args[1] : "mitchel-trevor";
    const commandIndex = hasExplicitTarget ? 2 : 1;
    return {
      scope: args[0] as Scope,
      target,
      command: parseCommand(args[commandIndex]),
    };
  }
  return {
    scope: "backfill",
    target: "mitchel-trevor",
    command: parseCommand(args[0]),
  };
}

function loadFoundationInput(): IdentityFoundationInput {
  return { actor: requiredEnvironment("IDENTITY_FOUNDATION_ACTOR") };
}

function loadMembershipInput(target: IdentityTarget): IdentityBackfillInput {
  return {
    actor: requiredEnvironment("IDENTITY_MEMBERSHIP_ACTOR"),
    membershipUserId: requiredEnvironment(
      target === "walter" || target === "titus"
        ? "GARY_BETTER_AUTH_USER_ID"
        : "MITCHEL_BETTER_AUTH_USER_ID",
    ),
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
  target: IdentityTarget = "mitchel-trevor",
): Promise<IdentityFoundationPlan> {
  if (target === "walter") {
    return planWalterFoundation(
      input,
      await inspectWalterIdentityFoundation(),
      generateWalterIdentityIds(),
    );
  }
  if (target === "titus") {
    return planTitusFoundation(
      input,
      await inspectTitusIdentityFoundation(),
      generateTitusIdentityIds(),
    );
  }
  return planMitchelTrevorFoundation(
    input,
    await inspectMitchelTrevorIdentityFoundation(),
    generateMitchelTrevorIdentityIds(),
  );
}

async function planMembership(
  input: IdentityBackfillInput,
  target: IdentityTarget = "mitchel-trevor",
): Promise<MembershipActivationPlan> {
  if (target === "walter") {
    return planWalterMembershipActivation(
      input,
      await inspectWalterIdentityBackfill(input),
      generateWalterIdentityIds().membershipId,
    );
  }
  if (target === "titus") {
    return planTitusMembershipActivation(
      input,
      await inspectTitusIdentityBackfill(input),
      generateTitusIdentityIds().membershipId,
    );
  }
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
  target: IdentityTarget = "mitchel-trevor",
) {
  if (target === "walter") {
    return verifyWalterCanonicalSelectors(
      plan.useCaseId,
      plan.runtimeIdentityId,
    );
  }
  if (target === "titus") {
    return verifyTitusCanonicalSelectors(
      plan.useCaseId,
      plan.runtimeIdentityId,
    );
  }
  return verifyMitchelTrevorCanonicalSelectors(
    plan.useCaseId,
    plan.runtimeIdentityId,
  );
}

async function runFoundation(
  command: Command,
  target: IdentityTarget,
): Promise<void> {
  const input = loadFoundationInput();
  const plan = await planFoundation(input, target);
  if (plan.status === "blocked") return failBlocked(plan);
  if (command === "plan") return printResult(summarizeIdentityFoundationPlan(plan));
  if (command === "verify") {
    if (plan.status !== "verified_noop") return failNotApplied();
    return printResult({
      ...summarizeIdentityFoundationPlan(plan),
      selectors: await verifyFoundation(plan, target),
    });
  }
  requireConfirmation(
    "IDENTITY_FOUNDATION_CONFIRM",
    foundationConfirmation(target),
  );
  if (plan.status === "ready") await applyIdentityFoundationPlan(plan);
  const verified = await planFoundation(input, target);
  if (verified.status !== "verified_noop") throw new Error("Foundation verification did not converge");
  printResult({
    status: plan.status === "ready" ? "applied" : "verified_noop",
    selectors: await verifyFoundation(verified, target),
  });
}

async function runMembership(
  command: Command,
  target: IdentityTarget,
): Promise<void> {
  const input = loadMembershipInput(target);
  const plan = await planMembership(input, target);
  if (plan.status === "blocked") return failBlocked(plan);
  if (command === "plan" || command === "verify") {
    if (command === "verify" && plan.status !== "verified_noop") {
      return failNotApplied();
    }
    return printResult(summarizeMembershipActivationPlan(plan));
  }
  requireConfirmation(
    "IDENTITY_MEMBERSHIP_CONFIRM",
    membershipConfirmation(target),
  );
  if (plan.status === "ready") await applyMembershipActivationPlan(plan);
  const verified = await planMembership(input, target);
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
    const summary = await compareMitchelTrevorLegacyAndCanonical({ mode });
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

  const summary = await compareMitchelTrevorLegacyAndCanonical({
    mode,
    expectedUseCaseId: foundation.useCaseId,
    expectedRuntimeIdentityId: foundation.runtimeIdentityId,
    audit: createPlatformIdentityAudit(db),
  });
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

function foundationConfirmation(target: IdentityTarget): string {
  if (target === "walter") return "TENET_0_WALTER_FOUNDATION";
  if (target === "titus") return "TENET_2_TITUS_FOUNDATION";
  return "TENET_1_FOUNDATION";
}

function membershipConfirmation(target: IdentityTarget): string {
  if (target === "walter") return "ACTIVATE_TENET_0_GARY";
  if (target === "titus") return "ACTIVATE_TENET_2_GARY";
  return "ACTIVATE_TENET_1_MITCHEL";
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
    return runFoundation(invocation.command, invocation.target);
  }
  if (invocation.scope === "membership") {
    return runMembership(invocation.command, invocation.target);
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
