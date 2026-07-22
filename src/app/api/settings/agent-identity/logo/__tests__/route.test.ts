import { NextRequest } from "next/server";
import {
  createAgentPersonaLogoDeleteHandler,
  createAgentPersonaLogoPostHandler,
  type AgentPersonaLogoMutationDependencies,
} from "../handler";

const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function dependencies(): jest.Mocked<AgentPersonaLogoMutationDependencies> {
  return {
    getSession: jest.fn().mockResolvedValue({ user: { id: "owner-id" } }),
    checkRateLimit: jest.fn().mockReturnValue(true),
    replaceLogo: jest.fn().mockResolvedValue("updated"),
    removeLogo: jest.fn().mockResolvedValue("updated"),
  };
}

function uploadRequest({
  bytes = png,
  contentType = "image/png",
  origin = "https://www.overnightdesk.com",
  runtimeId = runtimeIdentityId,
}: {
  bytes?: Uint8Array;
  contentType?: string;
  origin?: string;
  runtimeId?: string;
} = {}): NextRequest {
  const form = new FormData();
  form.set("runtimeIdentityId", runtimeId);
  form.set(
    "logo",
    new File([Uint8Array.from(bytes).buffer], "untrusted-name.png", {
      type: contentType,
    }),
  );
  return new NextRequest(
    "https://www.overnightdesk.com/api/settings/agent-identity/logo",
    {
      method: "POST",
      headers: { "content-length": "300", origin },
      body: form,
    },
  );
}

function deleteRequest({
  origin = "https://www.overnightdesk.com",
  runtimeId = runtimeIdentityId,
}: {
  origin?: string;
  runtimeId?: string;
} = {}): NextRequest {
  return new NextRequest(
    "https://www.overnightdesk.com/api/settings/agent-identity/logo",
    {
      method: "DELETE",
      headers: {
        "content-length": String(
          Buffer.byteLength(JSON.stringify({ runtimeIdentityId: runtimeId })),
        ),
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({ runtimeIdentityId: runtimeId }),
    },
  );
}

describe("agent persona logo mutation", () => {
  it("requires an authenticated session before reading a multipart body", async () => {
    const deps = dependencies();
    deps.getSession.mockResolvedValue(null);
    const response = await createAgentPersonaLogoPostHandler(deps)(uploadRequest());

    expect(response.status).toBe(401);
    expect(deps.replaceLogo).not.toHaveBeenCalled();
  });

  it("rejects cross-origin upload and removal", async () => {
    const deps = dependencies();
    const post = await createAgentPersonaLogoPostHandler(deps)(
      uploadRequest({ origin: "https://attacker.example" }),
    );
    const remove = await createAgentPersonaLogoDeleteHandler(deps)(
      deleteRequest({ origin: "https://attacker.example" }),
    );

    expect(post.status).toBe(403);
    expect(remove.status).toBe(403);
    expect(deps.replaceLogo).not.toHaveBeenCalled();
    expect(deps.removeLogo).not.toHaveBeenCalled();
  });

  it("requires a bounded content length before parsing a mutation body", async () => {
    const deps = dependencies();
    const request = uploadRequest();
    request.headers.delete("content-length");
    const response = await createAgentPersonaLogoPostHandler(deps)(request);

    expect(response.status).toBe(400);
    expect(deps.replaceLogo).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", Uint8Array.from([0xff, 0xd8, 0xff])],
    ["image/svg+xml", new TextEncoder().encode("<svg/>")],
    ["text/html", new TextEncoder().encode("<script/>")],
  ])("rejects unsafe or mismatched %s without a write", async (contentType, bytes) => {
    const deps = dependencies();
    const response = await createAgentPersonaLogoPostHandler(deps)(
      uploadRequest({ contentType, bytes }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "INVALID_LOGO" },
    });
    expect(deps.replaceLogo).not.toHaveBeenCalled();
  });

  it("rejects an oversized upload without a write", async () => {
    const deps = dependencies();
    const response = await createAgentPersonaLogoPostHandler(deps)(
      uploadRequest({ bytes: new Uint8Array(256 * 1024 + 1) }),
    );

    expect(response.status).toBe(400);
    expect(deps.replaceLogo).not.toHaveBeenCalled();
  });

  it("rate limits before reading authority or storage", async () => {
    const deps = dependencies();
    deps.checkRateLimit.mockReturnValue(false);
    const response = await createAgentPersonaLogoPostHandler(deps)(uploadRequest());

    expect(response.status).toBe(429);
    expect(deps.replaceLogo).not.toHaveBeenCalled();
  });

  it("passes only verified bytes and value-free metadata to exact-owner storage", async () => {
    const deps = dependencies();
    const response = await createAgentPersonaLogoPostHandler(deps)(uploadRequest());
    const payload = await response.json();

    expect(deps.replaceLogo).toHaveBeenCalledWith({
      actorUserId: "owner-id",
      runtimeIdentityId,
      logo: {
        contentType: "image/png",
        dataBase64: Buffer.from(png).toString("base64"),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        size: png.byteLength,
      },
    });
    expect(payload).toEqual({ success: true });
    expect(JSON.stringify(payload)).not.toContain("untrusted-name");
  });

  it.each(["forbidden", "unavailable"] as const)(
    "fails closed when exact-owner storage returns %s",
    async (outcome) => {
      const deps = dependencies();
      deps.replaceLogo.mockResolvedValue(outcome);
      const response = await createAgentPersonaLogoPostHandler(deps)(uploadRequest());

      expect(response.status).toBe(outcome === "forbidden" ? 403 : 503);
      expect(await response.json()).toMatchObject({ success: false });
    },
  );

  it("removes only the exact runtime logo and returns no presentation data", async () => {
    const deps = dependencies();
    const response = await createAgentPersonaLogoDeleteHandler(deps)(deleteRequest());

    expect(deps.removeLogo).toHaveBeenCalledWith({
      actorUserId: "owner-id",
      runtimeIdentityId,
    });
    expect(await response.json()).toEqual({ success: true });
  });

  it("rejects malformed runtime identifiers before storage", async () => {
    const deps = dependencies();
    const post = await createAgentPersonaLogoPostHandler(deps)(
      uploadRequest({ runtimeId: "../walter" }),
    );
    const remove = await createAgentPersonaLogoDeleteHandler(deps)(
      deleteRequest({ runtimeId: "../walter" }),
    );

    expect(post.status).toBe(400);
    expect(remove.status).toBe(400);
    expect(deps.replaceLogo).not.toHaveBeenCalled();
    expect(deps.removeLogo).not.toHaveBeenCalled();
  });
});
