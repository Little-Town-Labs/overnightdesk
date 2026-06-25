import assert from "node:assert/strict";
import test from "node:test";
import { captureBuyerIntake } from "../src/intake.js";
import { FakeQueueRepository } from "./test-repo.js";

test("bounds long notes and redacts secret-like content", async () => {
  const repo = new FakeQueueRepository([]);
  const longNotes = `${"Buyer wants princess cuts. ".repeat(200)} Authorization: Bearer app-secret-1234567890 TREVOR_DB_URL=postgres://secret`;

  const result = await captureBuyerIntake(repo, {
    source: "manual_entry",
    company: "Bounded Buyer LLC",
    email: "bounded@example.test",
    conversationSummary: longNotes
  });

  assert.equal(result.status, "created");
  assert.ok((repo.interactions[0]?.summary?.length ?? 0) <= 1000);
  assert.doesNotMatch(repo.interactions[0]?.summary ?? "", /app-secret|postgres:\/\/secret|Bearer app/);
  assert.doesNotMatch(JSON.stringify(result), /app-secret|postgres:\/\/secret|Bearer app/);
});
