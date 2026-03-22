/**
 * Admin Metrics API — Tests
 *
 * Tests authorization and metric structure.
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockHeaders = jest.fn().mockResolvedValue(new Headers());
jest.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

const mockGetSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

const mockIsAdmin = jest.fn();
jest.mock("@/lib/billing", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

const mockSelectFromWhere = jest.fn().mockResolvedValue([{ count: 0 }]);
const mockFrom = jest.fn().mockImplementation(() => ({
  where: mockSelectFromWhere,
}));

jest.mock("@/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: mockFrom,
    })),
  },
}));

jest.mock("@/db/schema", () => ({
  subscription: { status: "status" },
  instance: { id: "id", status: "status", tenantId: "tenantId" },
  usageMetric: {
    instanceId: "instanceId",
    metricDate: "metricDate",
    claudeCalls: "claudeCalls",
    toolExecutions: "toolExecutions",
  },
  fleetEvent: { eventType: "eventType" },
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  sql: jest.fn().mockReturnValue("sql-template"),
  gte: jest.fn(),
  and: jest.fn(),
}));

import { GET } from "@/app/api/admin/metrics/route";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/metrics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 without session", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 403 for non-admin user", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    mockIsAdmin.mockReturnValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 with correct metric structure for admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "admin-1", email: "admin@overnightdesk.com" },
    });
    mockIsAdmin.mockReturnValue(true);

    // Mock the sequence of DB calls:
    // 1. active subscribers count
    // 2. running instances count
    // 3. avg daily claude calls
    // 4. running instances for at-risk
    // 5. recent usage
    // 6. queued events
    // 7. running events
    mockSelectFromWhere
      .mockResolvedValueOnce([{ count: 10 }])   // active subs
      .mockResolvedValueOnce([{ count: 8 }])    // running instances
      .mockResolvedValueOnce([{ avg: 42.5 }])   // avg claude calls
      .mockResolvedValueOnce([                   // running instances for at-risk
        { id: "i1", tenantId: "t1" },
        { id: "i2", tenantId: "t2" },
      ])
      .mockResolvedValueOnce([{ instanceId: "i1" }])  // recent usage (i1 has usage)
      .mockResolvedValueOnce([{ count: 20 }])   // queued events
      .mockResolvedValueOnce([{ count: 18 }]);  // running events

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      activeSubscribers: 10,
      runningInstances: 8,
      avgDailyClaudeCalls: 42.5,
      atRiskTenants: ["t2"],
      provisioningSuccessRate: 90,
    });
  });

  it("returns 0 provisioning rate when no queued events", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "admin-1", email: "admin@overnightdesk.com" },
    });
    mockIsAdmin.mockReturnValue(true);

    mockSelectFromWhere
      .mockResolvedValueOnce([{ count: 0 }])    // active subs
      .mockResolvedValueOnce([{ count: 0 }])    // running instances
      .mockResolvedValueOnce([{ avg: 0 }])      // avg claude calls
      .mockResolvedValueOnce([])                  // no running instances
      .mockResolvedValueOnce([])                  // no recent usage
      .mockResolvedValueOnce([{ count: 0 }])    // queued events
      .mockResolvedValueOnce([{ count: 0 }]);   // running events

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.provisioningSuccessRate).toBe(0);
    expect(body.data.atRiskTenants).toEqual([]);
  });
});
