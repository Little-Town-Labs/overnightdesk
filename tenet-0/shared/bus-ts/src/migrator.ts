import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { parse as parseYaml } from "yaml";

export interface BumpInput {
  pool: Pool;
  proseText: string;
  rulesYaml: string;
  publishedBy: string;
}

export interface BumpResult {
  action: "activated" | "unchanged";
  versionId: number;
  proseSha256: string;
  rulesSha256: string;
  rulesInserted: number;
}

interface RuleSpec {
  id: string;
  event_type_pattern: string;
  requires_approval: "per_action" | "blanket_category" | "none";
  approval_category?: string;
  additional_checks?: Record<string, unknown>;
}

interface ParsedRulesYaml {
  rules?: RuleSpec[];
}

const VALID_MODES = new Set(["per_action", "blanket_category", "none"]);

// bumpConstitution parses the rules YAML, inserts a new constitution version
// with its rules, and activates it — atomically, in one transaction. If a
// version with identical prose+rules SHAs already exists, the call is a no-op
// that returns the existing version_id.
export async function bumpConstitution(input: BumpInput): Promise<BumpResult> {
  const parsed = parseRulesYaml(input.rulesYaml);
  validateRules(parsed.rules);

  const proseSha256 = sha256(input.proseText);
  const rulesSha256 = sha256(input.rulesYaml);

  const client = await input.pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize concurrent bumps — without a unique(prose,rules) constraint,
    // two callers could otherwise pass the duplicate check and double-insert.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('tenet0.bump_constitution'))`,
    );

    // Short-circuit: identical content already exists.
    const { rows: existing } = await client.query<{ version_id: string | number }>(
      `SELECT version_id FROM constitution_versions
        WHERE prose_sha256 = $1 AND rules_sha256 = $2
        LIMIT 1`,
      [proseSha256, rulesSha256],
    );
    if (existing[0]) {
      await client.query("ROLLBACK");
      return {
        action: "unchanged",
        versionId: Number(existing[0].version_id),
        proseSha256,
        rulesSha256,
        rulesInserted: 0,
      };
    }

    const { rows: insertedVersion } = await client.query<{ version_id: string | number }>(
      `INSERT INTO constitution_versions
         (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by, is_active)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING version_id`,
      [proseSha256, rulesSha256, input.proseText, input.rulesYaml, input.publishedBy],
    );
    const versionId = Number(insertedVersion[0].version_id);

    const rules = parsed.rules ?? [];
    for (const r of rules) {
      await client.query(
        `INSERT INTO constitution_rules
           (constitution_version_id, rule_id, event_type_pattern,
            requires_approval_mode, approval_category, additional_checks_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          versionId,
          r.id,
          r.event_type_pattern,
          r.requires_approval,
          r.approval_category ?? null,
          r.additional_checks ? JSON.stringify(r.additional_checks) : null,
        ],
      );
    }

    await client.query(`SELECT activate_constitution($1)`, [versionId]);
    await client.query("COMMIT");

    return {
      action: "activated",
      versionId,
      proseSha256,
      rulesSha256,
      rulesInserted: rules.length,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function parseRulesYaml(yaml: string): ParsedRulesYaml {
  try {
    const parsed = parseYaml(yaml) as ParsedRulesYaml | null;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("migrator: rules YAML did not parse to an object");
    }
    return parsed;
  } catch (err) {
    throw new Error(
      `migrator: invalid rules YAML: ${(err as Error).message}`,
    );
  }
}

function validateRules(rules: RuleSpec[] | undefined): void {
  if (!rules || !Array.isArray(rules)) {
    throw new Error("migrator: rules YAML must define a top-level `rules` list");
  }
  const seenIds = new Set<string>();
  for (const r of rules) {
    if (typeof r.id !== "string" || r.id.length === 0) {
      throw new Error("migrator: rule.id must be a non-empty string");
    }
    if (typeof r.event_type_pattern !== "string" || r.event_type_pattern.length === 0) {
      throw new Error(`migrator: rule ${r.id} event_type_pattern must be a non-empty string`);
    }
    if (!VALID_MODES.has(r.requires_approval)) {
      throw new Error(
        `migrator: rule ${r.id} has invalid requires_approval: ${r.requires_approval}`,
      );
    }
    if (r.requires_approval === "blanket_category" && !r.approval_category) {
      throw new Error(
        `migrator: rule ${r.id} requires approval_category when requires_approval=blanket_category`,
      );
    }
    if (seenIds.has(r.id)) {
      throw new Error(`migrator: duplicate rule id: ${r.id}`);
    }
    seenIds.add(r.id);
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
