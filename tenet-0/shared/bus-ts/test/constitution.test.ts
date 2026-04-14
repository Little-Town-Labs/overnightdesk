import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Bus } from "../src/bus.js";
import { Constitution } from "../src/constitution.js";
import { TestDB } from "./testdb.js";

let tdb: TestDB | null;
let cred: string;

beforeAll(async () => {
  tdb = await TestDB.create();
  if (!tdb) return;
  cred = await tdb.seedDepartment("ops", "ops");
  await tdb.seedBudget("ops", 100_00);
  await tdb.seedConstitution([
    { id: "r1", pattern: "ops.*", approvalMode: "per_action", category: "" },
  ]);
});

afterAll(async () => {
  await tdb?.close();
});

describe("Constitution.load", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("returns active version prose and rules", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: cred,
    });
    const con = new Constitution(bus);
    const loaded = await con.load();
    expect(loaded.versionId).toBeGreaterThan(0);
    expect(loaded.proseText).toBe("test prose");
    expect(loaded.rules.length).toBeGreaterThanOrEqual(1);
    expect(loaded.rules[0].ruleId).toBe("r1");
    expect(loaded.rules[0].requiresApprovalMode).toBe("per_action");
    await bus.close();
  });
});

describe("Constitution.watch", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("fires callback when version bumps", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: cred,
    });
    const con = new Constitution(bus);
    let observed = 0;
    const stop = await con.watch(1000, (v) => {
      observed = v;
    });

    await tdb!.pool.query(
      `UPDATE constitution_versions SET is_active = false WHERE is_active`,
    );
    const { rows } = await tdb!.pool.query<{ version_id: string }>(
      `INSERT INTO constitution_versions
         (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by, is_active)
       VALUES ('h2','h2','v2 prose','rules: []','test', true)
       RETURNING version_id`,
    );
    const newId = Number(rows[0].version_id);

    const start = Date.now();
    while (observed !== newId && Date.now() - start < 3500) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(observed).toBe(newId);
    await stop();
    await bus.close();
  });
});
