import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Bus } from "../src/bus.js";
import { ErrBudgetBlocked } from "../src/errors.js";
import { Governor, type ClaudeClient, type ClaudeRequest } from "../src/governor.js";
import { TestDB } from "./testdb.js";

let tdb: TestDB | null;
let opsCred: string;

beforeAll(async () => {
  tdb = await TestDB.create();
  if (!tdb) return;
  opsCred = await tdb.seedDepartment("ops", "ops");
  await tdb.seedBudget("ops", 10_00); // $10 budget
  await tdb.seedConstitution([{ id: "r1", pattern: "*", approvalMode: "none" }]);
});

afterAll(async () => {
  await tdb?.close();
});

class FakeClaude implements ClaudeClient {
  input: number;
  output: number;
  calls = 0;

  constructor(input = 100, output = 50) {
    this.input = input;
    this.output = output;
  }

  async createMessage(_req: ClaudeRequest) {
    this.calls++;
    return { text: "ok", inputTokens: this.input, outputTokens: this.output };
  }
}

describe("Governor.checkBudget", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("returns ok for fresh budget", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const gov = new Governor(bus);
    const st = await gov.checkBudget();
    expect(st.status).toBe("ok");
    expect(st.limitCents).toBe(1000);
    await bus.close();
  });
});

describe("Governor.call", () => {
  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("records usage after successful call", async () => {
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "ops",
      credential: opsCred,
    });
    const gov = new Governor(bus);
    const claude = new FakeClaude(1000, 500);
    const before = await gov.checkBudget();
    const resp = await gov.call(claude, {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(resp.text).toBe("ok");
    expect(claude.calls).toBe(1);
    const after = await gov.checkBudget();
    expect(after.spentCents).toBeGreaterThan(before.spentCents);
    await bus.close();
  });

  it.skipIf(!process.env.PG_TEST_ADMIN_URL)("blocks when budget exhausted and skips Claude", async () => {
    const tinyCred = await tdb!.seedDepartment("tiny", "tiny");
    await tdb!.seedBudget("tiny", 1);
    const bus = await Bus.connect({
      postgresUrl: tdb!.url,
      department: "tiny",
      credential: tinyCred,
    });
    const gov = new Governor(bus);
    const claude = new FakeClaude(10_000_000, 10_000_000);
    await gov.call(claude, {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(
      gov.call(claude, {
        model: "claude-haiku-4-5",
        messages: [{ role: "user", content: "again" }],
      }),
    ).rejects.toBeInstanceOf(ErrBudgetBlocked);
    expect(claude.calls).toBe(1);
    await bus.close();
  });
});
