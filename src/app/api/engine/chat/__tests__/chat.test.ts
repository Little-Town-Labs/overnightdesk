import { NextRequest } from "next/server";

// --- Mocks ---

const mockGetSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (a: unknown) => mockGetSession(a) } },
}));

const mockGetInstanceForUser = jest.fn();
jest.mock("@/lib/instance", () => ({
  getInstanceForUser: (a: unknown) => mockGetInstanceForUser(a),
  isHermesTenant: (inst: { containerId?: string | null } | null) =>
    inst?.containerId?.startsWith("hermes-") ?? false,
}));

const mockStreamText = jest.fn();
jest.mock("ai", () => ({
  streamText: (...a: unknown[]) => mockStreamText(...a),
}));

jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: jest.fn(() => jest.fn()),
}));
// Retrieve mock after jest.mock hoisting
let mockCreateOpenAI: jest.Mock;

const SESSION = { user: { id: "user-1" } };
const RUNNING_HERMES = {
  id: "inst-1",
  tenantId: "alice",
  subdomain: "alice.overnightdesk.com",
  status: "running",
  containerId: "hermes-alice",
  engineApiKey: "api-key-abc123",
};

function makeReq(body: object = { messages: [{ role: "user", content: "hello" }] }) {
  return new NextRequest("http://localhost/api/engine/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/engine/chat", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION);
    mockGetInstanceForUser.mockResolvedValue(RUNNING_HERMES);
    mockStreamText.mockReturnValue({
      toTextStreamResponse: () => new Response("streamed", { status: 200 }),
    });
    // Resolve mock after module loading
    const { createOpenAI } = await import("@ai-sdk/openai");
    mockCreateOpenAI = createOpenAI as jest.Mock;
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/engine/chat/route");
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no hermes instance", async () => {
    mockGetInstanceForUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/engine/chat/route");
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-hermes tenant", async () => {
    mockGetInstanceForUser.mockResolvedValue({
      ...RUNNING_HERMES,
      containerId: "overnightdesk-tenant-0",
    });
    const { POST } = await import("@/app/api/engine/chat/route");
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
  });

  it("returns 503 when instance is not running", async () => {
    mockGetInstanceForUser.mockResolvedValue({ ...RUNNING_HERMES, status: "queued" });
    const { POST } = await import("@/app/api/engine/chat/route");
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
  });

  it("returns 400 when engineApiKey is missing", async () => {
    mockGetInstanceForUser.mockResolvedValue({ ...RUNNING_HERMES, engineApiKey: null });
    const { POST } = await import("@/app/api/engine/chat/route");
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
  });

  it("calls createOpenAI with correct baseURL and apiKey", async () => {
    const { POST } = await import("@/app/api/engine/chat/route");
    await POST(makeReq());

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://alice.overnightdesk.com/v1",
        apiKey: "api-key-abc123",
      })
    );
  });

  it("calls streamText with messages from request body", async () => {
    const messages = [{ role: "user", content: "test message" }];
    const { POST } = await import("@/app/api/engine/chat/route");
    await POST(makeReq({ messages }));

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ messages })
    );
  });

  it("returns streaming response on success", async () => {
    const { POST } = await import("@/app/api/engine/chat/route");
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });

  it("engineApiKey is NEVER included in the response", async () => {
    const { POST } = await import("@/app/api/engine/chat/route");
    const res = await POST(makeReq());
    const body = await res.text();
    expect(body).not.toContain("api-key-abc123");
    expect(body).not.toContain("engineApiKey");
  });
});
