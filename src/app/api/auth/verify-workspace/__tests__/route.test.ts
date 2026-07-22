import { NextRequest } from "next/server";

const mockGetSession = jest.fn();
const mockAuthorizeEdge = jest.fn();
const mockRecordAudit = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));
jest.mock("@/lib/open-webui-canonical-authorization", () => ({
  authorizeOpenWebuiCanonicalEdge: (...args: unknown[]) => mockAuthorizeEdge(...args),
}));
jest.mock("@/lib/open-webui-deployments", () => ({
  findOpenWebuiDeployment: (_selector: string, host: string) =>
    host === "titus-chat.overnightdesk.com"
      ? { deploymentId: "open-webui-hermes-titus" }
      : host === "walter-chat.overnightdesk.com"
        ? { deploymentId: "open-webui-hermes-walter" }
        : null,
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
    mockAuthorizeEdge.mockResolvedValue({
      authorized: true,
      deploymentId: "open-webui-hermes-titus",
    });
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

  it("uses the same canonical edge path for Walter with Walter-scoped audit metadata", async () => {
    mockAuthorizeEdge.mockResolvedValueOnce({
      authorized: true,
      deploymentId: "open-webui-hermes-walter",
    });

    await expect(
      GET(request("walter-chat.overnightdesk.com", "sse")),
    ).resolves.toMatchObject({ status: 200 });
    expect(mockAuthorizeEdge).toHaveBeenCalledWith(
      {
        userId: "gary-user-id",
        host: "walter-chat.overnightdesk.com",
        transport: "sse",
      },
      undefined,
      undefined,
    );
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "success",
        deploymentId: "open-webui-hermes-walter",
      }),
    );
  });

  it("bypasses Better Auth cookie cache for the current platform session", async () => {
    const currentRequest = request("titus-chat.overnightdesk.com");

    await expect(GET(currentRequest)).resolves.toMatchObject({ status: 200 });

    expect(mockGetSession).toHaveBeenCalledWith({
      headers: currentRequest.headers,
      query: { disableCookieCache: true },
    });
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

    mockAuthorizeEdge.mockResolvedValueOnce({ authorized: false });
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
