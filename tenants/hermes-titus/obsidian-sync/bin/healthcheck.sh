#!/usr/bin/env bash
set -euo pipefail

config_root=${XDG_CONFIG_HOME:-/state/config}/obsidian-headless/sync
require_lock=${OBSIDIAN_HEALTH_REQUIRE_LOCK:-true}

OBSIDIAN_CONFIG_ROOT="$config_root" \
OBSIDIAN_HEALTH_REQUIRE_LOCK="$require_lock" \
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = process.env.OBSIDIAN_CONFIG_ROOT;
const requireLock = process.env.OBSIDIAN_HEALTH_REQUIRE_LOCK !== "false";

function fail(message) {
  console.error(`obsidian_sync=unhealthy reason=${message}`);
  process.exit(1);
}

let entries;
try {
  entries = fs.readdirSync(root, { withFileTypes: true });
} catch {
  fail("uninitialized");
}

const configs = [];
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const candidate = path.join(root, entry.name, "config.json");
  try {
    const stat = fs.lstatSync(candidate);
    if (stat.isFile() && !stat.isSymbolicLink()) configs.push({ candidate, stat });
  } catch {
    // Ignore incomplete state directories.
  }
}

if (configs.length !== 1) fail("config_count");
if ((configs[0].stat.mode & 0o777) !== 0o600) fail("config_mode");

let config;
try {
  config = JSON.parse(fs.readFileSync(configs[0].candidate, "utf8"));
} catch {
  fail("config_parse");
}

if (path.resolve(config.vaultPath || "") !== "/vault") fail("vaultPath_not_vault");
if (config.syncMode && config.syncMode !== "bidirectional") fail("sync_mode");
if (config.conflictStrategy !== "conflict") fail("conflictStrategy_not_conflict");
if (Array.isArray(config.allowSpecialFiles) && config.allowSpecialFiles.length > 0) {
  fail("allowSpecialFiles_enabled");
}

const configDir = config.configDir || ".obsidian";
if (requireLock) {
  const lock = path.join("/vault", configDir, ".sync.lock");
  try {
    if (!fs.statSync(lock).isDirectory()) fail("sync_lock");
  } catch {
    fail("sync_lock");
  }
}

console.log("obsidian_sync=healthy mode=bidirectional conflicts=preserved configs=disabled");
NODE
