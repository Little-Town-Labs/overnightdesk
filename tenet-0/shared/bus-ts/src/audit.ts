import type { Bus } from "./bus.js";

export interface AuditFilter {
  actor?: string;
  action?: string;
  fromTime?: Date;
  toTime?: Date;
  limit?: number; // Default: 1000.
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  detail: unknown;
  recordedAt: Date;
}

// Audit wraps read-only queries against audit_log. Requires tenet0_secops
// grants on the configured connection; callers using tenet0_app will see a
// permission error.
export class Audit {
  private readonly bus: Bus;

  constructor(bus: Bus) {
    this.bus = bus;
  }

  async query(f: AuditFilter = {}): Promise<AuditEntry[]> {
    const { clauses, args } = buildClauses(f);
    const limit = f.limit && f.limit > 0 ? f.limit : 1000;
    args.push(limit);
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const sql = `SELECT id, actor_id, action, detail_json, recorded_at
                   FROM audit_log ${where} ORDER BY recorded_at DESC LIMIT $${args.length}`;
    const { rows } = await this.bus.pool.query(sql, args);
    return rows.map(rowToEntry);
  }

  // stream polls audit_log for entries with id greater than the last-seen id
  // and invokes onEntry for each. Returns a stop() function. Starts from the
  // current max id (no history replay).
  async stream(
    intervalMs: number,
    f: AuditFilter,
    onEntry: (e: AuditEntry) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    if (intervalMs <= 0) {
      throw new Error("audit: stream interval must be positive");
    }
    const { rows } = await this.bus.pool.query(
      `SELECT COALESCE(MAX(id), 0)::bigint AS max_id FROM audit_log`,
    );
    let lastId = Number(rows[0]?.max_id ?? 0);
    let stopped = false;
    let pending: Promise<void> | null = null;

    const poll = async (): Promise<void> => {
      if (stopped) return;
      const { clauses, args } = buildClauses(f);
      args.push(lastId);
      clauses.push(`id > $${args.length}`);
      const limit = f.limit && f.limit > 0 ? f.limit : 1000;
      args.push(limit);
      const sql = `SELECT id, actor_id, action, detail_json, recorded_at
                     FROM audit_log WHERE ${clauses.join(" AND ")}
                    ORDER BY id ASC LIMIT $${args.length}`;
      try {
        const { rows } = await this.bus.pool.query(sql, args);
        for (const row of rows) {
          const entry = rowToEntry(row);
          await onEntry(entry);
          if (entry.id > lastId) lastId = entry.id;
        }
      } catch (err) {
        if (!stopped) console.warn("audit: stream poll failed:", err);
      }
    };

    const timer = setInterval(() => {
      if (pending) return;
      pending = poll().finally(() => {
        pending = null;
      });
    }, intervalMs);

    return async () => {
      stopped = true;
      clearInterval(timer);
      if (pending) await pending;
    };
  }
}

function buildClauses(f: AuditFilter): { clauses: string[]; args: unknown[] } {
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (f.actor) {
    args.push(f.actor);
    clauses.push(`actor_id = $${args.length}`);
  }
  if (f.action) {
    args.push(f.action);
    clauses.push(`action = $${args.length}`);
  }
  if (f.fromTime) {
    args.push(f.fromTime);
    clauses.push(`recorded_at >= $${args.length}`);
  }
  if (f.toTime) {
    args.push(f.toTime);
    clauses.push(`recorded_at < $${args.length}`);
  }
  return { clauses, args };
}

function rowToEntry(row: Record<string, unknown>): AuditEntry {
  return {
    id: Number(row.id),
    actor: String(row.actor_id),
    action: String(row.action),
    detail: row.detail_json,
    recordedAt: row.recorded_at as Date,
  };
}
