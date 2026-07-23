import { NextRequest } from "next/server";
import {
  createAgentPersonaLogoPointerHandler,
  type AgentPersonaLogoPointerDependencies,
} from "../handler";

const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";
const digest = "a".repeat(64);

function dependencies(): jest.Mocked<AgentPersonaLogoPointerDependencies> {
  return {
    resolveLogoPointer: jest.fn().mockResolvedValue({
      runtimeIdentityId,
      sha256: digest,
    }),
  };
}

function context(personaKey = "titus") {
  return { params: Promise.resolve({ personaKey }) };
}

describe("GET /api/agent-identity/:personaKey/logo", () => {
  it("redirects a custom logo to its immutable digest address", async () => {
    const deps = dependencies();
    const response = await createAgentPersonaLogoPointerHandler(deps)(
      new NextRequest("https://www.overnightdesk.com/api/agent-identity/titus/logo"),
      context(),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("location")).toBe(
      `https://www.overnightdesk.com/api/agent-identity/runtime/${runtimeIdentityId}/logo/${digest}`,
    );
  });

  it.each([
    ["titus", "/agents/titus-mark.svg"],
    ["walter", "/agents/walter-mark.svg"],
  ])("redirects %s to its default mark when no custom logo exists", async (key, mark) => {
    const deps = dependencies();
    deps.resolveLogoPointer.mockResolvedValue({
      runtimeIdentityId,
      sha256: null,
    });
    const response = await createAgentPersonaLogoPointerHandler(deps)(
      new NextRequest(`https://www.overnightdesk.com/api/agent-identity/${key}/logo`),
      context(key),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://www.overnightdesk.com${mark}`);
  });

  it.each(["../walter", "Titus", "unknown"]) (
    "fails closed for an unsupported persona key: %s",
    async (personaKey) => {
      const deps = dependencies();
      const response = await createAgentPersonaLogoPointerHandler(deps)(
        new NextRequest("https://www.overnightdesk.com/api/agent-identity/invalid/logo"),
        context(personaKey),
      );

      expect(response.status).toBe(404);
      expect(deps.resolveLogoPointer).not.toHaveBeenCalled();
    },
  );

  it("returns an indistinguishable 404 for absent or ambiguous active identity data", async () => {
    const deps = dependencies();
    deps.resolveLogoPointer.mockResolvedValue(null);
    const response = await createAgentPersonaLogoPointerHandler(deps)(
      new NextRequest("https://www.overnightdesk.com/api/agent-identity/titus/logo"),
      context(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
