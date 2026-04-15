import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Bus, Governor, Metrics } from "@tenet-0/bus";
import { ContractDB, runGoCLI } from "./harness.js";

let db: ContractDB | null;

// Credentials keyed by department — populated in beforeAll.
const creds: Record<string, string> = {};

beforeAll(async () => {
  db = await ContractDB.create();
  if (!db) return;

  await db.seedConstitution();
  creds.ops = await db.seedDepartment("ops", "ops");
  creds.cro = await db.seedDepartment("cro", "cro");
  creds.president = await db.seedDepartment("president", "president");
  creds.fin = await db.seedDepartment("fin", "fin");
  await db.seedBudget("ops", 100_00);
  await db.seedBudget("cro", 100_00);
  await db.seedBudget("president", 100_00);
  await db.seedBudget("fin", 100_00);
});

afterAll(async () => {
  await db?.close();
});



describe("Go→TS publish/subscribe parity", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("Go publishes ops.job.completed, TS handler receives identical payload", async () => {
    const tsBus = await Bus.connect({
      postgresUrl: db!.url,
      department: "ops",
      credential: creds.ops,
    });

    const received: { id: string; type: string; payload: string; source: string }[] = [];
    const sub = await tsBus.subscribe("ops.contract.sub", "ops.job.*", (ev) => {
      received.push({ id: ev.id, type: ev.type, payload: ev.payload, source: ev.source });
    });

    const payload = JSON.stringify({ job_id: "j-42", duration_ms: 1234 });
    const publishResult = (await runGoCLI({
      subcommand: "publish",
      cliArgs: ["ops.job.completed", payload],
      pgUrl: db!.url,
      department: "ops",
      credential: creds.ops,
    })) as { event_id: string };
    expect(publishResult.event_id).toMatch(/^[0-9a-f-]{36}$/);

    // Wait for NOTIFY + in-process delivery.
    await waitFor(() => received.length > 0, 5000);
    expect(received.length).toBe(1);
    // Go-published event_id must equal the id TS saw over the wire.
    expect(received[0].id).toBe(publishResult.event_id);
    expect(received[0].type).toBe("ops.job.completed");
    expect(received[0].source).toBe("ops");
    expect(JSON.parse(received[0].payload)).toEqual({ job_id: "j-42", duration_ms: 1234 });

    await sub.close();
    await tsBus.close();
  });
});

describe("TS→Go publish/subscribe parity", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("TS publishes cro.content.published, Go subscriber receives identical payload", async () => {
    const tsBus = await Bus.connect({
      postgresUrl: db!.url,
      department: "cro",
      credential: creds.cro,
    });

    // Kick off Go subscriber — it emits "contract-cli: subscribe ready" on
    // stderr after LISTEN is registered, so we can publish without racing.
    let readyResolve!: () => void;
    const ready = new Promise<void>((r) => (readyResolve = r));
    const goSubPromise = runGoCLI({
      subcommand: "subscribe",
      cliArgs: ["--count", "1", "--timeout", "5s", "cro.contract.sub", "cro.content.*"],
      pgUrl: db!.url,
      department: "cro",
      credential: creds.cro,
      timeoutMs: 10_000,
      onReady: () => readyResolve(),
    });
    await ready;

    const payload = JSON.stringify({ title: "New drop", slug: "new-drop-2026" });
    const tsEventId = await tsBus.publish("cro.content.published", payload);

    const received = (await goSubPromise) as {
      events: Array<{ id: string; type: string; source: string; payload: unknown }>;
    };
    expect(received.events.length).toBe(1);
    expect(received.events[0].id).toBe(tsEventId);
    expect(received.events[0].type).toBe("cro.content.published");
    expect(received.events[0].source).toBe("cro");
    expect(received.events[0].payload).toEqual({ title: "New drop", slug: "new-drop-2026" });

    await tsBus.close();
  });
});

