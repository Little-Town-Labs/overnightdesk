import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Bus } from "../src/bus.js";
import { Metrics } from "../src/metrics.js";
import { TestDB } from "./testdb.js";

let tdb: TestDB | null;
let opsCred: string;

beforeAll(async () => {
  tdb = await TestDB.create();
  if (!tdb) return;
  opsCred = await tdb.seedDepartment("ops", "ops");
  await tdb.seedBudget("ops", 100_00);
  await tdb.seedConstitution([{ id: "r1", pattern: "*", approvalMode: "none" }]);
});

afterAll(async () => {
  await tdb?.close();
});

describe("Metrics.snapshot", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("returns zeroed snapshot on empty instance", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const metrics = new Metrics(bus);
    const snap = await metrics.snapshot();
    expect(snap.generatedAt).toBeInstanceOf(Date);
    expect(snap.budgetUtilization.length).toBeGreaterThanOrEqual(1);
    expect(typeof snap.auditLogWriteRatePerMinute).toBe("number");
    await bus.close();
  });

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("shows events_per_minute after publishes", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    for (let i = 0; i < 3; i++) {
      await bus.publish(`ops.metric.test.${i}`, "{}");
    }
    const metrics = new Metrics(bus);
    const snap = await metrics.snapshot();
    const opsRow = snap.eventsPerMinute.find((r) => r.department === "ops");
    expect(opsRow).toBeDefined();
    expect(opsRow!.eventsPerMinute).toBeGreaterThanOrEqual(3);
    await bus.close();
  });
});

describe("Metrics.stream", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("fires on interval and stops cleanly", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const metrics = new Metrics(bus);
    let ticks = 0;
    const stop = await metrics.stream(500, () => {
      ticks++;
    });

    const start = Date.now();
    while (ticks < 2 && Date.now() - start < 3000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ticks).toBeGreaterThanOrEqual(2);
    await stop();
    await bus.close();
  });
});
