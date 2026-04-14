import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bumpConstitution } from "../src/migrator.js";
import { TestDB } from "./testdb.js";

let tdb: TestDB | null;

beforeAll(async () => {
  tdb = await TestDB.create();
});

afterAll(async () => {
  await tdb?.close();
});

beforeEach(async () => {
  if (!tdb) return;
  // Reset constitution state so each test starts clean.
  // events has an FK into constitution_versions; clear it first.
  await tdb.pool.query(`TRUNCATE events, constitution_rules, constitution_versions RESTART IDENTITY CASCADE`);
});

const SAMPLE_PROSE = "# Constitution v1\n\nThis is the governing prose.\n";

const SAMPLE_RULES = `version: 1
rules:
  - id: fin-payment-outbound-requires-approval
    event_type_pattern: fin.payment.outbound
    requires_approval: per_action
  - id: marketing-content-blanket
    event_type_pattern: cro.content.published
    requires_approval: blanket_category
    approval_category: routine.marketing.content
  - id: secops-violation-allowed
    event_type_pattern: secops.violation.*
    requires_approval: none
`;

describe("bumpConstitution", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)(
    "valid YAML creates new version and populates rules",
    async () => {
      const r = await bumpConstitution({
        pool: tdb!.pool,
        proseText: SAMPLE_PROSE,
        rulesYaml: SAMPLE_RULES,
        publishedBy: "test-runner",
      });
      expect(r.action).toBe("activated");
      expect(r.versionId).toBeGreaterThan(0);

      const { rows: activeRows } = await tdb!.pool.query(
        `SELECT version_id, published_by, is_active
           FROM constitution_versions WHERE is_active`,
      );
      expect(activeRows.length).toBe(1);
      expect(Number(activeRows[0].version_id)).toBe(r.versionId);
      expect(activeRows[0].published_by).toBe("test-runner");

      const { rows: ruleRows } = await tdb!.pool.query(
        `SELECT rule_id, event_type_pattern, requires_approval_mode, approval_category
           FROM constitution_rules WHERE constitution_version_id = $1`,
        [r.versionId],
      );
      expect(ruleRows.length).toBe(3);
      const byId = new Map(ruleRows.map((row) => [row.rule_id, row]));
      expect(byId.get("fin-payment-outbound-requires-approval")!.requires_approval_mode).toBe("per_action");
      expect(byId.get("marketing-content-blanket")!.approval_category).toBe("routine.marketing.content");
      expect(byId.get("secops-violation-allowed")!.requires_approval_mode).toBe("none");
    },
  );

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)(
    "same content is a no-op (duplicate SHAs)",
    async () => {
      const first = await bumpConstitution({
        pool: tdb!.pool,
        proseText: SAMPLE_PROSE,
        rulesYaml: SAMPLE_RULES,
        publishedBy: "test-runner",
      });
      const second = await bumpConstitution({
        pool: tdb!.pool,
        proseText: SAMPLE_PROSE,
        rulesYaml: SAMPLE_RULES,
        publishedBy: "test-runner",
      });
      expect(second.action).toBe("unchanged");
      expect(second.versionId).toBe(first.versionId);

      const { rows } = await tdb!.pool.query(
        `SELECT COUNT(*)::int AS n FROM constitution_versions
           WHERE prose_sha256 = $1`,
        [first.proseSha256],
      );
      expect(rows[0].n).toBe(1);
    },
  );

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)(
    "invalid YAML rejects with error, no DB change",
    async () => {
      const { rows: before } = await tdb!.pool.query(
        `SELECT COUNT(*)::int AS n FROM constitution_versions`,
      );

      await expect(
        bumpConstitution({
          pool: tdb!.pool,
          proseText: SAMPLE_PROSE,
          rulesYaml: "rules: [::: not valid yaml",
          publishedBy: "test-runner",
        }),
      ).rejects.toThrow(/yaml/i);

      const { rows: after } = await tdb!.pool.query(
        `SELECT COUNT(*)::int AS n FROM constitution_versions`,
      );
      expect(after[0].n).toBe(before[0].n);
    },
  );

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)(
    "invalid requires_approval value rolls back fully",
    async () => {
      const badRules = `version: 1
rules:
  - id: bad-rule
    event_type_pattern: bad.*
    requires_approval: invalid_mode
`;
      const { rows: before } = await tdb!.pool.query(
        `SELECT COUNT(*)::int AS n FROM constitution_versions`,
      );

      await expect(
        bumpConstitution({
          pool: tdb!.pool,
          proseText: "# bad version\n",
          rulesYaml: badRules,
          publishedBy: "test-runner",
        }),
      ).rejects.toThrow();

      const { rows: after } = await tdb!.pool.query(
        `SELECT COUNT(*)::int AS n FROM constitution_versions`,
      );
      expect(after[0].n).toBe(before[0].n);
    },
  );

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)(
    "concurrent bumps of identical content produce exactly one version",
    async () => {
      // Race two identical bumps. The advisory lock inside the transaction
      // must serialize them so the second observes the first's insert and
      // returns action=unchanged.
      const [a, b] = await Promise.all([
        bumpConstitution({
          pool: tdb!.pool,
          proseText: SAMPLE_PROSE,
          rulesYaml: SAMPLE_RULES,
          publishedBy: "racer-a",
        }),
        bumpConstitution({
          pool: tdb!.pool,
          proseText: SAMPLE_PROSE,
          rulesYaml: SAMPLE_RULES,
          publishedBy: "racer-b",
        }),
      ]);
      expect(a.versionId).toBe(b.versionId);
      const actions = [a.action, b.action].sort();
      expect(actions).toEqual(["activated", "unchanged"]);

      const { rows } = await tdb!.pool.query(
        `SELECT COUNT(*)::int AS n FROM constitution_versions`,
      );
      expect(rows[0].n).toBe(1);
    },
  );

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)(
    "duplicate rule IDs rejected with no DB change",
    async () => {
      const dupRules = `version: 1
rules:
  - id: dup-rule
    event_type_pattern: a.b.c
    requires_approval: none
  - id: dup-rule
    event_type_pattern: x.y.z
    requires_approval: none
`;
      await expect(
        bumpConstitution({
          pool: tdb!.pool,
          proseText: "# dup\n",
          rulesYaml: dupRules,
          publishedBy: "test",
        }),
      ).rejects.toThrow(/duplicate rule id/);
      const { rows } = await tdb!.pool.query(
        `SELECT COUNT(*)::int AS n FROM constitution_versions`,
      );
      expect(rows[0].n).toBe(0);
    },
  );

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)(
    "new content deactivates prior version atomically",
    async () => {
      const first = await bumpConstitution({
        pool: tdb!.pool,
        proseText: SAMPLE_PROSE,
        rulesYaml: SAMPLE_RULES,
        publishedBy: "test-runner",
      });
      const second = await bumpConstitution({
        pool: tdb!.pool,
        proseText: SAMPLE_PROSE + "\nUpdated.\n",
        rulesYaml: SAMPLE_RULES,
        publishedBy: "test-runner",
      });
      expect(second.action).toBe("activated");
      expect(second.versionId).not.toBe(first.versionId);

      const { rows } = await tdb!.pool.query(
        `SELECT version_id FROM constitution_versions WHERE is_active`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0].version_id)).toBe(second.versionId);
    },
  );
});
