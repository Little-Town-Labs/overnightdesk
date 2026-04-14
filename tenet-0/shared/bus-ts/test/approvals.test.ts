import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Approvals } from "../src/approvals.js";
import { Bus } from "../src/bus.js";
import { ErrNamespaceViolation } from "../src/errors.js";
import { TestDB } from "./testdb.js";

let tdb: TestDB | null;
let presCred: string;
let opsCred: string;

beforeAll(async () => {
  tdb = await TestDB.create();
  if (!tdb) return;
  presCred = await tdb.seedDepartment("president", "president");
  opsCred = await tdb.seedDepartment("ops", "ops");
  await tdb.seedBudget("president", 100_00);
  await tdb.seedBudget("ops", 100_00);
  await tdb.seedConstitution([
    { id: "r1", pattern: "*", approvalMode: "none" },
  ]);
});

afterAll(async () => {
  await tdb?.close();
});

describe("Approvals.grantPerAction", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("publishes approval event as president", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "president",
      credential: presCred,
    });
    const approvals = new Approvals(bus);
    // Seed a request event to approve.
    const { rows } = await tdb!.pool.query<{ event_id: string }>(
      `SELECT event_id FROM publish_event($1, $2, $3::jsonb, NULL, NULL)`,
      [presCred, "president.approval.requested", JSON.stringify({ amt: 100 })],
    );
    const id = await approvals.grantPerAction({
      targetEventId: rows[0].event_id,
      scope: "fin.payment.outbound",
      reason: "payroll",
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await bus.close();
  });
});

describe("Approvals.grantBlanket + revoke", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("grant then revoke publishes both events", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "president",
      credential: presCred,
    });
    const approvals = new Approvals(bus);
    const grantId = await approvals.grantBlanket({
      category: "content-publishing",
      constraints: { max_posts_per_day: 5 },
      reason: "marketing campaign",
    });
    expect(grantId).toBeTruthy();

    const revokeId = await approvals.revoke(grantId, "campaign ended");
    expect(revokeId).toBeTruthy();

    const { rows } = await tdb!.pool.query(
      `SELECT payload->>'category' AS category,
              payload->>'revoked_approval_id' AS revoked_id
         FROM events WHERE id = $1`,
      [revokeId],
    );
    expect(rows[0].category).toBe("content-publishing");
    expect(rows[0].revoked_id).toBe(grantId);
    await bus.close();
  });
});

describe("Approvals namespace enforcement", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("non-president cannot publish president.* events", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const approvals = new Approvals(bus);
    await expect(
      approvals.grantPerAction({
        targetEventId: "00000000-0000-0000-0000-000000000000",
        scope: "fin.payment.outbound",
      }),
    ).rejects.toBeInstanceOf(ErrNamespaceViolation);
    await bus.close();
  });
});
