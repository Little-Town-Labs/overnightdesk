import assert from "node:assert/strict";
import test from "node:test";
import { capturePostCall } from "../src/capture.js";
import { prospect, task } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("reports skipped Agiled note for unlinked prospects", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, agiledContactId: null })
  ]);
  repo.tasks.push(task({ id: 55, prospectId: 1 }));

  const result = await capturePostCall(repo, {
    taskId: 55,
    outcome: "left_voicemail"
  });

  assert.equal(result.status, "captured");
  assert.equal(result.agiledNote.status, "skipped");
});

test("reports Agiled note failure separately from local capture", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 2, agiledContactId: "agiled-2" })
  ]);
  repo.tasks.push(task({ id: 56, prospectId: 2 }));

  const result = await capturePostCall(repo, {
    taskId: 56,
    outcome: "quoted",
    summary: "Quoted 2ct GIA round.",
    agiledNoteStatus: "failed"
  });

  assert.equal(result.status, "captured");
  assert.equal(result.interactionId, 1);
  assert.equal(result.agiledNote.status, "failed");
  assert.ok(result.warnings.some((warning) => warning.includes("Agiled")));
});
