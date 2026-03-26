/**
 * Engine Proxy API Routes — Tests (Task 1.3)
 *
 * Tests for all engine proxy routes. These routes share a common
 * resolveInstance() helper that authenticates the user and looks up
 * their running instance. Each route then proxies to the Go engine's
 * REST API via engine-client functions.
 *
 * Routes tested:
 *   GET    /api/engine/status
 *   GET    /api/engine/heartbeat
 *   PUT    /api/engine/heartbeat
 *   GET    /api/engine/jobs
 *   POST   /api/engine/jobs
 *   GET    /api/engine/jobs/[id]
 *   DELETE /api/engine/jobs/[id]
 *   GET    /api/engine/conversations
 *   GET    /api/engine/conversations/[id]/messages
 *   GET    /api/engine/logs
 *   POST   /api/engine/restart
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock next/headers (used by auth.api.getSession)
const mockHeaders = jest.fn().mockResolvedValue(new Headers());
jest.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

// Mock auth — auth.api.getSession()
const mockGetSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

// Mock instance lookup
const mockGetInstanceForUser = jest.fn();
jest.mock("@/lib/instance", () => ({
  getInstanceForUser: (...args: unknown[]) => mockGetInstanceForUser(...args),
}));

// Mock engine-client functions (these will be implemented in Task 1.2)
const mockGetEngineStatus = jest.fn();
const mockGetHeartbeatConfig = jest.fn();
const mockUpdateHeartbeatConfig = jest.fn();
const mockGetJobs = jest.fn();
const mockCreateJob = jest.fn();
const mockGetJob = jest.fn();
const mockDeleteJob = jest.fn();
const mockGetConversations = jest.fn();
const mockGetConversationMessages = jest.fn();
const mockGetEngineLogs = jest.fn();

jest.mock("@/lib/engine-client", () => ({
  getEngineStatus: (...args: unknown[]) => mockGetEngineStatus(...args),
  getHeartbeatConfig: (...args: unknown[]) => mockGetHeartbeatConfig(...args),
  updateHeartbeatConfig: (...args: unknown[]) =>
    mockUpdateHeartbeatConfig(...args),
  getJobs: (...args: unknown[]) => mockGetJobs(...args),
  createJob: (...args: unknown[]) => mockCreateJob(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  deleteJob: (...args: unknown[]) => mockDeleteJob(...args),
  getConversations: (...args: unknown[]) => mockGetConversations(...args),
  getConversationMessages: (...args: unknown[]) =>
    mockGetConversationMessages(...args),
  getEngineLogs: (...args: unknown[]) => mockGetEngineLogs(...args),
}));

// Mock provisioner client (for restart route)
const mockProvisionerRestart = jest.fn();
jest.mock("@/lib/provisioner", () => ({
  provisionerClient: {
    restart: (...args: unknown[]) => mockProvisionerRestart(...args),
  },
}));

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const mockSession = {
  user: { id: "user_123", email: "test@example.com", name: "Test User" },
  session: { id: "sess_1" },
};

const mockInstance = {
  id: "inst_1",
  userId: "user_123",
  tenantId: "a1b2c3d4e5f6",
  subdomain: "tenant.overnightdesk.com",
  engineApiKey: "engine-api-key-123",
  status: "running",
  plan: "starter",
};

const mockInstanceNotRunning = {
  ...mockInstance,
  status: "stopped",
};

const mockInstanceNoSubdomain = {
  ...mockInstance,
  subdomain: null,
  engineApiKey: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupAuthenticated(
  instanceOverride?: Partial<typeof mockInstance> | null
) {
  mockGetSession.mockResolvedValue(mockSession);
  mockGetInstanceForUser.mockResolvedValue(
    instanceOverride === null ? null : { ...mockInstance, ...instanceOverride }
  );
}

function setupUnauthenticated() {
  mockGetSession.mockResolvedValue(null);
}

/**
 * Parse JSON from a NextResponse (handles both .json() and Response).
 */
