import { NextRequest } from "next/server";
import {
  createAgentPersonaLogoGetHandler,
  type AgentPersonaLogoReadDependencies,
} from "../handler";

const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";
const digest = "a".repeat(64);
const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

function dependencies(): jest.Mocked<AgentPersonaLogoReadDependencies> {
  return {
    readLogo: jest.fn().mockResolvedValue({ contentType: "image/png", bytes }),
  };
}

function context(runtimeId = runtimeIdentityId, sha256 = digest) {
  return { params: Promise.resolve({ runtimeIdentityId: runtimeId, digest: sha256 }) };
}

describe("GET /api/agent-identity/runtime/:runtimeIdentityId/logo/:digest", () => {
  it("serves only the exact active digest as immutable nosniff raster media", async () => {
    const deps = dependencies();
    const response = await createAgentPersonaLogoGetHandler(deps)(
      new NextRequest(
        `https://www.overnightdesk.com/api/agent-identity/runtime/${runtimeIdentityId}/logo/${digest}`,
      ),
      context(),
    );

    expect(deps.readLogo).toHaveBeenCalledWith({ runtimeIdentityId, sha256: digest });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it.each([
    ["../walter", digest],
    [runtimeIdentityId, "../logo"],
    [runtimeIdentityId, "A".repeat(64)],
  ])("rejects malformed identity %s / %s before storage", async (runtimeId, sha256) => {
    const deps = dependencies();
    const response = await createAgentPersonaLogoGetHandler(deps)(
      new NextRequest(
        "https://www.overnightdesk.com/api/agent-identity/runtime/invalid/logo/invalid",
      ),
      context(runtimeId, sha256),
    );

    expect(response.status).toBe(404);
    expect(deps.readLogo).not.toHaveBeenCalled();
  });

  it("returns an indistinguishable 404 when the active presentation is absent", async () => {
    const deps = dependencies();
    deps.readLogo.mockResolvedValue(null);
    const response = await createAgentPersonaLogoGetHandler(deps)(
      new NextRequest(
        `https://www.overnightdesk.com/api/agent-identity/runtime/${runtimeIdentityId}/logo/${digest}`,
      ),
      context(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("fails closed when presentation storage is unavailable", async () => {
    const deps = dependencies();
    deps.readLogo.mockRejectedValue(new Error("database unavailable"));
    const response = await createAgentPersonaLogoGetHandler(deps)(
      new NextRequest(
        `https://www.overnightdesk.com/api/agent-identity/runtime/${runtimeIdentityId}/logo/${digest}`,
      ),
      context(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
