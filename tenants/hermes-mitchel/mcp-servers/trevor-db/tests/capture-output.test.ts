import assert from "node:assert/strict";
import test from "node:test";
import { capturePostCall, postCallCaptureToMcp } from "../src/capture.js";
import { prospect, task } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("maps capture output to the documented MCP snake_case contract", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.tasks.push(task({ id: 55, prospectId: 1 }));

  const result = await capturePostCall(repo, {
    taskId: 55,
    outcome: "no_answer",
    agiledNoteStatus: "created"
  });
  const mcp = postCallCaptureToMcp(result);

  assert.equal(mcp.status, "captured");
  assert.deepEqual(mcp.missing_fields, []);
  assert.equal(mcp.interaction_id, 1);
  assert.equal(mcp.prospect_id, 1);
  assert.equal(mcp.task_id, 55);
  assert.equal(mcp.task_status, "completed");
  assert.equal(mcp.outbound_sent, false);
  assert.equal(mcp.agiled_note.status, "created");
});