async function parseResponse(response: Response) {
  return response.json();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Engine Proxy API Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // resolveInstance() shared helper
  // =========================================================================
  describe("resolveInstance() shared behavior", () => {
    // We test resolveInstance indirectly through the status route since all
    // routes use it. The behavior is: session check -> instance lookup ->
    // validate running + subdomain + engineApiKey.

    it("returns 401 when no session exists", async () => {
      setupUnauthenticated();

      const { GET } = await import(
        "@/app/api/engine/status/route"
      );
      const request = new NextRequest("http://localhost/api/engine/status");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it("returns 404 when no instance found for user", async () => {
      setupAuthenticated(null);

      const { GET } = await import(
        "@/app/api/engine/status/route"
      );
      const request = new NextRequest("http://localhost/api/engine/status");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it("returns 404 when instance is not running", async () => {
      setupAuthenticated({ status: "stopped" });

      const { GET } = await import(
        "@/app/api/engine/status/route"
      );
      const request = new NextRequest("http://localhost/api/engine/status");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/not running|unavailable/i);
    });

    it("returns 404 when instance has no subdomain or engineApiKey", async () => {
      setupAuthenticated({ subdomain: undefined, engineApiKey: undefined });

      const { GET } = await import(
        "@/app/api/engine/status/route"
      );
      const request = new NextRequest("http://localhost/api/engine/status");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it("passes correct userId to getInstanceForUser", async () => {
      setupAuthenticated();
      mockGetEngineStatus.mockResolvedValue({ status: "healthy" });

      const { GET } = await import(
        "@/app/api/engine/status/route"
      );
      const request = new NextRequest("http://localhost/api/engine/status");
      await GET(request);

      expect(mockGetInstanceForUser).toHaveBeenCalledWith("user_123");
    });
  });

  // =========================================================================
  // GET /api/engine/status
  // =========================================================================
  describe("GET /api/engine/status", () => {
    it("returns 200 with engine status data on success", async () => {
      setupAuthenticated();
      const statusData = {
        status: "healthy",
        uptime: 3600,
        version: "1.0.0",
        queueDepth: 2,
      };
      mockGetEngineStatus.mockResolvedValue(statusData);

      const { GET } = await import(
        "@/app/api/engine/status/route"
      );
      const request = new NextRequest("http://localhost/api/engine/status");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(statusData);
      expect(mockGetEngineStatus).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123"
      );
    });

    it("returns 502 when engine is unreachable", async () => {
      setupAuthenticated();
      mockGetEngineStatus.mockResolvedValue(null);

      const { GET } = await import(
        "@/app/api/engine/status/route"
      );
      const request = new NextRequest("http://localhost/api/engine/status");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(502);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/engine|unreachable|unavailable/i);
    });
  });

  // =========================================================================
  // GET /api/engine/heartbeat
  // =========================================================================
  describe("GET /api/engine/heartbeat", () => {
    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { GET } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 200 with heartbeat config on success", async () => {
      setupAuthenticated();
      // Engine returns snake_case
      const engineResponse = {
        enabled: true,
        interval_seconds: 300,
        prompt: "Check inbox and summarize new emails",
        last_run: "2026-03-22T10:00:00Z",
        next_run: "2026-03-22T10:05:00Z",
        consecutive_failures: 0,
      };
      mockGetHeartbeatConfig.mockResolvedValue(engineResponse);

      const { GET } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Proxy transforms to camelCase
      expect(data.data).toEqual({
        enabled: true,
        intervalSeconds: 300,
        prompt: "Check inbox and summarize new emails",
        lastRun: "2026-03-22T10:00:00Z",
        nextRun: "2026-03-22T10:05:00Z",
        consecutiveFailures: 0,
      });
      expect(mockGetHeartbeatConfig).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123"
      );
    });

    it("returns 502 when engine is unreachable", async () => {
      setupAuthenticated();
      mockGetHeartbeatConfig.mockResolvedValue(null);

      const { GET } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat");
      const response = await GET(request);

      expect(response.status).toBe(502);
    });
  });

  // =========================================================================
  // PUT /api/engine/heartbeat
  // =========================================================================
  describe("PUT /api/engine/heartbeat", () => {
    const validHeartbeatBody = {
      enabled: true,
      intervalSeconds: 300,
      prompt: "Check inbox",
    };

    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { PUT } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat", {
        method: "PUT",
        body: JSON.stringify(validHeartbeatBody),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);

      expect(response.status).toBe(401);
    });

    it("returns 200 on successful update", async () => {
      setupAuthenticated();
      const updatedConfig = { ...validHeartbeatBody, lastRun: null, nextRun: "2026-03-22T10:05:00Z" };
      mockUpdateHeartbeatConfig.mockResolvedValue(updatedConfig);

      const { PUT } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat", {
        method: "PUT",
        body: JSON.stringify(validHeartbeatBody),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockUpdateHeartbeatConfig).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123",
        { enabled: true, interval_seconds: 300, prompt: "Check inbox" }
      );
    });

    it("returns 400 when enabled is not a boolean", async () => {
      setupAuthenticated();

      const { PUT } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat", {
        method: "PUT",
        body: JSON.stringify({ ...validHeartbeatBody, enabled: "yes" }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it("returns 400 when intervalSeconds is below minimum (60)", async () => {
      setupAuthenticated();

      const { PUT } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat", {
        method: "PUT",
        body: JSON.stringify({ ...validHeartbeatBody, intervalSeconds: 30 }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it("returns 400 when intervalSeconds exceeds maximum (86400)", async () => {
      setupAuthenticated();

      const { PUT } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat", {
        method: "PUT",
        body: JSON.stringify({ ...validHeartbeatBody, intervalSeconds: 100000 }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it("returns 400 when prompt exceeds 100k characters", async () => {
      setupAuthenticated();

      const { PUT } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const longPrompt = "x".repeat(100_001);
      const request = new NextRequest("http://localhost/api/engine/heartbeat", {
        method: "PUT",
        body: JSON.stringify({ ...validHeartbeatBody, prompt: longPrompt }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it("accepts request without prompt (prompt is optional)", async () => {
      setupAuthenticated();
      mockUpdateHeartbeatConfig.mockResolvedValue({ enabled: true, interval_seconds: 300 });

      const { PUT } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat", {
        method: "PUT",
        body: JSON.stringify({ enabled: true, intervalSeconds: 300 }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);

      expect(response.status).toBe(200);
    });

    it("returns 502 when engine is unreachable", async () => {
      setupAuthenticated();
      mockUpdateHeartbeatConfig.mockResolvedValue(null);

      const { PUT } = await import(
        "@/app/api/engine/heartbeat/route"
      );
      const request = new NextRequest("http://localhost/api/engine/heartbeat", {
        method: "PUT",
        body: JSON.stringify(validHeartbeatBody),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);

      expect(response.status).toBe(502);
    });
  });

  // =========================================================================
  // GET /api/engine/jobs
  // =========================================================================
  describe("GET /api/engine/jobs", () => {
    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { GET } = await import(
        "@/app/api/engine/jobs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/jobs");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 200 with job list on success", async () => {
      setupAuthenticated();
      const jobsData = {
        jobs: [
          { id: "job_1", status: "completed", prompt: "Do something" },
          { id: "job_2", status: "pending", prompt: "Do another thing" },
        ],
        total: 2,
      };
      mockGetJobs.mockResolvedValue(jobsData);

      const { GET } = await import(
        "@/app/api/engine/jobs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/jobs");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(jobsData);
    });

    it("passes query params (status, limit, offset) to engine client", async () => {
      setupAuthenticated();
      mockGetJobs.mockResolvedValue({ jobs: [], total: 0 });

      const { GET } = await import(
        "@/app/api/engine/jobs/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/jobs?status=pending&limit=10&offset=20"
      );
      await GET(request);

      expect(mockGetJobs).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123",
        expect.objectContaining({
          status: "pending",
          limit: "10",
          offset: "20",
        })
      );
    });

    it("returns empty array when engine returns no jobs", async () => {
      setupAuthenticated();
      mockGetJobs.mockResolvedValue([]);

      const { GET } = await import(
        "@/app/api/engine/jobs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/jobs");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
    });
  });

  // =========================================================================
  // POST /api/engine/jobs
  // =========================================================================
  describe("POST /api/engine/jobs", () => {
    const validJobBody = {
      prompt: "Summarize my unread emails",
    };

    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { POST } = await import(
        "@/app/api/engine/jobs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/jobs", {
        method: "POST",
        body: JSON.stringify(validJobBody),
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it("returns 200 on successful job creation", async () => {
      setupAuthenticated();
      const createdJob = {
        id: "job_3",
        status: "pending",
        prompt: validJobBody.prompt,
      };
      mockCreateJob.mockResolvedValue(createdJob);

      const { POST } = await import(
        "@/app/api/engine/jobs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/jobs", {
        method: "POST",
        body: JSON.stringify(validJobBody),
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(createdJob);
      expect(mockCreateJob).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123",
        expect.objectContaining({ prompt: validJobBody.prompt })
      );
    });

    it("accepts optional name field (max 255 chars)", async () => {
      setupAuthenticated();
      mockCreateJob.mockResolvedValue({ id: "job_4", status: "pending" });

      const { POST } = await import(
        "@/app/api/engine/jobs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/jobs", {
        method: "POST",
        body: JSON.stringify({ ...validJobBody, name: "Email summary job" }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("returns 400 when prompt is missing", async () => {
      setupAuthenticated();

      const { POST } = await import(
        "@/app/api/engine/jobs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/jobs", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it("returns 400 when prompt exceeds 100k characters", async () => {
      setupAuthenticated();

      const { POST } = await import(
        "@/app/api/engine/jobs/route"
      );
      const longPrompt = "x".repeat(100_001);
      const request = new NextRequest("http://localhost/api/engine/jobs", {
        method: "POST",
        body: JSON.stringify({ prompt: longPrompt }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("returns 400 when name exceeds 255 characters", async () => {
      setupAuthenticated();

      const { POST } = await import(
        "@/app/api/engine/jobs/route"
      );
      const longName = "x".repeat(256);
      const request = new NextRequest("http://localhost/api/engine/jobs", {
        method: "POST",
        body: JSON.stringify({ prompt: "valid prompt", name: longName }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("returns 429 when rate limit exceeded (10 per minute)", async () => {
      setupAuthenticated();
      mockCreateJob.mockResolvedValue({ id: "job", status: "pending" });

      const { POST } = await import(
        "@/app/api/engine/jobs/route"
      );

      // Fire 10 requests that should succeed
      for (let i = 0; i < 10; i++) {
        const request = new NextRequest("http://localhost/api/engine/jobs", {
          method: "POST",
          body: JSON.stringify(validJobBody),
          headers: { "Content-Type": "application/json" },
        });
        const response = await POST(request);
        expect(response.status).toBe(200);
      }

      // 11th request should be rate limited
      const request = new NextRequest("http://localhost/api/engine/jobs", {
        method: "POST",
        body: JSON.stringify(validJobBody),
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/rate limit|too many/i);
    });

    it("returns 502 when engine is unreachable", async () => {
      setupAuthenticated();
      mockCreateJob.mockResolvedValue(null);

      const { POST } = await import(
        "@/app/api/engine/jobs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/jobs", {
        method: "POST",
        body: JSON.stringify(validJobBody),
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request);

      expect(response.status).toBe(502);
    });
  });

  // =========================================================================
  // GET /api/engine/jobs/[id]
  // =========================================================================
  describe("GET /api/engine/jobs/[id]", () => {
    const routeParams = { params: Promise.resolve({ id: "job_1" }) };

    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { GET } = await import(
        "@/app/api/engine/jobs/[id]/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/jobs/job_1"
      );
      const response = await GET(request, routeParams);

      expect(response.status).toBe(401);
    });

    it("returns 200 with job details on success", async () => {
      setupAuthenticated();
      const jobData = {
        id: "job_1",
        status: "completed",
        prompt: "Summarize emails",
        result: "You have 3 unread emails...",
        createdAt: "2026-03-22T09:00:00Z",
        completedAt: "2026-03-22T09:01:00Z",
      };
      mockGetJob.mockResolvedValue(jobData);

      const { GET } = await import(
        "@/app/api/engine/jobs/[id]/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/jobs/job_1"
      );
      const response = await GET(request, routeParams);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(jobData);
      expect(mockGetJob).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123",
        "job_1"
      );
    });

    it("returns 502 when engine is unreachable", async () => {
      setupAuthenticated();
      mockGetJob.mockResolvedValue(null);

      const { GET } = await import(
        "@/app/api/engine/jobs/[id]/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/jobs/job_1"
      );
      const response = await GET(request, routeParams);

      expect(response.status).toBe(502);
    });
  });

  // =========================================================================
  // DELETE /api/engine/jobs/[id]
  // =========================================================================
  describe("DELETE /api/engine/jobs/[id]", () => {
    const routeParams = { params: Promise.resolve({ id: "job_2" }) };

    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { DELETE } = await import(
        "@/app/api/engine/jobs/[id]/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/jobs/job_2",
        { method: "DELETE" }
      );
      const response = await DELETE(request, routeParams);

      expect(response.status).toBe(401);
    });

    it("returns 200 on successful deletion", async () => {
      setupAuthenticated();
      mockDeleteJob.mockResolvedValue({ deleted: true });

      const { DELETE } = await import(
        "@/app/api/engine/jobs/[id]/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/jobs/job_2",
        { method: "DELETE" }
      );
      const response = await DELETE(request, routeParams);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockDeleteJob).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123",
        "job_2"
      );
    });

    it("returns 502 when engine is unreachable", async () => {
      setupAuthenticated();
      mockDeleteJob.mockResolvedValue(null);

      const { DELETE } = await import(
        "@/app/api/engine/jobs/[id]/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/jobs/job_2",
        { method: "DELETE" }
      );
      const response = await DELETE(request, routeParams);

      expect(response.status).toBe(502);
    });
  });

  // =========================================================================
  // GET /api/engine/conversations
  // =========================================================================
  describe("GET /api/engine/conversations", () => {
    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { GET } = await import(
        "@/app/api/engine/conversations/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/conversations"
      );
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 200 with conversations on success", async () => {
      setupAuthenticated();
      const conversationsData = {
        conversations: [
          {
            id: "conv_1",
            channel: "heartbeat",
            createdAt: "2026-03-22T09:00:00Z",
            messageCount: 4,
          },
          {
            id: "conv_2",
            channel: "telegram",
            createdAt: "2026-03-22T08:00:00Z",
            messageCount: 6,
          },
        ],
        total: 2,
      };
      mockGetConversations.mockResolvedValue(conversationsData);

      const { GET } = await import(
        "@/app/api/engine/conversations/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/conversations"
      );
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(conversationsData);
    });

    it("passes query params to engine client", async () => {
      setupAuthenticated();
      mockGetConversations.mockResolvedValue({ conversations: [], total: 0 });

      const { GET } = await import(
        "@/app/api/engine/conversations/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/conversations?limit=10&offset=5"
      );
      await GET(request);

      expect(mockGetConversations).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123",
        expect.objectContaining({ limit: "10", offset: "5" })
      );
    });

    it("returns empty array when engine returns no conversations", async () => {
      setupAuthenticated();
      mockGetConversations.mockResolvedValue([]);

      const { GET } = await import(
        "@/app/api/engine/conversations/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/conversations"
      );
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
    });
  });

  // =========================================================================
  // GET /api/engine/conversations/[id]/messages
  // =========================================================================
  describe("GET /api/engine/conversations/[id]/messages", () => {
    const routeParams = { params: Promise.resolve({ id: "conv_1" }) };

    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { GET } = await import(
        "@/app/api/engine/conversations/[id]/messages/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/conversations/conv_1/messages"
      );
      const response = await GET(request, routeParams);

      expect(response.status).toBe(401);
    });

    it("returns 200 with messages on success", async () => {
      setupAuthenticated();
      const messagesData = {
        messages: [
          { id: "msg_1", role: "user", content: "Check emails", createdAt: "2026-03-22T09:00:00Z" },
          { id: "msg_2", role: "assistant", content: "You have 3 unread emails", createdAt: "2026-03-22T09:00:05Z" },
        ],
      };
      mockGetConversationMessages.mockResolvedValue(messagesData);

      const { GET } = await import(
        "@/app/api/engine/conversations/[id]/messages/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/conversations/conv_1/messages"
      );
      const response = await GET(request, routeParams);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(messagesData);
      expect(mockGetConversationMessages).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123",
        "conv_1",
        expect.any(Object)
      );
    });

    it("returns 502 when engine is unreachable", async () => {
      setupAuthenticated();
      mockGetConversationMessages.mockResolvedValue(null);

      const { GET } = await import(
        "@/app/api/engine/conversations/[id]/messages/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/conversations/conv_1/messages"
      );
      const response = await GET(request, routeParams);

      expect(response.status).toBe(502);
    });
  });

  // =========================================================================
  // GET /api/engine/logs
  // =========================================================================
  describe("GET /api/engine/logs", () => {
    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { GET } = await import(
        "@/app/api/engine/logs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/logs");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 200 with log lines on success", async () => {
      setupAuthenticated();
      const logsData = {
        lines: [
          "2026-03-22T09:00:00Z [INFO] Heartbeat triggered",
          "2026-03-22T09:00:01Z [INFO] Job started: job_1",
        ],
      };
      mockGetEngineLogs.mockResolvedValue(logsData);

      const { GET } = await import(
        "@/app/api/engine/logs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/logs");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(logsData);
    });

    it("passes lines query param to engine client", async () => {
      setupAuthenticated();
      mockGetEngineLogs.mockResolvedValue({ lines: [] });

      const { GET } = await import(
        "@/app/api/engine/logs/route"
      );
      const request = new NextRequest(
        "http://localhost/api/engine/logs?lines=200"
      );
      await GET(request);

      expect(mockGetEngineLogs).toHaveBeenCalledWith(
        "tenant.overnightdesk.com",
        "engine-api-key-123",
        200
      );
    });

    it("returns empty array when engine returns no logs", async () => {
      setupAuthenticated();
      mockGetEngineLogs.mockResolvedValue([]);

      const { GET } = await import(
        "@/app/api/engine/logs/route"
      );
      const request = new NextRequest("http://localhost/api/engine/logs");
      const response = await GET(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
    });
  });

  // =========================================================================
  // POST /api/engine/restart
  // =========================================================================
  describe("POST /api/engine/restart", () => {
    it("returns 401 when not authenticated", async () => {
      setupUnauthenticated();

      const { POST } = await import(
        "@/app/api/engine/restart/route"
      );
      const request = new NextRequest("http://localhost/api/engine/restart", {
        method: "POST",
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it("returns 404 when no instance found", async () => {
      setupAuthenticated(null);

      const { POST } = await import(
        "@/app/api/engine/restart/route"
      );
      const request = new NextRequest("http://localhost/api/engine/restart", {
        method: "POST",
      });
      const response = await POST(request);

      expect(response.status).toBe(404);
    });

    it("returns 200 on successful restart", async () => {
      setupAuthenticated();
      mockProvisionerRestart.mockResolvedValue({ success: true });

      const { POST } = await import(
        "@/app/api/engine/restart/route"
      );
      const request = new NextRequest("http://localhost/api/engine/restart", {
        method: "POST",
      });
      const response = await POST(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockProvisionerRestart).toHaveBeenCalledWith("a1b2c3d4e5f6");
    });

    it("returns 502 when provisioner fails", async () => {
      setupAuthenticated();
      mockProvisionerRestart.mockResolvedValue({
        success: false,
        error: "Provisioner unavailable",
      });

      const { POST } = await import(
        "@/app/api/engine/restart/route"
      );
      const request = new NextRequest("http://localhost/api/engine/restart", {
        method: "POST",
      });
      const response = await POST(request);
      const data = await parseResponse(response);

      expect(response.status).toBe(502);
      expect(data.success).toBe(false);
    });

    it("returns 429 when called again within 5 minute cooldown", async () => {
      setupAuthenticated();
      mockProvisionerRestart.mockResolvedValue({ success: true });

      const { POST } = await import(
        "@/app/api/engine/restart/route"
      );

      // First restart should succeed
      const request1 = new NextRequest("http://localhost/api/engine/restart", {
        method: "POST",
      });
      const response1 = await POST(request1);
      expect(response1.status).toBe(200);

      // Second restart immediately after should be rate limited
      const request2 = new NextRequest("http://localhost/api/engine/restart", {
        method: "POST",
      });
      const response2 = await POST(request2);
      const data2 = await parseResponse(response2);

      expect(response2.status).toBe(429);
      expect(data2.success).toBe(false);
      expect(data2.error).toMatch(/cooldown|rate limit|wait/i);
    });
  });
});
