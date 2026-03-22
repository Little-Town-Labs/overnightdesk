import { checkInstanceHealth, runFleetHealthCheck } from "@/lib/health-check";

// Mock engine-client
jest.mock("@/lib/engine-client", () => ({
  getEngineStatus: jest.fn(),
}));

// Mock owner-notifications
jest.mock("@/lib/owner-notifications", () => ({
  sendOwnerAlert: jest.fn().mockResolvedValue(true),
}));

// Mock database
const mockSelectFromWhere = jest.fn().mockResolvedValue([]);
const mockInsertValues = jest.fn().mockResolvedValue(undefined);
const mockUpdateSetWhere = jest.fn().mockResolvedValue(undefined);

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
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: mockUpdateSetWhere,
      })),
    })),
  },
}));

jest.mock("@/db/schema", () => ({
  instance: {
    id: "id",
    status: "status",
    subdomain: "subdomain",
    engineApiKey: "engineApiKey",
    consecutiveHealthFailures: "consecutiveHealthFailures",
  },
  fleetEvent: {},
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}));

const { getEngineStatus } = jest.requireMock("@/lib/engine-client");
const { sendOwnerAlert } = jest.requireMock("@/lib/owner-notifications");

describe("Health Check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("checkInstanceHealth()", () => {
    it("returns true when engine status returns data", async () => {
      getEngineStatus.mockResolvedValueOnce({ status: "ok" });

      const result = await checkInstanceHealth("test.overnightdesk.com", "api-key-123");

      expect(result).toBe(true);
      expect(getEngineStatus).toHaveBeenCalledWith("test.overnightdesk.com", "api-key-123");
    });

    it("returns false when engine status returns null", async () => {
      getEngineStatus.mockResolvedValueOnce(null);

      const result = await checkInstanceHealth("test.overnightdesk.com", "api-key-123");

      expect(result).toBe(false);
    });
  });

  describe("runFleetHealthCheck()", () => {
    it("returns zero counts when no running instances", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([]);

      const result = await runFleetHealthCheck();

      expect(result).toEqual({ checked: 0, passed: 0, failed: 0, alerts: 0 });
    });

    it("processes healthy instance: resets failures and updates lastHealthCheck", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([
        {
          id: "inst_1",
          tenantId: "tenant1",
          subdomain: "tenant1.overnightdesk.com",
          engineApiKey: "key1",
          consecutiveHealthFailures: 0,
          status: "running",
        },
      ]);
      getEngineStatus.mockResolvedValueOnce({ status: "ok" });

      const result = await runFleetHealthCheck();

      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
      const { db } = jest.requireMock("@/db");
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it("processes unhealthy instance: increments failure counter", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([
        {
          id: "inst_2",
          tenantId: "tenant2",
          subdomain: "tenant2.overnightdesk.com",
          engineApiKey: "key2",
          consecutiveHealthFailures: 0,
          status: "running",
        },
      ]);
      getEngineStatus.mockResolvedValueOnce(null);

      const result = await runFleetHealthCheck();

      expect(result.failed).toBe(1);
      expect(result.passed).toBe(0);
    });

    it("sends alert notification when consecutiveHealthFailures reaches 3", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([
        {
          id: "inst_3",
          tenantId: "tenant3",
          subdomain: "tenant3.overnightdesk.com",
          engineApiKey: "key3",
          consecutiveHealthFailures: 2,
          status: "running",
        },
      ]);
      getEngineStatus.mockResolvedValueOnce(null);

      const result = await runFleetHealthCheck();

      expect(result.alerts).toBe(1);
      expect(sendOwnerAlert).toHaveBeenCalledWith(
        expect.stringContaining("Instance Unhealthy")
      );
    });

    it("does not send alert when failures below threshold", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([
        {
          id: "inst_4",
          tenantId: "tenant4",
          subdomain: "tenant4.overnightdesk.com",
          engineApiKey: "key4",
          consecutiveHealthFailures: 0,
          status: "running",
        },
      ]);
      getEngineStatus.mockResolvedValueOnce(null);

      const result = await runFleetHealthCheck();

      expect(result.alerts).toBe(0);
      expect(sendOwnerAlert).not.toHaveBeenCalled();
    });

    it("sends recovery notification when previously unhealthy instance recovers", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([
        {
          id: "inst_5",
          tenantId: "tenant5",
          subdomain: "tenant5.overnightdesk.com",
          engineApiKey: "key5",
          consecutiveHealthFailures: 3,
          status: "running",
        },
      ]);
      getEngineStatus.mockResolvedValueOnce({ status: "ok" });

      const result = await runFleetHealthCheck();

      expect(result.passed).toBe(1);
      expect(sendOwnerAlert).toHaveBeenCalledWith(
        expect.stringContaining("Instance Recovered")
      );
    });

    it("skips instances without subdomain or engineApiKey", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([
        {
          id: "inst_6",
          tenantId: "tenant6",
          subdomain: null,
          engineApiKey: null,
          consecutiveHealthFailures: 0,
          status: "running",
        },
      ]);

      const result = await runFleetHealthCheck();

      expect(result.checked).toBe(1);
      expect(getEngineStatus).not.toHaveBeenCalled();
    });

    it("handles multiple instances concurrently", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([
        {
          id: "inst_a",
          tenantId: "tenantA",
          subdomain: "a.overnightdesk.com",
          engineApiKey: "keyA",
          consecutiveHealthFailures: 0,
          status: "running",
        },
        {
          id: "inst_b",
          tenantId: "tenantB",
          subdomain: "b.overnightdesk.com",
          engineApiKey: "keyB",
          consecutiveHealthFailures: 0,
          status: "running",
        },
      ]);
      getEngineStatus
        .mockResolvedValueOnce({ status: "ok" })
        .mockResolvedValueOnce(null);

      const result = await runFleetHealthCheck();

      expect(result.checked).toBe(2);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});
