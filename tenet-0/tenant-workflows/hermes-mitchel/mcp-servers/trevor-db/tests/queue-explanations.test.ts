import assert from "node:assert/strict";
import test from "node:test";
import { generateDailyCallQueue } from "../src/queue.js";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("explains missing Agiled and optional inventory context honestly", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, agiledContactId: null, notes: "Wants oval stones." })
  ]);

  const withoutInventory = await generateDailyCallQueue(repo, {
    salesDay: "2026-06-24",
    persist: false
  });
  assert.ok(withoutInventory.recommendations[0]?.missingContext.includes("agiled_contact"));
  assert.match(withoutInventory.warnings[0] ?? "", /Inventory context unavailable/);

  const withInventory = await generateDailyCallQueue(repo, {
    salesDay: "2026-06-24",
    persist: false,
    inventoryContext: "2ct oval available"
  });
  assert.ok(withInventory.recommendations[0]?.rankingDrivers.includes("inventory_context_available"));
  assert.match(withInventory.warnings[0] ?? "", /not stored/);
});
