import {
  getAuthStatus,
  getTerminalTicket,
  getEngineStatus,
  getHeartbeatConfig,
  updateHeartbeatConfig,
  getJobs,
  createJob,
  getJob,
  deleteJob,
  getConversations,
  getConversationMessages,
  getEngineLogs,
  getTelegramConfig,
  updateTelegramConfig,
  deleteTelegramConfig,
  getDiscordConfig,
  updateDiscordConfig,
  deleteDiscordConfig,
} from "@/lib/engine-client";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("Engine Client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAuthStatus()", () => {
    it("returns authenticated when engine reports authenticated", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "authenticated" }),
      });

      const result = await getAuthStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("authenticated");
    });

    it("returns not_authenticated when engine reports not_authenticated", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "not_authenticated" }),
      });

      const result = await getAuthStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("not_authenticated");
    });

    it("returns unknown when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await getAuthStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("unknown");
    });

    it("sends correct Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "authenticated" }),
      });

      await getAuthStatus("tenant.overnightdesk.com", "mykey123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/auth-status",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey123",
          }),
        })
      );
    });

    it("returns unknown on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getAuthStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("unknown");
    });
  });

  describe("getTerminalTicket()", () => {
    it("returns ticket on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ticket: "abc123" }),
      });

      const result = await getTerminalTicket("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("abc123");
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getTerminalTicket("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });

    it("sends correct Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ticket: "xyz" }),
      });

      await getTerminalTicket("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/terminal/ticket",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getTerminalTicket("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });
  });

  describe("getEngineStatus()", () => {
    const mockStatus = {
      version: "1.2.0",
      uptime: "3h 45m",
      queue: { pending: 2, running: 1, completed: 15 },
      claude_auth: "authenticated",
      heartbeat: { enabled: true, interval_seconds: 300 },
    };

    it("returns status object on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatus),
      });

      const result = await getEngineStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual(mockStatus);
    });

    it("sends correct Authorization header and URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatus),
      });

      await getEngineStatus("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/status",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const result = await getEngineStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await getEngineStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });

    it("returns null on timeout", async () => {
      const abortError = new DOMException("signal timed out", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await getEngineStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });
  });

  describe("getHeartbeatConfig()", () => {
    const mockConfig = {
      enabled: true,
      interval_seconds: 300,
      last_run: "2026-03-22T10:00:00Z",
      next_run: "2026-03-22T10:05:00Z",
      consecutive_failures: 0,
    };

    it("returns heartbeat config on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      const result = await getHeartbeatConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual(mockConfig);
    });

    it("sends correct Authorization header and URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      await getHeartbeatConfig("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/heartbeat",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getHeartbeatConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getHeartbeatConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });
  });

  describe("updateHeartbeatConfig()", () => {
    const updateData = { enabled: false, interval_seconds: 600, prompt: "check status" };
    const mockResponse = {
      enabled: false,
      interval_seconds: 600,
      prompt: "check status",
      last_run: "2026-03-22T10:00:00Z",
      next_run: "2026-03-22T10:10:00Z",
      consecutive_failures: 0,
    };

    it("returns updated config on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await updateHeartbeatConfig(
        "tenant.overnightdesk.com",
        "apikey",
        updateData
      );
      expect(result).toEqual(mockResponse);
    });

    it("sends PUT request with correct body and headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await updateHeartbeatConfig("tenant.overnightdesk.com", "mykey", updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/heartbeat",
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(updateData),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const result = await updateHeartbeatConfig(
        "tenant.overnightdesk.com",
        "apikey",
        updateData
      );
      expect(result).toBeNull();
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await updateHeartbeatConfig(
        "tenant.overnightdesk.com",
        "apikey",
        updateData
      );
      expect(result).toBeNull();
    });
  });

  describe("getJobs()", () => {
    const mockJobs = [
      { id: "job-1", status: "completed", prompt: "check servers" },
      { id: "job-2", status: "pending", prompt: "run diagnostics" },
    ];

    it("returns jobs array on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockJobs),
      });

      const result = await getJobs("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual(mockJobs);
    });

    it("sends correct URL without params when none provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockJobs),
      });

      await getJobs("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/jobs",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("sends correct URL with query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockJobs),
      });

      await getJobs("tenant.overnightdesk.com", "mykey", {
        status: "pending",
        limit: 20,
        offset: 0,
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/api/jobs?");
      expect(calledUrl).toContain("status=pending");
      expect(calledUrl).toContain("limit=20");
      expect(calledUrl).toContain("offset=0");
    });

    it("returns empty array on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getJobs("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual([]);
    });

    it("returns empty array when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getJobs("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual([]);
    });

    it("returns empty array on timeout", async () => {
      const abortError = new DOMException("signal timed out", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await getJobs("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual([]);
    });
  });

  describe("createJob()", () => {
    const jobData = { prompt: "check servers", source: "dashboard" as const, name: "Server Check" };
    const mockCreatedJob = {
      id: "job-new",
      status: "pending",
      prompt: "check servers",
      source: "dashboard",
      name: "Server Check",
    };

    it("returns created job on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCreatedJob),
      });

      const result = await createJob("tenant.overnightdesk.com", "apikey", jobData);
      expect(result).toEqual(mockCreatedJob);
    });

    it("sends POST request with correct body and headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCreatedJob),
      });

      await createJob("tenant.overnightdesk.com", "mykey", jobData);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/jobs",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(jobData),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
      });

      const result = await createJob("tenant.overnightdesk.com", "apikey", jobData);
      expect(result).toBeNull();
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await createJob("tenant.overnightdesk.com", "apikey", jobData);
      expect(result).toBeNull();
    });
  });

  describe("getJob()", () => {
    const mockJob = {
      id: "job-42",
      status: "running",
      prompt: "run diagnostics",
      created_at: "2026-03-22T09:00:00Z",
    };

    it("returns job on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockJob),
      });

      const result = await getJob("tenant.overnightdesk.com", "apikey", "job-42");
      expect(result).toEqual(mockJob);
    });

    it("sends correct URL with job ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockJob),
      });

      await getJob("tenant.overnightdesk.com", "mykey", "job-42");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/jobs/job-42",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await getJob("tenant.overnightdesk.com", "apikey", "nonexistent");
      expect(result).toBeNull();
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getJob("tenant.overnightdesk.com", "apikey", "job-42");
      expect(result).toBeNull();
    });
  });

  describe("deleteJob()", () => {
    it("returns true on successful deletion", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted: true }),
      });

      const result = await deleteJob("tenant.overnightdesk.com", "apikey", "job-42");
      expect(result).toBe(true);
    });

    it("sends DELETE request with correct URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted: true }),
      });

      await deleteJob("tenant.overnightdesk.com", "mykey", "job-42");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/jobs/job-42",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns false on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await deleteJob("tenant.overnightdesk.com", "apikey", "job-42");
      expect(result).toBe(false);
    });

    it("returns false when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await deleteJob("tenant.overnightdesk.com", "apikey", "job-42");
      expect(result).toBe(false);
    });

    it("returns false on timeout", async () => {
      const abortError = new DOMException("signal timed out", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await deleteJob("tenant.overnightdesk.com", "apikey", "job-42");
      expect(result).toBe(false);
    });
  });

  describe("getConversations()", () => {
    const mockConversations = [
      { id: "conv-1", job_id: "job-1", created_at: "2026-03-22T09:00:00Z" },
      { id: "conv-2", job_id: "job-2", created_at: "2026-03-22T10:00:00Z" },
    ];

    it("returns conversations array on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConversations),
      });

      const result = await getConversations("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual(mockConversations);
    });

    it("sends correct URL without params when none provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConversations),
      });

      await getConversations("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/conversations",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("sends correct URL with query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConversations),
      });

      await getConversations("tenant.overnightdesk.com", "mykey", {
        limit: 20,
        offset: 0,
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/api/conversations?");
      expect(calledUrl).toContain("limit=20");
      expect(calledUrl).toContain("offset=0");
    });

    it("returns empty array on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getConversations("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual([]);
    });

    it("returns empty array when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getConversations("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual([]);
    });
  });

  describe("getConversationMessages()", () => {
    const mockMessages = [
      { id: "msg-1", role: "user", content: "check servers", timestamp: "2026-03-22T09:00:00Z" },
      { id: "msg-2", role: "assistant", content: "All servers OK", timestamp: "2026-03-22T09:00:05Z" },
    ];

    it("returns messages array on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      });

      const result = await getConversationMessages(
        "tenant.overnightdesk.com",
        "apikey",
        "conv-1"
      );
      expect(result).toEqual(mockMessages);
    });

    it("sends correct URL with conversation ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      });

      await getConversationMessages("tenant.overnightdesk.com", "mykey", "conv-1");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/conversations/conv-1/messages",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("sends correct URL with query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      });

      await getConversationMessages("tenant.overnightdesk.com", "mykey", "conv-1", {
        limit: 50,
        offset: 0,
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/api/conversations/conv-1/messages?");
      expect(calledUrl).toContain("limit=50");
      expect(calledUrl).toContain("offset=0");
    });

    it("returns empty array on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await getConversationMessages(
        "tenant.overnightdesk.com",
        "apikey",
        "conv-1"
      );
      expect(result).toEqual([]);
    });

    it("returns empty array when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getConversationMessages(
        "tenant.overnightdesk.com",
        "apikey",
        "conv-1"
      );
      expect(result).toEqual([]);
    });
  });

  describe("getEngineLogs()", () => {
    const mockLogs = [
      "2026-03-22T09:00:00Z [INFO] Engine started",
      "2026-03-22T09:00:01Z [INFO] Heartbeat enabled",
      "2026-03-22T09:05:00Z [INFO] Job job-1 completed",
    ];

    it("returns log lines array on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogs),
      });

      const result = await getEngineLogs("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual(mockLogs);
    });

    it("sends correct URL with default lines param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogs),
      });

      await getEngineLogs("tenant.overnightdesk.com", "mykey");

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/api/logs");
    });

    it("sends correct URL with custom lines param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogs),
      });

      await getEngineLogs("tenant.overnightdesk.com", "mykey", 200);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/api/logs?");
      expect(calledUrl).toContain("lines=200");
    });

    it("sends correct Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogs),
      });

      await getEngineLogs("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/logs"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns empty array on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getEngineLogs("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual([]);
    });

    it("returns empty array when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await getEngineLogs("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual([]);
    });

    it("returns empty array on timeout", async () => {
      const abortError = new DOMException("signal timed out", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await getEngineLogs("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual([]);
    });
  });

  describe("getTelegramConfig()", () => {
    const mockConfig = {
      bot_token: "123456:ABCdef",
      allowed_users: [111, 222],
      enabled: true,
      webhook_base_url: "https://tenant.overnightdesk.com",
    };

    it("returns telegram config on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      const result = await getTelegramConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual(mockConfig);
    });

    it("sends correct Authorization header and URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      await getTelegramConfig("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/telegram",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await getTelegramConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await getTelegramConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });
  });

  describe("updateTelegramConfig()", () => {
    const updateData = {
      bot_token: "123456:ABCdef",
      allowed_users: [111],
      enabled: true,
      webhook_base_url: "https://tenant.overnightdesk.com",
    };
    const mockResponse = { ...updateData, status: "connected" };

    it("returns updated config on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await updateTelegramConfig("tenant.overnightdesk.com", "apikey", updateData);
      expect(result).toEqual(mockResponse);
    });

    it("sends PUT request with correct body and headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await updateTelegramConfig("tenant.overnightdesk.com", "mykey", updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/telegram",
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(updateData),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

      const result = await updateTelegramConfig("tenant.overnightdesk.com", "apikey", updateData);
      expect(result).toBeNull();
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await updateTelegramConfig("tenant.overnightdesk.com", "apikey", updateData);
      expect(result).toBeNull();
    });
  });

  describe("deleteTelegramConfig()", () => {
    it("returns true on successful deletion", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await deleteTelegramConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBe(true);
    });

    it("sends DELETE request with correct URL", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await deleteTelegramConfig("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/telegram",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns false on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await deleteTelegramConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBe(false);
    });

    it("returns false when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await deleteTelegramConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBe(false);
    });

    it("returns false on timeout", async () => {
      const abortError = new DOMException("signal timed out", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await deleteTelegramConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBe(false);
    });
  });

  describe("getDiscordConfig()", () => {
    const mockConfig = {
      bot_token: "MTIzNDU2Nzg5.abc.xyz",
      allowed_users: ["111222333444555666"],
      enabled: true,
    };

    it("returns discord config on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      const result = await getDiscordConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toEqual(mockConfig);
    });

    it("sends correct Authorization header and URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      await getDiscordConfig("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/discord",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await getDiscordConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await getDiscordConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });
  });

  describe("updateDiscordConfig()", () => {
    const updateData = {
      bot_token: "MTIzNDU2Nzg5.abc.xyz",
      allowed_users: ["111222333444555666"],
      enabled: true,
    };
    const mockResponse = { ...updateData, status: "connected" };

    it("returns updated config on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await updateDiscordConfig("tenant.overnightdesk.com", "apikey", updateData);
      expect(result).toEqual(mockResponse);
    });

    it("sends PUT request with correct body and headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await updateDiscordConfig("tenant.overnightdesk.com", "mykey", updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/discord",
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(updateData),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

      const result = await updateDiscordConfig("tenant.overnightdesk.com", "apikey", updateData);
      expect(result).toBeNull();
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await updateDiscordConfig("tenant.overnightdesk.com", "apikey", updateData);
      expect(result).toBeNull();
    });
  });

  describe("deleteDiscordConfig()", () => {
    it("returns true on successful deletion", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await deleteDiscordConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBe(true);
    });

    it("sends DELETE request with correct URL", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await deleteDiscordConfig("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/discord",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns false on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await deleteDiscordConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBe(false);
    });

    it("returns false when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await deleteDiscordConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBe(false);
    });

    it("returns false on timeout", async () => {
      const abortError = new DOMException("signal timed out", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await deleteDiscordConfig("tenant.overnightdesk.com", "apikey");
      expect(result).toBe(false);
    });
  });
});
