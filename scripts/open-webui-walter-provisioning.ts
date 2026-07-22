import {
  applyWalterOpenWebuiProvisioning,
  inspectWalterOpenWebuiProvisioning,
  setWalterOpenWebuiClientEnabled,
} from "@/db/open-webui-walter-provisioning-store";
import { WALTER_OPEN_WEBUI } from "@/lib/open-webui-deployments";

type Command = "plan" | "apply" | "verify" | "enable" | "disable";

function commandFrom(value?: string): Command {
  const command = value ?? "plan";
  if (!["plan", "apply", "verify", "enable", "disable"].includes(command)) {
    throw new Error("Invalid Walter Open WebUI provisioning command");
  }
  return command as Command;
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireConfirmation(expected: string) {
  if (process.env.WALTER_OPEN_WEBUI_CONFIRM !== expected) {
    throw new Error(`WALTER_OPEN_WEBUI_CONFIRM must equal ${expected}`);
  }
}

function printable(
  inspection: Awaited<ReturnType<typeof inspectWalterOpenWebuiProvisioning>>,
) {
  if (inspection.status === "blocked") return inspection;
  if (inspection.status === "ready") {
    return {
      status: inspection.status,
      useCaseNumber: WALTER_OPEN_WEBUI.useCaseNumber,
      resourceBindingsToCreate: 5,
      secretBoundariesToCreate: 1,
      disabledOidcClientsToCreate: 1,
    };
  }
  if (inspection.status === "refresh-required") {
    return { status: inspection.status, state: inspection.state };
  }
  return { status: inspection.status, ...inspection.summary };
}

function output(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const command = commandFrom(process.argv[2]);
  const before = await inspectWalterOpenWebuiProvisioning();
  if (command === "plan") return output(printable(before));
  if (command === "verify") {
    if (before.status !== "verified") {
      throw new Error("Walter Open WebUI provisioning is not verified");
    }
    return output(printable(before));
  }
  if (before.status === "blocked" || before.status === "refresh-required") {
    throw new Error("Walter Open WebUI provisioning is blocked");
  }

  const actor = requiredEnvironment("WALTER_OPEN_WEBUI_ACTOR");
  if (command === "apply") {
    if (before.status === "verified") {
      if (before.state !== "disabled") {
        throw new Error("Disable the Walter OIDC client before applying provisioning");
      }
      return output(printable(before));
    }
    requireConfirmation("PROVISION_WALTER_OPEN_WEBUI_DISABLED");
    await applyWalterOpenWebuiProvisioning(before, actor);
  } else if (command === "enable") {
    if (before.status !== "verified") {
      throw new Error("Provisioning must be applied before enable");
    }
    if (before.state === "enabled") return output(printable(before));
    requireConfirmation("ENABLE_WALTER_OPEN_WEBUI_CLIENT");
    await setWalterOpenWebuiClientEnabled(true, actor);
  } else {
    if (before.status !== "verified") {
      throw new Error("Provisioning must be applied before disable");
    }
    if (before.state === "disabled") return output(printable(before));
    requireConfirmation("ROLLBACK_WALTER_OPEN_WEBUI_CLIENT");
    await setWalterOpenWebuiClientEnabled(false, actor);
  }

  const after = await inspectWalterOpenWebuiProvisioning();
  if (after.status !== "verified") {
    throw new Error("Walter Open WebUI provisioning did not converge");
  }
  const expected = command === "enable" ? "enabled" : "disabled";
  if (after.state !== expected) {
    throw new Error(`Expected Walter Open WebUI state ${expected}`);
  }
  output(printable(after));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown provisioning error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
