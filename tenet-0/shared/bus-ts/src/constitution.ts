import type { Bus } from "./bus.js";

export interface ConstitutionRule {
  ruleId: string;
  eventTypePattern: string;
  requiresApprovalMode: string; // "per_action" | "blanket_category" | "none" | ""
  approvalCategory: string;
}

export interface LoadedConstitution {
  versionId: number;
  proseText: string;
  rulesYaml: string;
  rules: ConstitutionRule[];
}

const MIN_WATCH_INTERVAL_MS = 1000;

// Constitution exposes the active versioned constitution and a watch helper
// for hot-reloading agent prompts when the constitution is bumped.
export class Constitution {
  private readonly bus: Bus;

  constructor(bus: Bus) {
    this.bus = bus;
  }

  async load(): Promise<LoadedConstitution> {
    const { rows: versionRows } = await this.bus.pool.query(
      `SELECT version_id, prose_text, rules_yaml
         FROM constitution_versions WHERE is_active LIMIT 1`,
    );
    const v = versionRows[0];
    if (!v) throw new Error("constitution: no active version");

    const { rows: ruleRows } = await this.bus.pool.query(
      `SELECT rule_id, event_type_pattern,
              COALESCE(requires_approval_mode, '') AS requires_approval_mode,
              COALESCE(approval_category, '') AS approval_category
         FROM constitution_rules
        WHERE constitution_version_id = $1
        ORDER BY id`,
      [v.version_id],
    );

    return {
      versionId: Number(v.version_id),
      proseText: v.prose_text,
      rulesYaml: v.rules_yaml,
      rules: ruleRows.map((r) => ({
        ruleId: r.rule_id,
        eventTypePattern: r.event_type_pattern,
        requiresApprovalMode: r.requires_approval_mode,
        approvalCategory: r.approval_category,
      })),
    };
  }

  async currentVersion(): Promise<number> {
    const { rows } = await this.bus.pool.query(
      `SELECT version_id FROM constitution_versions WHERE is_active LIMIT 1`,
    );
    if (!rows[0]) throw new Error("constitution: no active version");
    return Number(rows[0].version_id);
  }

  // watch polls currentVersion at the given interval and invokes onChange when
  // the version changes. Returns a stop() function. The minimum effective
  // interval is 1 second — smaller values are clamped.
  async watch(
    intervalMs: number,
    onChange: (newVersion: number) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    if (intervalMs <= 0) {
      throw new Error("constitution: watch interval must be positive");
    }
    const effective = Math.max(intervalMs, MIN_WATCH_INTERVAL_MS);
    if (effective !== intervalMs) {
      console.warn(
        `constitution: watch interval ${intervalMs}ms below minimum, clamped to ${effective}ms`,
      );
    }

    let current = await this.currentVersion();
    let stopped = false;
    let timer: NodeJS.Timeout | null = null;
    let pending: Promise<void> | null = null;

    const tick = async (): Promise<void> => {
      if (stopped) return;
      try {
        const v = await this.currentVersion();
        if (v !== current) {
          current = v;
          await onChange(v);
        }
      } catch (err) {
        if (!stopped) {
          console.warn("constitution: watch poll failed:", err);
        }
      }
    };

    timer = setInterval(() => {
      if (pending) return; // Skip tick if the last one is still running.
      pending = tick().finally(() => {
        pending = null;
      });
    }, effective);

    return async () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (pending) await pending;
    };
  }
}
