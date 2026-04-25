/**
 * Tests for wizard API routes.
 * These cover the write-step and complete endpoints.
 */

import { NextRequest } from "next/server";

// --- Mocks ---

const mockGetSession = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: { api: { getSession: (...a: unknown[]) => mockGetSession(...a) } } }));

const mockGetInstanceForUser = jest.fn();
jest.mock("@/lib/instance", () => ({
  getInstanceForUser: (...a: unknown[]) => mockGetInstanceForUser(...a),
  isHermesTenant: (inst: { containerId?: string | null } | null) =>
    inst?.containerId?.startsWith("hermes-") ?? false,
  updateInstanceStatus: jest.fn().mockResolvedValue(undefined),
}));

const mockWriteSecrets = jest.fn().mockResolvedValue({ success: true });
const mockProvision = jest.fn().mockResolvedValue({ success: true });
jest.mock("@/lib/provisioner", () => ({
  provisionerClient: {
    provision: (...a: unknown[]) => mockProvision(...a),
    writeSecrets: (...a: unknown[]) => mockWriteSecrets(...a),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockSelectFromWhere = jest.fn();
const mockUpdateSetWhere = jest.fn().mockResolvedValue(undefined);
const mockInsertValues = jest.fn().mockResolvedValue(undefined);
jest.mock("@/db", () => ({
  db: {
    select: jest.fn(() => ({ from: jest.fn(() => ({ where: mockSelectFromWhere })) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: mockUpdateSetWhere })) })),
    insert: jest.fn(() => ({ values: mockInsertValues })),
  },
}));
jest.mock("@/db/schema", () => ({
  instance: { userId: "userId", tenantId: "tenantId", status: "status", id: "id" },
  fleetEvent: {},
}));

const SESSION = { user: { id: "user-1", email: "gary@test.com" } };
const INSTANCE = {
  id: "inst-1",
  tenantId: "alice",
  subdomain: "alice.overnightdesk.com",
  status: "queued",
  containerId: "hermes-alice",
  engineApiKey: "key123",
  wizardState: null,
};

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/wizard/write-step", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- write-step route ---

describe("POST /api/wizard/write-step", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION);
    mockGetInstanceForUser.mockResolvedValue(INSTANCE);
    mockSelectFromWhere.mockResolvedValue([INSTANCE]);
    // OpenRouter validation succeeds
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it("returns 401 if not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/wizard/write-step/route");
    const res = await POST(makeReq({ step: 1, secrets: { OPENROUTER_API_KEY: "sk-or-abc" } }));
    expect(res.status).toBe(401);
  });

  it("returns 400 if no instance", async () => {
    mockGetInstanceForUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/wizard/write-step/route");
    const res = await POST(makeReq({ step: 1, secrets: { OPENROUTER_API_KEY: "sk-or-abc" } }));
    expect(res.status).toBe(400);
  });

  it("step 1 validates OpenRouter key before writing", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 }); // invalid key
    const { POST } = await import("@/app/api/wizard/write-step/route");
    const res = await POST(makeReq({ step: 1, secrets: { OPENROUTER_API_KEY: "bad-key" } }));
    expect(res.status).toBe(422);
    expect(mockWriteSecrets).not.toHaveBeenCalled();
  });

  it("step 1 writes secrets and updates wizardState on valid key", async () => {
    const { POST } = await import("@/app/api/wizard/write-step/route");
    const res = await POST(makeReq({ step: 1, secrets: { OPENROUTER_API_KEY: "sk-or-valid" } }));
    expect(res.status).toBe(200);
    expect(mockWriteSecrets).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "alice" })
    );
  });

  it("step 2 writes Telegram secrets without validation", async () => {
    const { POST } = await import("@/app/api/wizard/write-step/route");
    const res = await POST(makeReq({
      step: 2,
      secrets: { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_ALLOWED_USERS: "99999" },
    }));
    expect(res.status).toBe(200);
    expect(mockWriteSecrets).toHaveBeenCalled();
  });

  it("step 2 returns 400 if Telegram token present but no user IDs", async () => {
    const { POST } = await import("@/app/api/wizard/write-step/route");
    const res = await POST(makeReq({
      step: 2,
      secrets: { TELEGRAM_BOT_TOKEN: "123:abc" },
    }));
    expect(res.status).toBe(400);
  });

  it("step 2 skip (empty secrets) returns 200 without writing", async () => {
    const { POST } = await import("@/app/api/wizard/write-step/route");
    const res = await POST(makeReq({ step: 2, secrets: {} }));
    expect(res.status).toBe(200);
    expect(mockWriteSecrets).not.toHaveBeenCalled();
  });
});

// --- complete route ---

describe("POST /api/wizard/complete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION);
    mockGetInstanceForUser.mockResolvedValue(INSTANCE);
    mockSelectFromWhere.mockResolvedValue([INSTANCE]);
    mockProvision.mockResolvedValue({ success: true });
  });

  it("returns 401 if not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/wizard/complete/route");
    const res = await POST(new NextRequest("http://localhost/api/wizard/complete", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }));
    expect(res.status).toBe(401);
  });

  it("triggers provisioner and sets status to awaiting_provisioning", async () => {
    const { POST } = await import("@/app/api/wizard/complete/route");
    const res = await POST(new NextRequest("http://localhost/api/wizard/complete", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }));

    // Allow async ops to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(res.status).toBe(200);
    expect(mockProvision).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "alice" })
    );
  });

  it("returns 400 if instance already running", async () => {
    mockGetInstanceForUser.mockResolvedValue({ ...INSTANCE, status: "running" });
    const { POST } = await import("@/app/api/wizard/complete/route");
    const res = await POST(new NextRequest("http://localhost/api/wizard/complete", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }));
    expect(res.status).toBe(400);
    expect(mockProvision).not.toHaveBeenCalled();
  });
});
