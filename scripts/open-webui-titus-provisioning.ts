import {
  applyTitusOpenWebuiRefreshContract,
  applyTitusOpenWebuiProvisioning,
  inspectTitusOpenWebuiProvisioning,
  setTitusOpenWebuiClientEnabled,
} from "@/db/open-webui-titus-provisioning-store";

type Command =
  | "plan"
  | "apply"
  | "verify"
  | "enable"
  | "disable"
  | "refresh-plan"
  | "refresh-apply"
  | "refresh-verify";

function commandFrom(value?: string): Command {
  const command = value ?? "plan";
  if (
    ![
      "plan",
      "apply",
      "verify",
      "enable",
      "disable",
      "refresh-plan",
      "refresh-apply",
      "refresh-verify",
    ].includes(command)
  ) {
    throw new Error("Invalid Titus Open WebUI provisioning command");
  }
  return command as Command;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireConfirmation(expected: string): void {
  if (process.env.TITUS_OPEN_WEBUI_CONFIRM !== expected) {
    throw new Error(`TITUS_OPEN_WEBUI_CONFIRM must equal ${expected}`);
  }
}

function printable(inspection: Awaited<ReturnType<typeof inspectTitusOpenWebuiProvisioning>>) {
  if (inspection.status === "blocked") return inspection;
  if (inspection.status === "ready") {
    return {
      status: inspection.status,
      useCaseNumber: 2,
      resourceBindingsToCreate: 5,
      secretBoundariesToCreate: 1,
      disabledOidcClientsToCreate: 1,
    };
  }
  if (inspection.status === "refresh-required") {
    return {
      status: inspection.status,
      state: inspection.state,
      scopesToAdd: ["offline_access"],
      grantsToAdd: ["refresh_token"],
    };
  }
  return { status: inspection.status, ...inspection.summary };
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const command = commandFrom(process.argv[2]);
  const before = await inspectTitusOpenWebuiProvisioning();
  if (command === "refresh-plan") return output(printable(before));
  if (command === "refresh-verify") {
    if (before.status !== "verified") {
      throw new Error("Titus Open WebUI refresh contract is not verified");
    }
    return output(printable(before));
  }
  if (command === "refresh-apply") {
    if (before.status === "verified") return output(printable(before));
    if (before.status !== "refresh-required") {
      throw new Error("Titus Open WebUI refresh contract cannot be applied");
    }
    const actor = requiredEnvironment("TITUS_OPEN_WEBUI_ACTOR");
    requireConfirmation("ENABLE_TITUS_OPEN_WEBUI_REFRESH_CONTRACT");
    await applyTitusOpenWebuiRefreshContract(before, actor);
    const after = await inspectTitusOpenWebuiProvisioning();
    if (after.status !== "verified" || after.state !== before.state) {
      throw new Error("Titus Open WebUI refresh contract did not converge");
    }
    return output(printable(after));
  }
  if (command === "plan") return output(printable(before));
  if (command === "verify") {
    if (before.status !== "verified") {
      throw new Error("Titus Open WebUI provisioning is not verified");
    }
    return output(printable(before));
  }
  if (before.status === "blocked") {
    throw new Error(`Provisioning blocked: ${before.reasons.join("; ")}`);
  }
  if (before.status === "refresh-required") {
    throw new Error("Apply the Titus Open WebUI refresh contract first");
  }

  const actor = requiredEnvironment("TITUS_OPEN_WEBUI_ACTOR");
  if (command === "apply") {
    if (before.status === "verified") {
      if (before.state !== "disabled") {
        throw new Error("Disable the Titus OIDC client before re-running provisioning apply");
      }
      return output(printable(before));
    }
    requireConfirmation("PROVISION_TITUS_OPEN_WEBUI_DISABLED");
    await applyTitusOpenWebuiProvisioning(before, actor);
  } else if (command === "enable") {
    if (before.status !== "verified") throw new Error("Provisioning must be applied before enable");
    if (before.state === "enabled") return output(printable(before));
    requireConfirmation("ENABLE_TITUS_OPEN_WEBUI_CLIENT");
    await setTitusOpenWebuiClientEnabled(true, actor);
  } else {
    if (before.status !== "verified") throw new Error("Provisioning must be applied before disable");
    if (before.state === "disabled") return output(printable(before));
    requireConfirmation("ROLLBACK_TITUS_OPEN_WEBUI_CLIENT");
    await setTitusOpenWebuiClientEnabled(false, actor);
  }

  const after = await inspectTitusOpenWebuiProvisioning();
  if (after.status !== "verified") {
    throw new Error("Titus Open WebUI provisioning did not converge");
  }
  const expectedState = command === "enable" ? "enabled" : "disabled";
  if (after.state !== expectedState) {
    throw new Error(`Expected Titus Open WebUI state ${expectedState}`);
  }
  output(printable(after));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown provisioning error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
