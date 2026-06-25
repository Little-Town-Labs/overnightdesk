import assert from "node:assert/strict";
import test from "node:test";
import { generatePreCallBrief } from "../src/brief.js";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("generates a pre-call brief by prospect id", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 20, name: "Direct Buyer", company: "Direct Co" })
  ]);

  const result = await generatePreCallBrief(repo, { prospectId: 20 });

  assert.equal(result.lookup.status, "found");
  assert.equal(result.prospect?.prospectId, 20);
  assert.equal(result.disambiguation.length, 0);
});

test("returns bounded disambiguation for ambiguous prospect query", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 21, name: "Alex Stone", company: "North Diamond" }),
    prospect({ id: 22, name: "Alex Stone", company: "South Diamond" })
  ]);

  const result = await generatePreCallBrief(repo, { query: "Alex" });

  assert.equal(result.lookup.status, "ambiguous");
  assert.equal(result.prospect, null);
  assert.equal(result.brief, null);
  assert.deepEqual(result.disambiguation.map((item) => item.prospectId), [21, 22]);
});
