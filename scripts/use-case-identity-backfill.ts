import {
  applyIdentityBackfillPlan,
  generateMitchelTrevorIdentityIds,
  inspectMitchelTrevorIdentityBackfill,
  verifyMitchelTrevorCanonicalSelectors,
} from "@/db/use-case-identity-backfill-store";
import {
  planMitchelTrevorBackfill,
  summarizeIdentityBackfillPlan,
  type IdentityBackfillInput,
  type IdentityBackfillPlan,
} from "@/lib/use-case-identity-backfill";

type Command = "plan" | "apply" | "verify";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseCommand(value: string | undefined): Command {
  const command = value ?? "plan";
  if (!(["plan", "apply", "verify"] as const).includes(command as Command)) {
    throw new Error("Command must be plan, apply, or verify");
  }
  return command as Command;
}

function loadInput(): IdentityBackfillInput {
  return {
    actor: requiredEnvironment("IDENTITY_BACKFILL_ACTOR"),
    membershipUserId: requiredEnvironment("MITCHEL_BETTER_AUTH_USER_ID"),
  };
}

function printResult(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function planBackfill(
  input: IdentityBackfillInput,
): Promise<IdentityBackfillPlan> {
  const snapshot = await inspectMitchelTrevorIdentityBackfill(input);
  return planMitchelTrevorBackfill(
    input,
    snapshot,
    generateMitchelTrevorIdentityIds(),
  );
}

async function verifyApplied(
  plan: Extract<
    IdentityBackfillPlan,
    {
      status: "verified_noop";
    }
  >,
) {
  return verifyMitchelTrevorCanonicalSelectors(
    plan.useCaseId,
    plan.runtimeIdentityId,
  );
}

async function run(): Promise<void> {
  const command = parseCommand(process.argv[2]);
  const input = loadInput();
  const plan = await planBackfill(input);

  if (plan.status === "blocked") {
    printResult(summarizeIdentityBackfillPlan(plan));
    process.exitCode = 2;
    return;
  }

  if (command === "plan") {
    printResult(summarizeIdentityBackfillPlan(plan));
    return;
  }

  if (command === "verify") {
    if (plan.status !== "verified_noop") {
      printResult({ status: "not_applied" });
      process.exitCode = 3;
      return;
    }
    printResult({
      ...summarizeIdentityBackfillPlan(plan),
      selectors: await verifyApplied(plan),
    });
    return;
  }

  if (process.env.IDENTITY_BACKFILL_CONFIRM !== "TENET_1_MITCHEL_TREVOR") {
    throw new Error(
      "IDENTITY_BACKFILL_CONFIRM must equal TENET_1_MITCHEL_TREVOR",
    );
  }
  if (plan.status === "ready") await applyIdentityBackfillPlan(plan);

  const verified = await planBackfill(input);
  if (verified.status !== "verified_noop") {
    throw new Error("Post-apply identity verification did not converge");
  }
  printResult({
    status: plan.status === "ready" ? "applied" : "verified_noop",
    useCaseId: verified.useCaseId,
    runtimeIdentityId: verified.runtimeIdentityId,
    selectors: await verifyApplied(verified),
  });
}

run().catch((error) => {
  const kind = error instanceof Error ? error.name : "non-Error rejection";
  console.error(`Identity backfill command failed (${kind})`);
  process.exitCode = 1;
});
