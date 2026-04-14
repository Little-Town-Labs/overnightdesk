import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Audit } from "../src/audit.js";
import { Bus } from "../src/bus.js";
import { TestDB } from "./testdb.js";

let tdb: TestDB | null;
let opsCred: string;

beforeAll(async () => {
  tdb = await TestDB.create();
  if (!tdb) return;
  opsCred = await tdb.seedDepartment("ops", "ops");
  await tdb.seedBudget("ops", 100_00);
  await tdb.seedConstitution([{ id: "r1", pattern: "*", approvalMode: "none" }]);

  const bus = await Bus.connect({
    postgresUrl: tdb.url,
    department: "ops",
    credential: opsCred,
  });
  await bus.publish("ops.task.done", JSON.stringify({ n: 1 })).catch(() => {});
  await bus.publish("ops.task.done", JSON.stringify({ n: 2 })).catch(() => {});
  await bus.publish("fin.payment.out", JSON.stringify({})).catch(() => {});
  await bus.close();
});

afterAll(async () => {
  await tdb?.close();
});

describe("Audit.query", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("filters by actor", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const audit = new Audit(bus);
    const entries = await audit.query({ actor: "ops" });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.actor === "ops")).toBe(true);
    await bus.close();
  });

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("filters by action", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const audit = new Audit(bus);
    const entries = await audit.query({ action: "event.rejected.namespace" });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.action === "event.rejected.namespace")).toBe(true);
    await bus.close();
  });

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("time window narrows results", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const audit = new Audit(bus);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const entries = await audit.query({ fromTime: future });
    expect(entries.length).toBe(0);
    await bus.close();
  });
});

describe("Audit.stream", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("delivers new entries", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const audit = new Audit(bus);
    const seen: string[] = [];
    const stop = await audit.stream(500, {}, (e) => {
      seen.push(e.action);
    });

    await bus.publish("ops.stream.test", JSON.stringify({}));

    const start = Date.now();
    while (seen.length === 0 && Date.now() - start < 3000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(seen.length).toBeGreaterThan(0);
    await stop();
    await bus.close();
  });
});
