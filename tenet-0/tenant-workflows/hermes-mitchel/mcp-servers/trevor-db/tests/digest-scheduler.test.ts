import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateCadenceDigest } from "../src/digest.js";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("cadence digest is not scheduled by default", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);

  const result = await generateCadenceDigest(repo, { salesDay: "2026-06-24" });

  assert.equal(result.scheduled, false);
  assert.ok(result.warnings.some((warning) => warning.includes("Scheduler is disabled by default")));
});

test("scheduler runbook documents validation, enable, disable, rollback, owner, logs, and side effects", () => {
  const runbook = readFileSync("../../runbooks/cadence-scheduler.md", "utf8");

  for (const phrase of [
    "Validation",
    "Enable",
    "Disable",
    "Rollback",
    "Owner",
    "Log location",
    "Side-effect checks"
  ]) {
    assert.ok(runbook.includes(phrase), `missing ${phrase}`);
  }
});
