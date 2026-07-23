import {
  createTitusMembershipQualificationGateway,
  executeTitusMembershipQualification,
  type TitusMembershipQualificationCommand,
} from "@/db/titus-membership-qualification-store";
import type { TitusMembershipQualificationState } from "@/lib/titus-membership-qualification";

function commandFrom(value?: string): TitusMembershipQualificationCommand {
  if (value === "plan" || value === "apply" || value === "verify") return value;
  throw new Error("Invalid Titus membership qualification command");
}

function desiredStateFrom(value?: string): TitusMembershipQualificationState {
  if (
    value === "active" ||
    value === "non_member" ||
    value === "suspended" ||
    value === "expired"
  ) {
    return value;
  }
  throw new Error("Invalid Titus membership qualification state");
}

async function main() {
  const result = await executeTitusMembershipQualification(
    commandFrom(process.argv[2]),
    desiredStateFrom(process.argv[3]),
    {
      actor: process.env.TITUS_MEMBERSHIP_QUALIFICATION_ACTOR,
      confirmation: process.env.TITUS_MEMBERSHIP_QUALIFICATION_CONFIRM,
    },
    createTitusMembershipQualificationGateway(),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(() => {
  process.stderr.write("Titus membership qualification operation failed\n");
  process.exitCode = 1;
});
