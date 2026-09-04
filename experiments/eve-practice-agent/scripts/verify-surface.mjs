import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const INVALID_SURFACE_MESSAGE = "Eve practice capability verification failed.";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value */
export function assertPracticeSurface(value) {
  if (!isRecord(value) || !isRecord(value.diagnostics)) {
    throw new Error(INVALID_SURFACE_MESSAGE);
  }

  const emptyCapabilityFields = ["tools", "skills", "subagents", "schedules"];
  const hasOnlyEmptyCapabilities = emptyCapabilityFields.every(
    (field) => Array.isArray(value[field]) && value[field].length === 0,
  );

  if (
    value.status !== "ready" ||
    value.model !== "eve-mock/model" ||
    value.diagnostics.errors !== 0 ||
    value.diagnostics.warnings !== 0 ||
    !hasOnlyEmptyCapabilities
  ) {
    throw new Error(INVALID_SURFACE_MESSAGE);
  }

  return { model: value.model, status: value.status };
}

export function main() {
  const applicationRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const eveExecutable = path.join(applicationRoot, "node_modules/eve/bin/eve.js");
  const inspection = spawnSync(
    process.execPath,
    [eveExecutable, "info", "--json"],
    {
      cwd: applicationRoot,
      encoding: "utf8",
      env: { ...process.env, EVE_PRACTICE_MODEL: "mock" },
    },
  );

  if (inspection.status !== 0 || inspection.error !== undefined) {
    throw new Error(INVALID_SURFACE_MESSAGE);
  }

  const summary = assertPracticeSurface(JSON.parse(inspection.stdout));
  console.log(
    `Eve practice surface verified: ${summary.status}, ${summary.model}, zero tools/skills/subagents/schedules.`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch {
    console.error(INVALID_SURFACE_MESSAGE);
    process.exitCode = 1;
  }
}
