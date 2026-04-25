import { NextRequest } from "next/server";
import { POST } from "@/app/api/provisioner/callback/route";

const mockUpdateInstanceStatus = jest.fn().mockResolvedValue(undefined);
const mockSelectFromWhere = jest.fn().mockResolvedValue([]);
const mockInsertValues = jest.fn().mockResolvedValue(undefined);
const mockSendProvisioningEmail = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/instance", () => ({
  updateInstanceStatus: (...args: unknown[]) =>
    mockUpdateInstanceStatus(...args),
}));

jest.mock("@/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({ where: mockSelectFromWhere })),
    })),
    insert: jest.fn(() => ({ values: mockInsertValues })),
  },
}));

jest.mock("@/db/schema", () => ({
  instance: { tenantId: "tenantId" },
  user: { id: "id" },
}));

jest.mock("@/lib/email", () => ({
  sendProvisioningEmail: (...args: unknown[]) =>
    mockSendProvisioningEmail(...args),
}));

jest.mock("@/lib/config", () => ({
  getAppUrl: () => "https://overnightdesk.com",
}));

const SECRET = "test-provisioner-secret";

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/provisioner/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/provisioner/callback", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, PROVISIONER_SECRET: SECRET };
    mockSelectFromWhere.mockResolvedValue([
      { id: "inst_1", tenantId: "alice", userId: "user_1" },
    ]);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 401 with missing auth", async () => {
    const req = new NextRequest(
      "http://localhost/api/provisioner/callback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "alice", status: "running" }),
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("updates instance status on success callback", async () => {
    const req = makeRequest({ tenantId: "alice", status: "running", containerId: "hermes-alice" });
    await POST(req);

    expect(mockUpdateInstanceStatus).toHaveBeenCalledWith(
      "alice",
      "running",
      expect.any(Object),
      expect.objectContaining({ containerId: "hermes-alice" })
    );
  });

  it("stores phaseServiceToken when provided in callback", async () => {
    const req = makeRequest({
      tenantId: "alice",
      status: "running",
      containerId: "hermes-alice",
      phaseServiceToken: "pss_service:v2:abc123",
    });
    await POST(req);

    expect(mockUpdateInstanceStatus).toHaveBeenCalledWith(
      "alice",
      "running",
      expect.any(Object),
      expect.objectContaining({
        containerId: "hermes-alice",
        phaseServiceToken: "pss_service:v2:abc123",
      })
    );
  });

  it("succeeds without phaseServiceToken (backwards compatible)", async () => {
    const req = makeRequest({
      tenantId: "alice",
      status: "running",
      containerId: "hermes-alice",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockUpdateInstanceStatus).toHaveBeenCalledWith(
      "alice",
      "running",
      expect.any(Object),
      expect.not.objectContaining({ phaseServiceToken: expect.anything() })
    );
  });

  it("sends welcome email when status is running", async () => {
    mockSelectFromWhere
      .mockResolvedValueOnce([{ id: "inst_1", tenantId: "alice", userId: "user_1" }])
      .mockResolvedValueOnce([{ id: "user_1", email: "alice@test.com", name: "Alice" }]);

    const req = makeRequest({ tenantId: "alice", status: "running", containerId: "hermes-alice" });
    await POST(req);

    expect(mockSendProvisioningEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ email: "alice@test.com" }),
      })
    );
  });

  it("handles error status without sending email", async () => {
    const req = makeRequest({ tenantId: "alice", status: "error", error: "certbot failed" });
    await POST(req);

    expect(mockUpdateInstanceStatus).toHaveBeenCalledWith(
      "alice",
      "error",
      expect.objectContaining({ error: "certbot failed" }),
      expect.any(Object)
    );
    expect(mockSendProvisioningEmail).not.toHaveBeenCalled();
  });

  it("returns 404 if instance not found", async () => {
    mockSelectFromWhere.mockResolvedValueOnce([]);

    const req = makeRequest({ tenantId: "ghost", status: "running" });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });
});
