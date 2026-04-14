import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Bus } from "../src/bus.js";
import {
  ErrCausalityLoop,
  ErrConstitutionRejected,
  ErrNamespaceViolation,
  ErrUnauthenticated,
} from "../src/errors.js";
import type { Event } from "../src/types.js";
import { TestDB } from "./testdb.js";

let tdb: TestDB | null;
let opsCred: string;
let presCred: string;

beforeAll(async () => {
  tdb = await TestDB.create();
  if (!tdb) return;
  opsCred = await tdb.seedDepartment("ops", "ops");
  presCred = await tdb.seedDepartment("president", "president");
  await tdb.seedBudget("ops", 100_00);
  await tdb.seedBudget("president", 100_00);
  await tdb.seedConstitution([
    { id: "r1", pattern: "ops.*", approvalMode: "none" },
    { id: "r2", pattern: "president.*", approvalMode: "none" },
  ]);
});

afterAll(async () => {
  await tdb?.close();
});


describe("Bus.connect", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("succeeds with valid credential", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    expect(bus.isClosed()).toBe(false);
    await bus.close();
  });

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("rejects invalid credential", async () => {
    await expect(
      Bus.connect({
        postgresUrl: tdb!.url,
        department: "ops",
        credential: "not-a-real-credential",
      }),
    ).rejects.toBeInstanceOf(ErrUnauthenticated);
  });
});

describe("Bus.publish", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("happy path returns event id", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const id = await bus.publish(
      "ops.task.completed",
      JSON.stringify({ task: "example" }),
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await bus.close();
  });

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("rejects namespace violation", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    await expect(
      bus.publish("fin.payment.out", JSON.stringify({ amt: 1 })),
    ).rejects.toBeInstanceOf(ErrNamespaceViolation);
    await bus.close();
  });

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("constitution rejection when rule requires approval", async () => {
    // Seed a locked-down department with a rule requiring approval.
    const lockedCred = await tdb!.seedDepartment("fin", "fin");
    await tdb!.seedBudget("fin", 100_00);
    await tdb!.pool.query(
      `INSERT INTO constitution_rules
         (constitution_version_id, rule_id, event_type_pattern, requires_approval_mode, approval_category)
       SELECT version_id, 'r-fin-approval', 'fin.payment.*', 'per_action', NULL
         FROM constitution_versions WHERE is_active`,
    );

    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "fin",
      credential: lockedCred,
    });
    await expect(
      bus.publish("fin.payment.outbound", JSON.stringify({ amt: 100 })),
    ).rejects.toBeInstanceOf(ErrConstitutionRejected);
    await bus.close();

    // Clean up the rule so other tests aren't affected.
    await tdb!.pool.query(
      `DELETE FROM constitution_rules WHERE rule_id = 'r-fin-approval'`,
    );
  });

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("causality loop rejected at depth limit", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    let parent: string | undefined;
    // Build a chain of 10 — SP rejects when a new event's parent already has
    // 10 ancestors in front of it.
    for (let i = 1; i <= 9; i++) {
      parent = await bus.publish(
        `ops.chain.${i}`,
        JSON.stringify({ step: i }),
        parent ? { parentEventId: parent } : {},
      );
    }
    // 10th link is still legal.
    parent = await bus.publish("ops.chain.10", "{}", {
      parentEventId: parent!,
    });
    // 11th should be rejected.
    await expect(
      bus.publish("ops.chain.11", "{}", { parentEventId: parent! }),
    ).rejects.toBeInstanceOf(ErrCausalityLoop);
    await bus.close();
  });
});

describe("Bus.subscribe", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("delivers events published after subscribe", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });

    const received: Event[] = [];
    const sub = await bus.subscribe(
      "ops.sub1",
      "ops.signal.*",
      async (ev) => {
        received.push(ev);
      },
    );

    await bus.publish("ops.signal.fire", JSON.stringify({ n: 1 }));
    await bus.publish("ops.signal.fire", JSON.stringify({ n: 2 }));
    // Events of different pattern must not be delivered.
    await bus.publish("ops.other.ping", JSON.stringify({ n: 3 }));

    // Wait for async delivery.
    await waitFor(() => received.length >= 2, 3000);

    expect(received.length).toBe(2);
    expect(received.every((e) => e.type === "ops.signal.fire")).toBe(true);

    await sub.close();
    await bus.close();
  });

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("replays missed events on reconnect", async () => {
    const bus1 = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "president",
      credential: presCred,
    });
    // Register first — creates the subscription cursor.
    const sub1 = await bus1.subscribe(
      "pres.sub1",
      "president.event.*",
      async () => {},
    );
    await sub1.close();

    // Publish while offline.
    await bus1.publish("president.event.one", JSON.stringify({ n: 1 }));
    await bus1.publish("president.event.two", JSON.stringify({ n: 2 }));
    await bus1.close();

    // Reconnect and re-subscribe; missed events should replay.
    const bus2 = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "president",
      credential: presCred,
    });
    const received: Event[] = [];
    const sub2 = await bus2.subscribe(
      "pres.sub1",
      "president.event.*",
      async (ev) => {
        received.push(ev);
      },
    );
    await waitFor(() => received.length >= 2, 3000);
    expect(received.length).toBeGreaterThanOrEqual(2);
    await sub2.close();
    await bus2.close();
  });
});

async function waitFor(
  pred: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timeout");
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}
