/**
 * Engine Contract Tests
 *
 * Validates that engine-client.ts correctly parses real engine response shapes.
 * Mocks fetch with exact engine JSON (from engine-contracts.ts fixtures).
 */

import { FIXTURES } from "../engine-contracts";
import {
  getJobs,
  getConversations,
  getConversationMessages,
  getEngineLogs,
  getHeartbeatConfig,
  updateHeartbeatConfig,
  getEngineStatus,
  getAuthStatus,
  getTerminalTicket,
  getTelegramConfig,
  updateTelegramConfig,
  deleteTelegramConfig,
  getDiscordConfig,
  updateDiscordConfig,
  deleteDiscordConfig,
} from "../engine-client";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function mockOk(body: unknown) {
  return mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function mockCreated(body: unknown) {
  return mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: () => Promise.resolve(body),
  });
}

function mockError(status: number) {
  return mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: "Something went wrong" }),
  });
}

const SUB = "tenant.overnightdesk.com";
const KEY = "test-api-key-32-chars-minimum-ok";

// ---------------------------------------------------------------------------
// Contract: getJobs
// ---------------------------------------------------------------------------

describe("Contract: getJobs", () => {
  it("unwraps EngineJobListEnvelope to bare array", async () => {
    mockOk(FIXTURES.jobList);

    const result = await getJobs(SUB, KEY);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(FIXTURES.jobList.jobs[0]);
    expect(result[1]).toEqual(FIXTURES.jobList.jobs[1]);
  });

  it("returns empty array when engine responds with empty jobs", async () => {
    mockOk({ jobs: [], limit: 20, offset: 0 });

    const result = await getJobs(SUB, KEY);

    expect(result).toEqual([]);
  });

  it("returns empty array on engine error", async () => {
    mockError(500);

    const result = await getJobs(SUB, KEY);

    expect(result).toEqual([]);
  });

  it("returns empty array on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await getJobs(SUB, KEY);

    expect(result).toEqual([]);
  });

  it("preserves snake_case field names from engine", async () => {
    mockOk(FIXTURES.jobList);

    const result = await getJobs(SUB, KEY);
    const job = result[0] as Record<string, unknown>;

    expect(job.created_at).toBeDefined();
    expect(job.started_at).toBeDefined();
    expect(job.conversation_id).toBeDefined();
    // camelCase should NOT exist
    expect(job.createdAt).toBeUndefined();
    expect(job.startedAt).toBeUndefined();
    expect(job.conversationId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Contract: getConversations
// ---------------------------------------------------------------------------

describe("Contract: getConversations", () => {
  it("unwraps EngineConversationListEnvelope to bare array", async () => {
    mockOk(FIXTURES.conversationList);

    const result = await getConversations(SUB, KEY);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(FIXTURES.conversationList.conversations[0]);
  });

  it("returns empty array on engine error", async () => {
    mockError(500);

    const result = await getConversations(SUB, KEY);

    expect(result).toEqual([]);
  });

  it("preserves snake_case field names", async () => {
    mockOk(FIXTURES.conversationList);

    const result = await getConversations(SUB, KEY);
    const conv = result[0] as Record<string, unknown>;

    expect(conv.started_at).toBeDefined();
    expect(conv.last_activity).toBeDefined();
    expect(conv.user_id).toBeDefined();
    expect(conv.thread_id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Contract: getConversationMessages
// ---------------------------------------------------------------------------

describe("Contract: getConversationMessages", () => {
  it("unwraps EngineMessageListEnvelope to bare array", async () => {
    mockOk(FIXTURES.messageList);

    const result = await getConversationMessages(SUB, KEY, "conv-1");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(FIXTURES.messageList.messages[0]);
  });

  it("returns empty array on engine error", async () => {
    mockError(404);

    const result = await getConversationMessages(SUB, KEY, "conv-missing");

    expect(result).toEqual([]);
  });

  it("preserves snake_case field names", async () => {
    mockOk(FIXTURES.messageList);

    const result = await getConversationMessages(SUB, KEY, "conv-1");
    const msg = result[0] as Record<string, unknown>;

    expect(msg.created_at).toBeDefined();
    expect(msg.conversation_id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Contract: getEngineLogs
// ---------------------------------------------------------------------------

describe("Contract: getEngineLogs", () => {
  it("unwraps EngineLogEnvelope to bare string array", async () => {
    mockOk(FIXTURES.logs);

    const result = await getEngineLogs(SUB, KEY);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect(result[0]).toContain("[INFO] Engine started");
  });

  it("returns empty array on engine error", async () => {
    mockError(500);

    const result = await getEngineLogs(SUB, KEY);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Contract: getHeartbeatConfig
// ---------------------------------------------------------------------------

describe("Contract: getHeartbeatConfig", () => {
  it("returns full heartbeat config with snake_case fields", async () => {
    mockOk(FIXTURES.heartbeat);

    const result = await getHeartbeatConfig(SUB, KEY);

    expect(result).not.toBeNull();
    expect(result.enabled).toBe(true);
    expect(result.interval_seconds).toBe(300);
    expect(result.last_run).toBe("2026-03-22T10:00:00Z");
    expect(result.next_run).toBe("2026-03-22T10:05:00Z");
    expect(result.consecutive_failures).toBe(0);
  });

  it("returns null on engine error", async () => {
    mockError(500);

    const result = await getHeartbeatConfig(SUB, KEY);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Contract: updateHeartbeatConfig
// ---------------------------------------------------------------------------

describe("Contract: updateHeartbeatConfig", () => {
  it("sends payload and returns updated config", async () => {
    mockOk({ status: "updated" });

    const result = await updateHeartbeatConfig(SUB, KEY, {
      enabled: true,
      interval_seconds: 600,
    });

    expect(result).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/heartbeat"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ enabled: true, interval_seconds: 600 }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Contract: getEngineStatus
// ---------------------------------------------------------------------------

describe("Contract: getEngineStatus", () => {
  it("returns full status with nested queue and heartbeat", async () => {
    mockOk(FIXTURES.status);

    const result = await getEngineStatus(SUB, KEY);

    expect(result).not.toBeNull();
    expect(result.version).toBe("0.1.0");
    expect(result.queue.queue_depth).toBe(3);
    expect(result.queue.running).toBe(true);
    expect(result.heartbeat?.last_run).toBe("2026-03-22T10:00:00Z");
    expect(result.claude_auth).toBe("connected");
    expect(result.database_size_bytes).toBe(524288);
  });

  it("returns null on engine error", async () => {
    mockError(500);

    const result = await getEngineStatus(SUB, KEY);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Contract: getAuthStatus
// ---------------------------------------------------------------------------

describe("Contract: getAuthStatus", () => {
  it("returns auth status string", async () => {
    mockOk(FIXTURES.authStatus);

    const result = await getAuthStatus(SUB, KEY);

    expect(result).toBe("authenticated");
  });

  it("returns 'unknown' on engine error", async () => {
    mockError(500);

    const result = await getAuthStatus(SUB, KEY);

    expect(result).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Contract: getTerminalTicket
// ---------------------------------------------------------------------------

describe("Contract: getTerminalTicket", () => {
  it("returns ticket string from envelope", async () => {
    mockOk(FIXTURES.terminalTicket);

    const result = await getTerminalTicket(SUB, KEY);

    expect(typeof result).toBe("string");
    expect(result).toBe(FIXTURES.terminalTicket.ticket);
  });

  it("returns null on engine error", async () => {
    mockError(500);

    const result = await getTerminalTicket(SUB, KEY);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Contract: Telegram Config
// ---------------------------------------------------------------------------

describe("Contract: getTelegramConfig", () => {
  it("returns full telegram config with snake_case fields", async () => {
    mockOk(FIXTURES.telegramConfig);

    const result = await getTelegramConfig(SUB, KEY);

    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(true);
    expect(result!.allowed_users).toEqual(["12345", "67890"]);
    expect(result!.webhook_url).toBeDefined();
    expect(result!.status_message).toBeDefined();
  });
});

describe("Contract: updateTelegramConfig", () => {
  it("sends config and returns result", async () => {
    mockOk({ message: "updated", enabled: true, allowed_users: ["12345"], status: "connected" });

    const result = await updateTelegramConfig(SUB, KEY, {
      bot_token: "123:ABC",
      allowed_users: ["12345"],
      enabled: true,
    });

    expect(result).not.toBeNull();
  });
});

describe("Contract: deleteTelegramConfig", () => {
  it("returns true on successful delete", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await deleteTelegramConfig(SUB, KEY);

    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contract: Discord Config
// ---------------------------------------------------------------------------

describe("Contract: getDiscordConfig", () => {
  it("returns full discord config with snake_case fields", async () => {
    mockOk(FIXTURES.discordConfig);

    const result = await getDiscordConfig(SUB, KEY);

    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(true);
    expect(result!.allowed_users).toEqual(["123456789012345678"]);
  });
});

describe("Contract: updateDiscordConfig", () => {
  it("sends config and returns result", async () => {
    mockOk({ message: "updated", enabled: true, allowed_users: ["123"], status: "connected" });

    const result = await updateDiscordConfig(SUB, KEY, {
      bot_token: "MTIz.abc.def",
      allowed_users: ["123"],
      enabled: true,
    });

    expect(result).not.toBeNull();
  });
});

describe("Contract: deleteDiscordConfig", () => {
  it("returns true on successful delete", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await deleteDiscordConfig(SUB, KEY);

    expect(result).toBe(true);
  });
});
