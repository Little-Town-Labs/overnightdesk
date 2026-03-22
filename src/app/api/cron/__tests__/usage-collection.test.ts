/**
 * Cron Usage Collection Route — Tests
 *
 * Tests authorization and successful collection.
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRunDailyCollection = jest.fn();

jest.mock("@/lib/usage-collection", () => ({
  runDailyCollection: () => mockRunDailyCollection(),
}));

import { POST } from "@/app/api/cron/usage-collection/route";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/cron/usage-collection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "test-cron-secret" };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 401 without CRON_SECRET", async () => {
    const request = new NextRequest("http://localhost/api/cron/usage-collection", {
      method: "POST",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with wrong CRON_SECRET", async () => {
    const request = new NextRequest("http://localhost/api/cron/usage-collection", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 200 with valid secret and runs collection", async () => {
    mockRunDailyCollection.mockResolvedValue({ collected: 5, failed: 1 });

    const request = new NextRequest("http://localhost/api/cron/usage-collection", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ collected: 5, failed: 1 });
    expect(mockRunDailyCollection).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when collection throws", async () => {
    mockRunDailyCollection.mockRejectedValue(new Error("DB connection failed"));

    const request = new NextRequest("http://localhost/api/cron/usage-collection", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("DB connection failed");
  });
});
