import assert from "node:assert/strict";
import test from "node:test";
import { generatePreCallBrief, preCallBriefToMcp } from "../src/brief.js";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("labels missing context and maps to snake_case MCP response", async () => {
  const repo = new FakeQueueRepository([
    prospect({
      id: 30,
      phone: null,
      preferredChannel: null,
      agiledContactId: null,
      notes: "Long private note should be summarized for the brief rather than dumped in full."
    })
  ]);

  const result = preCallBriefToMcp(await generatePreCallBrief(repo, {
    prospectId: 30,
    inventoryContext: ""
  }));

  assert.equal(result.lookup.status, "found");
  assert.ok(result.missing_context.includes("phone"));
  assert.ok(result.missing_context.includes("preferred_channel"));
  assert.ok(result.missing_context.includes("agiled_contact"));
  assert.ok(result.missing_context.includes("recent_interaction"));
  assert.ok(result.missing_context.includes("inventory_context"));
  assert.ok(result.warnings.some((warning) => warning.includes("Inventory context unavailable")));
  assert.ok(result.brief?.recommended_ask);
  assert.ok(!("recommendedAsk" in (result.brief ?? {})));
});
