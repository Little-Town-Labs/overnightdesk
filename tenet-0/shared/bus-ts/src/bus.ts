import { Pool, Client } from "pg";
import {
  ErrConnectionLost,
  ErrCausalityLoop,
  ErrConstitutionRejected,
  ErrNamespaceViolation,
  ErrNoConstitution,
  ErrUnauthenticated,
} from "./errors.js";
import {
  matchesPattern,
  parsePattern,
  patternToLike,
  type ParsedPattern,
} from "./patterns.js";
import { budgetStatus, spStatus } from "./status.js";
import type {
  BudgetStatusResult,
  Config,
  Event,
  PublishOptions,
  SubscriptionHandler,
} from "./types.js";

// Bus is a connected Tenet-0 client. Construct via Bus.connect().
export class Bus {
  readonly config: Config;
  readonly pool: Pool;
  private closed = false;
  private subs: Subscription[] = [];

  private constructor(config: Config, pool: Pool) {
    this.config = config;
    this.pool = pool;
  }

  static async connect(config: Config): Promise<Bus> {
    const pool = new Pool({ connectionString: config.postgresUrl });
    try {
      const { rows } = await pool.query(
        `SELECT status, limit_cents, spent_cents, remaining_cents FROM check_budget($1)`,
        [config.credential],
      );
      const row = rows[0];
      if (!row || row.status === budgetStatus.unauthenticated) {
        throw new ErrUnauthenticated();
      }
      return new Bus(config, pool);
    } catch (err) {
      await pool.end().catch(() => {});
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const subs = this.subs;
    this.subs = [];
    await Promise.all(subs.map((s) => s.close()));
    await this.pool.end();
  }

  isClosed(): boolean {
    return this.closed;
  }

  async publish(
    eventType: string,
    payload: string | Buffer | null | undefined,
    opts: PublishOptions = {},
  ): Promise<string> {
    // Normalize empty/null payload to "{}" — events.payload is NOT NULL.
    let body: string;
    if (payload == null) {
      body = "{}";
    } else if (Buffer.isBuffer(payload)) {
      body = payload.length === 0 ? "{}" : payload.toString("utf8");
    } else {
      body = payload.length === 0 ? "{}" : payload;
    }

    const { rows } = await this.pool.query(
      `SELECT status, event_id, error_msg FROM publish_event($1, $2, $3::jsonb, $4, $5)`,
      [
        this.config.credential,
        eventType,
        body,
        opts.parentEventId ?? null,
        opts.approvalEventId ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("bus: publish returned no row");
    const { status, event_id, error_msg } = row as {
      status: string | null;
      event_id: string | null;
      error_msg: string | null;
    };
    if (status == null) throw new Error("bus: publish returned null status");

    switch (status) {
      case spStatus.ok:
        if (event_id == null) {
          throw new Error("bus: ok status but null event_id");
        }
        return event_id;
      case spStatus.rejectedUnauthenticated:
        throw new ErrUnauthenticated();
      case spStatus.rejectedNamespace:
        throw new ErrNamespaceViolation();
      case spStatus.rejectedConstitution:
        throw new ErrConstitutionRejected(error_msg ?? undefined);
      case spStatus.rejectedCausality:
        throw new ErrCausalityLoop();
      case spStatus.rejectedNoConstitution:
        throw new ErrNoConstitution();
      default:
        throw new Error(
          `bus: publish rejected with status=${status}${error_msg ? `: ${error_msg}` : ""}`,
        );
    }
  }

  async subscribe(
    key: string,
    pattern: string,
    handler: SubscriptionHandler,
  ): Promise<Subscription> {
    if (this.closed) throw new ErrConnectionLost();

    await this.pool.query(`SELECT register_subscription($1, $2, $3)`, [
      this.config.credential,
      key,
      pattern,
    ]);

    const sub = new Subscription(this, key, parsePattern(pattern), handler);
    this.subs.push(sub);
    await sub.start();
    return sub;
  }

  async checkBudget(): Promise<BudgetStatusResult> {
    const { rows } = await this.pool.query(
      `SELECT status, limit_cents, spent_cents, remaining_cents FROM check_budget($1)`,
      [this.config.credential],
    );
    const row = rows[0];
    if (!row) throw new ErrUnauthenticated();
    if (row.status === budgetStatus.unauthenticated) {
      throw new ErrUnauthenticated();
    }
    return {
      status: row.status,
      limitCents: Number(row.limit_cents),
      spentCents: Number(row.spent_cents),
      remainingCents: Number(row.remaining_cents),
    };
  }
}

// Subscription streams events matching a pattern. close() to stop.
//
// Delivery ordering: the dedicated LISTEN client emits notifications
// asynchronously, but we chain each deliver through `deliveryQueue` so
// handlers run serially in notification order — matching the Go
// WaitForNotification loop. At-least-once semantics (same as Go).
export class Subscription {
  private readonly bus: Bus;
  private readonly key: string;
  private readonly pattern: ParsedPattern;
  private readonly handler: SubscriptionHandler;
  private listenClient: Client | null = null;
  private closed = false;
  private deliveryQueue: Promise<void> = Promise.resolve();

  constructor(
    bus: Bus,
    key: string,
    pattern: ParsedPattern,
    handler: SubscriptionHandler,
  ) {
    this.bus = bus;
    this.key = key;
    this.pattern = pattern;
    this.handler = handler;
  }

  async start(): Promise<void> {
    await this.replayMissed();

    // Dedicated client for LISTEN so a long-held listener doesn't pin a pool slot.
    const client = new Client({ connectionString: this.bus.config.postgresUrl });
    await client.connect();
    this.listenClient = client;

    client.on("notification", (msg) => {
      if (msg.channel !== "event_bus" || !msg.payload) return;
      const { id, eventType } = parseNotifyPayload(msg.payload);
      if (eventType && !matchesPattern(this.pattern, eventType)) return;
      // Chain onto the delivery queue so handlers run in notification order.
      this.deliveryQueue = this.deliveryQueue.then(() =>
        this.deliverById(id).catch((err) => {
          if (this.closed) return;
          console.error(
            `subscription ${this.key}: deliver ${id} failed:`,
            err,
          );
        }),
      );
    });

    // Connection-level errors tear down the listen client. Full reconnect is
    // deferred (matches Go behavior — caller re-subscribes on Bus reconnect).
    client.on("error", (err) => {
      if (this.closed) return;
      console.error(
        `subscription ${this.key}: listen client error, stopping:`,
        err,
      );
      void this.close();
    });

    await client.query("LISTEN event_bus");
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.listenClient) {
      try {
        await this.listenClient.query("UNLISTEN event_bus");
      } catch {
        // Ignore — connection may already be gone.
      }
      await this.listenClient.end().catch(() => {});
      this.listenClient = null;
    }
    // Drain any in-flight deliveries so close() semantics mirror Go's wait.
    await this.deliveryQueue;
  }

  private async replayMissed(): Promise<void> {
    const { rows: cursorRows } = await this.bus.pool.query(
      `SELECT e.published_at
         FROM event_subscriptions es
         LEFT JOIN events e ON e.id = es.last_consumed_event_id
        WHERE es.department_id = $1 AND es.subscription_key = $2`,
      [this.bus.config.department, this.key],
    );
    const lastAt: Date | null = cursorRows[0]?.published_at ?? null;

    const like = patternToLike(this.pattern);
    const query =
      lastAt == null
        ? {
            text: `SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
                     FROM events WHERE event_type LIKE $1 ORDER BY published_at ASC`,
            values: [like],
          }
        : {
            text: `SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
                     FROM events WHERE event_type LIKE $1 AND published_at > $2
                    ORDER BY published_at ASC`,
            values: [like, lastAt],
          };

    const { rows } = await this.bus.pool.query(query.text, query.values);
    for (const row of rows) {
      await this.deliverEvent(rowToEvent(row));
    }
  }

  private async deliverById(eventId: string): Promise<void> {
    const { rows } = await this.bus.pool.query(
      `SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
         FROM events WHERE id = $1`,
      [eventId],
    );
    const row = rows[0];
    if (!row) return;
    const ev = rowToEvent(row);
    if (!matchesPattern(this.pattern, ev.type)) return;
    await this.deliverEvent(ev);
  }

  private async deliverEvent(ev: Event): Promise<void> {
    try {
      await this.handler(ev);
    } catch (err) {
      console.error(
        `subscription ${this.key}: handler error on ${ev.id}:`,
        err,
      );
      return; // No ack → SP will redeliver on next replay.
    }
    await this.bus.pool.query(`SELECT ack_event($1, $2, $3)`, [
      this.bus.config.credential,
      this.key,
      ev.id,
    ]);
  }
}

function rowToEvent(row: Record<string, unknown>): Event {
  const payload = row.payload;
  const payloadStr =
    typeof payload === "string"
      ? payload
      : payload == null
        ? "{}"
        : JSON.stringify(payload);
  return {
    id: String(row.id),
    type: String(row.event_type),
    source: String(row.source_department_id),
    payload: payloadStr,
    parentId: row.parent_event_id == null ? "" : String(row.parent_event_id),
    publishedAt: row.published_at as Date,
  };
}

function parseNotifyPayload(payload: string): { id: string; eventType: string } {
  const idx = payload.indexOf(":");
  if (idx >= 0) {
    return { id: payload.slice(0, idx), eventType: payload.slice(idx + 1) };
  }
  return { id: payload, eventType: "" };
}

