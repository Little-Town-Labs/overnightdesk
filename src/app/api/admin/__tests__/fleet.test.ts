// Mock auth
const mockGetSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

// Mock next/headers
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

// Mock billing
jest.mock("@/lib/billing", () => ({
  isAdmin: jest.fn(),
}));

// Mock database
const mockWhere = jest.fn().mockResolvedValue([]);
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockOffset = jest.fn().mockResolvedValue([]);

jest.mock("@/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: mockWhere,
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            offset: mockOffset,
          })),
        })),
      })),
    })),
  },
}));

jest.mock("@/db/schema", () => ({
  instance: {
    id: "id",
    tenantId: "tenantId",
    status: "status",
    subdomain: "subdomain",
    lastHealthCheck: "lastHealthCheck",
    consecutiveHealthFailures: "consecutiveHealthFailures",
    claudeAuthStatus: "claudeAuthStatus",
  },
  fleetEvent: {
    instanceId: "instanceId",
    eventType: "eventType",
    createdAt: "createdAt",
  },
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  desc: jest.fn(),
  and: jest.fn(),
  count: jest.fn(),
}));

const { isAdmin } = jest.requireMock("@/lib/billing");

import { NextRequest } from "next/server";

describe("Admin Fleet API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/admin/fleet/health", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const { GET } = await import(
        "@/app/api/admin/fleet/health/route"
      );

      const request = new NextRequest(
        "http://localhost/api/admin/fleet/health"
      );
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "user_1", email: "user@example.com" },
      });
      isAdmin.mockReturnValueOnce(false);

      const { GET } = await import(
        "@/app/api/admin/fleet/health/route"
      );

      const request = new NextRequest(
        "http://localhost/api/admin/fleet/health"
      );
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("returns 200 with instance data for admin", async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "admin_1", email: "admin@example.com" },
      });
      isAdmin.mockReturnValueOnce(true);

      const mockInstances = [
        {
          id: "inst_1",
          tenantId: "tenant1",
          status: "running",
          subdomain: "tenant1.overnightdesk.com",
          lastHealthCheck: new Date(),
          consecutiveHealthFailures: 0,
          claudeAuthStatus: "connected",
        },
      ];

      const { db } = jest.requireMock("@/db");
      db.select.mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce(mockInstances),
      });

      const { GET } = await import(
        "@/app/api/admin/fleet/health/route"
      );

      const request = new NextRequest(
        "http://localhost/api/admin/fleet/health"
      );
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });

  describe("GET /api/admin/fleet/events", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const { GET } = await import(
        "@/app/api/admin/fleet/events/route"
      );

      const request = new NextRequest(
        "http://localhost/api/admin/fleet/events"
      );
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "user_1", email: "user@example.com" },
      });
      isAdmin.mockReturnValueOnce(false);

      const { GET } = await import(
        "@/app/api/admin/fleet/events/route"
      );

      const request = new NextRequest(
        "http://localhost/api/admin/fleet/events"
      );
      const response = await GET(request);

      expect(response.status).toBe(403);
    });
  });
});
