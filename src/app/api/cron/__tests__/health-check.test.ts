import { POST } from "@/app/api/cron/health-check/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/health-check", () => ({
  runFleetHealthCheck: jest.fn().mockResolvedValue({
    checked: 3,
    passed: 2,
    failed: 1,
    alerts: 0,
  }),
}));

const { runFleetHealthCheck } = jest.requireMock("@/lib/health-check");

describe("POST /api/cron/health-check", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 401 when authorization header is missing", async () => {
    const request = new NextRequest("http://localhost/api/cron/health-check", {
      method: "POST",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when authorization header has wrong secret", async () => {
    const request = new NextRequest("http://localhost/api/cron/health-check", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 200 with health check results when secret is valid", async () => {
    const request = new NextRequest("http://localhost/api/cron/health-check", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      checked: 3,
      passed: 2,
      failed: 1,
      alerts: 0,
    });
    expect(runFleetHealthCheck).toHaveBeenCalledTimes(1);
  });
});
