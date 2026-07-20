import { NextRequest } from "next/server";

const mockGetSession = jest.fn();
const mockAuthorizeEdge = jest.fn();
const mockRecordAudit = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));
jest.mock("@/lib/open-webui-titus-canary", () => ({
  TITUS_OPEN_WEBUI: { deploymentId: "open-webui-hermes-titus" },
  authorizeTitusOpenWebuiEdge: (...args: unknown[]) => mockAuthorizeEdge(...args),
}));
jest.mock("@/lib/open-webui-audit", () => ({
  recordOpenWebuiAuditEvent: (...args: unknown[]) => mockRecordAudit(...args),
}));

import { GET } from "@/app/api/auth/verify-workspace/route";

function request(host?: string, transport = "http") {
  const headers = new Headers({
    cookie: "better-auth.session_token=opaque",
    "x-request-id": "fixture-request-id",
    "x-open-webui-transport": transport,
  });
  if (host) headers.set("x-original-host", host);
  return new NextRequest(
    "https://www.overnightdesk.com/api/auth/verify-workspace",
    { headers },
  );
}

describe("GET /api/auth/verify-workspace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: "gary-user-id" } });
    mockAuthorizeEdge.mockResolvedValue(true);
  });

  it("allows the exact active Titus workspace membership", async () => {
    await expect(
      GET(request("titus-chat.overnightdesk.com", "websocket")),
    ).resolves.toMatchObject({ status: 200 });
    expect(mockAuthorizeEdge).toHaveBeenCalledWith(
      {
        userId: "gary-user-id",
        host: "titus-chat.overnightdesk.com",
        transport: "websocket",
      },
      undefined,
      undefined,
    );
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ category: "success" }),
    );
    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
  });

  it("denies missing session, host, invalid transport, or membership", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    await expect(
      GET(request("titus-chat.overnightdesk.com")),
    ).resolves.toMatchObject({ status: 401 });

    await expect(GET(request())).resolves.toMatchObject({ status: 401 });
    await expect(
      GET(request("titus-chat.overnightdesk.com", "gopher")),
    ).resolves.toMatchObject({ status: 401 });

    mockAuthorizeEdge.mockResolvedValueOnce(false);
    await expect(
      GET(request("titus-chat.overnightdesk.com")),
    ).resolves.toMatchObject({ status: 401 });
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ category: "denied" }),
    );
  });

  it("fails closed when canonical authorization or audit storage is unavailable", async () => {
    mockAuthorizeEdge.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      GET(request("titus-chat.overnightdesk.com")),
    ).resolves.toMatchObject({ status: 401 });

    mockRecordAudit.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(
      GET(request("titus-chat.overnightdesk.com")),
    ).resolves.toMatchObject({ status: 401 });
  });
});
