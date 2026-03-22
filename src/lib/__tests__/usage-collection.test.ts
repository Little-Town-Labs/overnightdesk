/**
 * Usage Collection — Tests
 *
 * Tests for collectInstanceUsage and runDailyCollection.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetJobs = jest.fn();
const mockGetConversations = jest.fn();

jest.mock("@/lib/engine-client", () => ({
  getJobs: (...args: unknown[]) => mockGetJobs(...args),
  getConversations: (...args: unknown[]) => mockGetConversations(...args),
}));

const mockSelectFromWhere = jest.fn().mockResolvedValue([]);
const mockInsertValues = jest.fn();
const mockOnConflictDoUpdate = jest.fn().mockResolvedValue(undefined);

mockInsertValues.mockReturnValue({
  onConflictDoUpdate: mockOnConflictDoUpdate,
});

jest.mock("@/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: mockSelectFromWhere,
      })),
    })),
    insert: jest.fn(() => ({
      values: mockInsertValues,
    })),
  },
}));

jest.mock("@/db/schema", () => ({
  instance: {
    id: "id",
    status: "status",
    subdomain: "subdomain",
    engineApiKey: "engineApiKey",
  },
  usageMetric: {
    instanceId: "instanceId",
    metricDate: "metricDate",
    claudeCalls: "claudeCalls",
    toolExecutions: "toolExecutions",
  },
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
}));

import {
  collectInstanceUsage,
  runDailyCollection,
} from "@/lib/usage-collection";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Usage Collection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("collectInstanceUsage()", () => {
    const subdomain = "tenant1.overnightdesk.com";
    const apiKey = "test-api-key";

    it("counts jobs created today", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .slice(0, 10);

      mockGetJobs.mockResolvedValue([
        { created_at: `${today}T10:00:00Z` },
        { created_at: `${today}T11:00:00Z` },
        { created_at: `${yesterday}T23:00:00Z` },
      ]);
      mockGetConversations.mockResolvedValue([]);

      const result = await collectInstanceUsage(subdomain, apiKey);

      expect(result).toEqual({ claudeCalls: 2, toolExecutions: 0 });
      expect(mockGetJobs).toHaveBeenCalledWith(subdomain, apiKey, {
        limit: "100",
      });
    });

    it("counts conversations started today", async () => {
      const today = new Date().toISOString().slice(0, 10);

      mockGetJobs.mockResolvedValue([]);
      mockGetConversations.mockResolvedValue([
        { started_at: `${today}T08:00:00Z` },
        { started_at: `${today}T09:00:00Z` },
        { started_at: `${today}T10:00:00Z` },
      ]);

      const result = await collectInstanceUsage(subdomain, apiKey);

      expect(result).toEqual({ claudeCalls: 0, toolExecutions: 3 });
    });

    it("handles camelCase date fields", async () => {
      const today = new Date().toISOString().slice(0, 10);

      mockGetJobs.mockResolvedValue([
        { createdAt: `${today}T10:00:00Z` },
      ]);
      mockGetConversations.mockResolvedValue([
        { startedAt: `${today}T08:00:00Z` },
      ]);

      const result = await collectInstanceUsage(subdomain, apiKey);

      expect(result).toEqual({ claudeCalls: 1, toolExecutions: 1 });
    });

    it("returns null on engine failure", async () => {
      mockGetJobs.mockRejectedValue(new Error("Connection refused"));
      mockGetConversations.mockResolvedValue([]);

      const result = await collectInstanceUsage(subdomain, apiKey);

      expect(result).toBeNull();
    });

    it("returns zero counts when no activity today", async () => {
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .slice(0, 10);

      mockGetJobs.mockResolvedValue([
        { created_at: `${yesterday}T23:00:00Z` },
      ]);
      mockGetConversations.mockResolvedValue([
        { started_at: `${yesterday}T22:00:00Z` },
      ]);

      const result = await collectInstanceUsage(subdomain, apiKey);

      expect(result).toEqual({ claudeCalls: 0, toolExecutions: 0 });
    });
  });

  describe("runDailyCollection()", () => {
    it("processes multiple running instances concurrently", async () => {
      const today = new Date().toISOString().slice(0, 10);

      mockSelectFromWhere.mockResolvedValue([
        {
          id: "inst-1",
          subdomain: "t1.overnightdesk.com",
          engineApiKey: "key1",
          status: "running",
        },
        {
          id: "inst-2",
          subdomain: "t2.overnightdesk.com",
          engineApiKey: "key2",
          status: "running",
        },
      ]);

      mockGetJobs.mockResolvedValue([
        { created_at: `${today}T10:00:00Z` },
      ]);
      mockGetConversations.mockResolvedValue([
        { started_at: `${today}T08:00:00Z` },
      ]);

      const result = await runDailyCollection();

      expect(result.collected).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockGetJobs).toHaveBeenCalledTimes(2);
    });

    it("skips instances missing subdomain", async () => {
      mockSelectFromWhere.mockResolvedValue([
        {
          id: "inst-1",
          subdomain: null,
          engineApiKey: "key1",
          status: "running",
        },
      ]);

      const result = await runDailyCollection();

      expect(result.collected).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("counts failures when engine returns null", async () => {
      mockSelectFromWhere.mockResolvedValue([
        {
          id: "inst-1",
          subdomain: "t1.overnightdesk.com",
          engineApiKey: "key1",
          status: "running",
        },
      ]);

      mockGetJobs.mockRejectedValue(new Error("timeout"));
      mockGetConversations.mockRejectedValue(new Error("timeout"));

      const result = await runDailyCollection();

      expect(result.collected).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("returns empty when no running instances", async () => {
      mockSelectFromWhere.mockResolvedValue([]);

      const result = await runDailyCollection();

      expect(result).toEqual({ collected: 0, failed: 0 });
    });

    it("upserts usage data into usage_metric table", async () => {
      const today = new Date().toISOString().slice(0, 10);

      mockSelectFromWhere.mockResolvedValue([
        {
          id: "inst-1",
          subdomain: "t1.overnightdesk.com",
          engineApiKey: "key1",
          status: "running",
        },
      ]);

      mockGetJobs.mockResolvedValue([
        { created_at: `${today}T10:00:00Z` },
      ]);
      mockGetConversations.mockResolvedValue([]);

      await runDailyCollection();

      const { db } = jest.requireMock("@/db");
      expect(db.insert).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: "inst-1",
          metricDate: today,
          claudeCalls: 1,
          toolExecutions: 0,
        })
      );
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();
    });
  });
});
