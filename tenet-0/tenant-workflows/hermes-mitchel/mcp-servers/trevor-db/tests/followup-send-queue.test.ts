import assert from "node:assert/strict";
import test from "node:test";
import { listFollowUpsAwaitingSend } from "../src/followup.js";
import { draft, prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("lists only approved follow-up drafts awaiting send confirmation", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, name: "Approved Buyer" }),
    prospect({ id: 2, name: "Draft Buyer" }),
    prospect({ id: 3, name: "Sent Buyer" })
  ]);
  repo.drafts.push(
    draft({ id: 1, prospectId: 1, status: "approved", approvedAt: new Date("2026-06-23T18:00:00Z") }),
    draft({ id: 2, prospectId: 2, status: "draft" }),
    draft({ id: 3, prospectId: 3, status: "manual_sent", approvedAt: new Date("2026-06-23T18:00:00Z") }),
    draft({ id: 4, prospectId: 3, status: "discarded" })
  );

  const result = await listFollowUpsAwaitingSend(repo, { limit: 10 });

  assert.equal(result.status, "ok");
  assert.equal(result.counts.awaitingSend, 1);
  assert.deepEqual(result.items.map((item) => item.draftId), [1]);
  assert.equal(result.items[0]?.displayName, "Approved Buyer");
  assert.equal(result.items[0]?.reviewOnly, false);
  assert.doesNotMatch(result.items[0]?.summary ?? "", /Thanks for taking the time/);
});

test("marks do-not-contact approved drafts as review-only in the send queue", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, name: "Blocked Buyer", doNotContact: true, status: "do_not_contact" })
  ]);
  repo.drafts.push(draft({
    id: 10,
    prospectId: 1,
    status: "approved",
    approvedAt: new Date("2026-06-23T18:00:00Z")
  }));

  const result = await listFollowUpsAwaitingSend(repo, { limit: 10 });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.reviewOnly, true);
  assert.match(result.items[0]?.summary ?? "", /review/i);
  assert.equal(result.counts.reviewOnly, 1);
});
