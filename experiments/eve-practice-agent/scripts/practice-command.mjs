import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const INVALID_CODEX_HOME_MESSAGE =
  "EVE_PRACTICE_CODEX_HOME must be a dedicated absolute path outside the repository.";
const INVALID_COMMAND_MESSAGE =
  "Unsupported practice command. Use auth:login, auth:status, auth:logout, or dev.";
const MISSING_LOGIN_MESSAGE =
  "Dedicated Codex login is unavailable. Run npm run auth:login.";

/**
 * @param {string} parent
 * @param {string} candidate
 */
function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);

  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

/** @param {string} value */
function resolveExistingPath(value) {
  const resolved = path.resolve(value);
  const unresolvedSegments = [];
  let candidate = resolved;

  while (true) {
    try {
      return path.join(
        fs.realpathSync.native(candidate),
        ...unresolvedSegments,
      );
    } catch {
      const parent = path.dirname(candidate);

      if (parent === candidate) {
        return resolved;
      }

      unresolvedSegments.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
}

/**
 * @param {string | undefined} value
 * @param {string} repositoryRoot
 * @param {readonly string[]} [prohibitedCodexHomes]
 */
export function resolvePracticeCodexHome(
  value,
  repositoryRoot,
  prohibitedCodexHomes = [],
) {
  if (typeof value !== "string" || value === "" || !path.isAbsolute(value)) {
    throw new Error(INVALID_CODEX_HOME_MESSAGE);
  }

  const resolvedRepositoryRoot = resolveExistingPath(repositoryRoot);
  const resolvedCodexHome = resolveExistingPath(value);

  const isFilesystemRoot =
    resolvedCodexHome === path.parse(resolvedCodexHome).root;
  const overlapsProhibitedHome = prohibitedCodexHomes.some((prohibitedHome) => {
    const resolvedProhibitedHome = resolveExistingPath(prohibitedHome);

    return (
      isWithin(resolvedProhibitedHome, resolvedCodexHome) ||
      isWithin(resolvedCodexHome, resolvedProhibitedHome)
    );
  });

  if (
    isFilesystemRoot ||
    isWithin(resolvedRepositoryRoot, resolvedCodexHome) ||
    overlapsProhibitedHome
  ) {
    throw new Error(INVALID_CODEX_HOME_MESSAGE);
  }

  return resolvedCodexHome;
}

/**
 * @param {string | undefined} name
 * @param {string} applicationRoot
 */
export function resolvePracticeCommand(name, applicationRoot) {
  const commands = {
    "auth:login": {
      args: ["login"],
      executable: "codex",
      requiresAuthenticatedCodex: false,
    },
    "auth:logout": {
      args: ["logout"],
      executable: "codex",
      requiresAuthenticatedCodex: false,
    },
    "auth:status": {
      args: ["login", "status"],
      executable: "codex",
      requiresAuthenticatedCodex: false,
    },
    dev: {
      args: [path.join(applicationRoot, "node_modules/eve/bin/eve.js"), "dev"],
      executable: process.execPath,
      requiresAuthenticatedCodex: true,
    },
  };

  if (name === undefined || !Object.hasOwn(commands, name)) {
    throw new Error(INVALID_COMMAND_MESSAGE);
  }

  return commands[/** @type {keyof typeof commands} */ (name)];
}

export async function main() {
  const applicationRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const repositoryRoot = path.resolve(applicationRoot, "..", "..");

  try {
    const command = resolvePracticeCommand(process.argv[2], applicationRoot);
    /** @type {string[]} */
    const prohibitedCodexHomes = [];

    if (process.env.CODEX_HOME !== undefined) {
      prohibitedCodexHomes.push(process.env.CODEX_HOME);
    }

    if (process.env.HOME !== undefined) {
      prohibitedCodexHomes.push(path.join(process.env.HOME, ".codex"));
    }

    const codexHome = resolvePracticeCodexHome(
      process.env.EVE_PRACTICE_CODEX_HOME,
      repositoryRoot,
      prohibitedCodexHomes,
    );

    /** @type {NodeJS.ProcessEnv} */
    const childEnvironment = { ...process.env, CODEX_HOME: codexHome };
    delete childEnvironment.EVE_PRACTICE_CODEX_HOME;

    if (command.requiresAuthenticatedCodex) {
      const authenticationStatus = spawnSync("codex", ["login", "status"], {
        env: childEnvironment,
        stdio: "ignore",
      });

      if (
        authenticationStatus.status !== 0 ||
        authenticationStatus.error !== undefined
      ) {
        throw new Error(MISSING_LOGIN_MESSAGE);
      }
    }

    const child = spawn(command.executable, command.args, {
      env: childEnvironment,
      stdio: "inherit",
    });

    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal !== null) {
          reject(new Error("The practice command was interrupted."));
          return;
        }

        process.exitCode = code ?? 1;
        resolve(undefined);
      });
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Practice command failed.";
    console.error(message);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