describe("Go grants blanket → TS publishes within scope", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("Go-side President grants, TS-side CRO publishes covered event", async () => {
    // Add a constitution rule requiring blanket approval for cro.content.auto
    await db!.pool.query(
      `INSERT INTO constitution_rules
         (constitution_version_id, rule_id, event_type_pattern, requires_approval_mode, approval_category)
       SELECT version_id, 'cro-auto-blanket', 'cro.content.auto', 'blanket_category', 'routine.marketing.content'
         FROM constitution_versions WHERE is_active`,
    );

    const grantResult = (await runGoCLI({
      subcommand: "grant-blanket",
      cliArgs: ["routine.marketing.content"],
      pgUrl: db!.url,
      department: "president",
      credential: creds.president,
    })) as { event_id: string };
    expect(grantResult.event_id).toMatch(/^[0-9a-f-]{36}$/);

    // Now TS-side CRO publishes a covered event — should succeed.
    const tsBus = await Bus.connect({
      postgresUrl: db!.url,
      department: "cro",
      credential: creds.cro,
    });
    const eventId = await tsBus.publish(
      "cro.content.auto",
      JSON.stringify({ title: "auto" }),
    );
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
    await tsBus.close();

    // Clean up the rule so other tests aren't affected.
    await db!.pool.query(`DELETE FROM constitution_rules WHERE rule_id = 'cro-auto-blanket'`);
  });
});

describe("Metrics snapshot parity", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("Go and TS Metrics.Snapshot return same shape/values against same state", async () => {
    // Publish a handful of events so metrics have content.
    const tsBus = await Bus.connect({
      postgresUrl: db!.url,
      department: "ops",
      credential: creds.ops,
    });
    for (let i = 0; i < 3; i++) {
      await tsBus.publish(`ops.metric.parity.${i}`, "{}");
    }

    // Fetch Go and TS snapshots as close together as possible to minimize
    // drift between them on per-minute counters.
    const tsMetrics = new Metrics(tsBus);
    const [tsSnap, goSnap] = await Promise.all([
      tsMetrics.snapshot(),
      runGoCLI({
        subcommand: "metrics-snapshot",
        cliArgs: [],
        pgUrl: db!.url,
        department: "ops",
        credential: creds.ops,
      }) as Promise<{
        events_per_minute: Array<{ department: string; events_per_minute: number }>;
        budget_utilization: Array<{ department: string; spent_cents: number; limit_cents: number; status: string }>;
        audit_log_write_rate_per_minute: number;
      }>,
    ]);

    // events_per_minute: sort both, compare each department's count.
    const tsEpm = tsSnap.eventsPerMinute
      .slice()
      .sort((a, b) => a.department.localeCompare(b.department));
    const goEpm = goSnap.events_per_minute
      .slice()
      .sort((a, b) => a.department.localeCompare(b.department));
    expect(goEpm.length).toBe(tsEpm.length);
    for (let i = 0; i < tsEpm.length; i++) {
      expect(goEpm[i].department).toBe(tsEpm[i].department);
      // Allow ±1 drift for events that crossed the minute boundary between
      // the two snapshot fetches — this is a backing-view time window, not
      // library difference.
      expect(Math.abs(goEpm[i].events_per_minute - tsEpm[i].eventsPerMinute)).toBeLessThanOrEqual(1);
    }

    // budget_utilization: compare by department, assert same limits + status.
    const tsBudget = new Map(
      tsSnap.budgetUtilization.map((r) => [r.department, r] as const),
    );
    const goBudget = new Map(
      goSnap.budget_utilization.map((r) => [r.department, r] as const),
    );
    expect(goBudget.size).toBe(tsBudget.size);
    for (const [dept, goRow] of goBudget) {
      const tsRow = tsBudget.get(dept);
      expect(tsRow, `missing dept ${dept} in TS snapshot`).toBeDefined();
      expect(goRow.limit_cents).toBe(tsRow!.limitCents);
      expect(goRow.status).toBe(tsRow!.status);
      expect(Math.abs(goRow.spent_cents - tsRow!.spentCents)).toBeLessThanOrEqual(0);
    }

    // Write rate is a per-minute counter — allow ±1 drift.
    expect(
      Math.abs(goSnap.audit_log_write_rate_per_minute - tsSnap.auditLogWriteRatePerMinute),
    ).toBeLessThanOrEqual(1);

    // Cross-check budget via Governor.
    const tsGov = new Governor(tsBus);
    const tsGovBudget = await tsGov.checkBudget();
    const goGovBudget = (await runGoCLI({
      subcommand: "check-budget",
      cliArgs: [],
      pgUrl: db!.url,
      department: "ops",
      credential: creds.ops,
    })) as { status: string; limit_cents: number; spent_cents: number; remaining_cents: number };
    expect(goGovBudget.status).toBe(tsGovBudget.status);
    expect(goGovBudget.limit_cents).toBe(tsGovBudget.limitCents);
    expect(goGovBudget.spent_cents).toBe(tsGovBudget.spentCents);
    expect(goGovBudget.remaining_cents).toBe(tsGovBudget.remainingCents);

    await tsBus.close();
  });
});

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 50));
  }
}
