import assert from "node:assert/strict";
import test from "node:test";
import { generatePreCallBrief } from "../src/brief.js";
import { interaction, prospect, task } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("generates a task-anchored pre-call brief without side effects", async () => {
  const repo = new FakeQueueRepository([
    prospect({
      id: 10,
      name: "Mitchel Buyer",
      company: "Diamond Co",
      lastOutcome: "asked for GIA options",
      notes: "Prefers GIA round stones. Budget sensitive. Avoid long memo terms."
    })
  ]);
  repo.tasks.push(task({ id: 55, prospectId: 10 }));
  repo.interactions.push(interaction({ prospectId: 10 }));

  const result = await generatePreCallBrief(repo, { taskId: 55 });

  assert.equal(result.lookup.status, "found");
  assert.equal(result.prospect?.prospectId, 10);
  assert.equal(result.task?.taskId, 55);
  assert.ok(result.lastTouch?.summary.includes("Discussed ideal GIA"));
  assert.ok(result.brief?.recommendedAsk);
  assert.ok(result.brief?.suggestedOpener);
  assert.ok(result.brief?.followUpFallback);
  assert.equal(repo.created, 0);
});

test("warns when a task-linked prospect is do-not-contact", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 11, doNotContact: true })
  ]);
  repo.tasks.push(task({ id: 56, prospectId: 11 }));

  const result = await generatePreCallBrief(repo, { taskId: 56 });

  assert.equal(result.lookup.status, "found");
  assert.equal(result.brief?.readiness, "do_not_contact");
  assert.ok(result.warnings.some((warning) => warning.includes("do-not-contact")));
});
