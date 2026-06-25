import { NextRequest } from "next/server";

const mockGetSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

const mockGetInstanceForUser = jest.fn();
jest.mock("@/lib/instance", () => ({
  getInstanceForUser: (...args: unknown[]) => mockGetInstanceForUser(...args),
  isHermesMitchelTenant: (inst: { tenantId?: string; containerId?: string | null } | null) =>
    inst?.tenantId === "hermes-mitchel" || inst?.containerId === "hermes-mitchel",
}));

const mockFetchSummary = jest.fn();
jest.mock("@/lib/mitchel-prospecting/trevor-summary-client", () => ({
  fetchMitchelProspectingSummary: (...args: unknown[]) => mockFetchSummary(...args),
}));

const SESSION = { user: { id: "user-1", email: "mitchel@example.com" } };
const MITCHEL_INSTANCE = {
  id: "inst-1",
  userId: "user-1",
  tenantId: "hermes-mitchel",
  containerId: "hermes-mitchel",
  status: "running",
};

function makeRequest() {
  return new NextRequest("http://localhost/api/mitchel/prospecting/summary");
}

describe("GET /api/mitchel/prospecting/summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION);
    mockGetInstanceForUser.mockResolvedValue(MITCHEL_INSTANCE);
    mockFetchSummary.mockResolvedValue({
      tenantId: "hermes-mitchel",
      generatedAt: "2026-06-25T12:00:00.000Z",
      sections: {
        prospects: { status: "empty", count: 0, message: "No prospects.", lastUpdatedAt: null },
        stagedCandidates: { status: "empty", count: 0, message: "No staged candidates.", lastUpdatedAt: null },
        callTasks: { status: "empty", count: 0, message: "No call tasks.", lastUpdatedAt: null },
        reviewItems: { status: "empty", count: 0, message: "No review items.", lastUpdatedAt: null },
        followUpDrafts: { status: "empty", count: 0, message: "No follow-up drafts.", lastUpdatedAt: null },
      },
      prospects: [],
      stagedCandidates: [],
      callTasks: [],
      reviewItems: [],
      followUpDrafts: [],
      warnings: [],
      outboundSent: false,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/mitchel/prospecting/summary/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 for non-Mitchel tenants", async () => {
    mockGetInstanceForUser.mockResolvedValue({
      ...MITCHEL_INSTANCE,
      tenantId: "alice",
      containerId: "hermes-alice",
    });
    const { GET } = await import("@/app/api/mitchel/prospecting/summary/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(mockFetchSummary).not.toHaveBeenCalled();
  });

  it("returns 503 when the Mitchel instance is not running", async () => {
    mockGetInstanceForUser.mockResolvedValue({ ...MITCHEL_INSTANCE, status: "queued" });
    const { GET } = await import("@/app/api/mitchel/prospecting/summary/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(503);
    expect(mockFetchSummary).not.toHaveBeenCalled();
  });

  it("returns a bounded read-only summary for Mitchel", async () => {
    const { GET } = await import("@/app/api/mitchel/prospecting/summary/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockFetchSummary).toHaveBeenCalledWith("hermes-mitchel");
    expect(body.success).toBe(true);
    expect(body.data.tenantId).toBe("hermes-mitchel");
    expect(body.data.outboundSent).toBe(false);
    expect(JSON.stringify(body)).not.toContain("TREVOR_DB_URL");
  });
});
