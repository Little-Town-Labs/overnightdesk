import { NextRequest } from "next/server";
import {
  createManagedVariablePostHandler,
  type ManagedVariableRouteDependencies,
} from "../handler";

const value = `sk-or-v1-${"a".repeat(40)}`;
const body = {
  agentKey: "example-agent",
  variableId: "openrouter_api_key",
  value,
  requestId: "018f6f54-8c2f-4a33-8f28-a7e73f4a3111",
  confirmation: "replace:openrouter_api_key:restart",
};
const agent = {
  key: "example-agent",
  useCaseId: "11111111-1111-4111-8111-111111111111",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
  runtime: { slug: "hermes-example", status: "active" as const },
  membershipRole: "owner" as const,
  identity: {
    name: "Example",
    logo: { src: "/agents/default-mark.svg", alt: "Example agent mark" },
  },
  useCaseName: "Example",
  workspace: null,
};
const instance = {
  runtimeIdentityId: agent.runtimeIdentityId,
  tenantId: "tenant-example",
};

function request(payload: unknown = body): NextRequest {
  return new NextRequest(
    "https://www.overnightdesk.com/api/settings/agent-variables",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://www.overnightdesk.com",
      },
      body: JSON.stringify(payload),
    },
  );
}

function dependencies(): jest.Mocked<ManagedVariableRouteDependencies> {
  return {
    getSession: jest.fn().mockResolvedValue({ user: { id: "owner-id" } }),
    checkRateLimit: jest.fn().mockReturnValue(true),
    resolveContext: jest.fn().mockResolvedValue({
      status: "available",
      agent,
      instance,
    }),
    resolveBoundary: jest.fn().mockResolvedValue({
      status: "ready",
      boundaryKind: "managed_variable_v1",
      boundaryId: "cdb9a259-7e99-4dd1-a023-bf2fa9e8c033",
    }),
    claimAttempt: jest.fn().mockResolvedValue("claimed"),
    recordOutcome: jest.fn().mockResolvedValue(undefined),
    replaceManagedVariable: jest.fn().mockResolvedValue({
      success: true,
      data: {
        requestId: body.requestId,
        variableId: body.variableId,
        outcome: "replaced",
        runtimeEffect: "restart",
        runtimeEffectStatus: "completed",
        replayed: false,
      },
    }),
  };
}

async function responseJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("POST /api/settings/agent-variables", () => {
  it("requires a current session", async () => {
    const deps = dependencies();
    deps.getSession.mockResolvedValue(null);
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({ status: 401, body: { error: { code: "UNAUTHORIZED" } } });
    expect(deps.resolveContext).not.toHaveBeenCalled();
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutation attempts", async () => {
    const deps = dependencies();
    const hostile = request();
    hostile.headers.set("origin", "https://attacker.example");
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(hostile),
    );

    expect(result).toMatchObject({ status: 403, body: { error: { code: "FORBIDDEN" } } });
    expect(deps.resolveContext).not.toHaveBeenCalled();
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...body, phaseApp: "attacker-app" }, "INVALID_REQUEST"],
    [{ ...body, secrets: { ARBITRARY_KEY: value } }, "INVALID_REQUEST"],
    [{ ...body, variableId: "arbitrary_key" }, "INVALID_REQUEST"],
    [{ ...body, confirmation: "replace:anything" }, "INVALID_REQUEST"],
  ])("rejects an inexact or unapproved request", async (payload, code) => {
    const deps = dependencies();
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request(payload)),
    );

    expect(result).toMatchObject({ status: 400, body: { error: { code } } });
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("maps an unexpected selected-agent authority failure to a safe response", async () => {
    const deps = dependencies();
    deps.resolveContext.mockRejectedValue(new Error("database unavailable"));
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({
      status: 503,
      body: { error: { code: "AUTHORITY_UNAVAILABLE" } },
    });
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized bodies", async () => {
    const deps = dependencies();
    const handler = createManagedVariablePostHandler(deps);
    const malformed = new NextRequest("https://www.overnightdesk.com/api/settings/agent-variables", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://www.overnightdesk.com" },
      body: "{",
    });
    const oversized = new NextRequest("https://www.overnightdesk.com/api/settings/agent-variables", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://www.overnightdesk.com" },
      body: JSON.stringify({ ...body, padding: "x".repeat(9_000) }),
    });

    expect((await responseJson(await handler(malformed))).status).toBe(400);
    expect((await responseJson(await handler(oversized))).status).toBe(400);
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404, "AGENT_NOT_FOUND"],
    ["empty", 404, "AGENT_NOT_FOUND"],
    ["unavailable", 503, "AUTHORITY_UNAVAILABLE"],
  ] as const)("fails closed for %s selected-agent resolution", async (status, http, code) => {
    const deps = dependencies();
    deps.resolveContext.mockResolvedValue({ status });
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({ status: http, body: { error: { code } } });
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("maps an unexpected boundary authority failure to a safe response", async () => {
    const deps = dependencies();
    deps.resolveBoundary.mockRejectedValue(new Error("database unavailable"));
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({
      status: 503,
      body: { error: { code: "AUTHORITY_UNAVAILABLE" } },
    });
    expect(deps.claimAttempt).not.toHaveBeenCalled();
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("reauthorizes the exact membership role", async () => {
    const deps = dependencies();
    deps.resolveContext.mockResolvedValue({
      status: "available",
      agent: { ...agent, membershipRole: "viewer" },
      instance,
    });
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({ status: 403, body: { error: { code: "FORBIDDEN" } } });
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("rejects an invalid value without echoing it", async () => {
    const deps = dependencies();
    const sentinel = "INVALID_DO_NOT_ECHO";
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request({ ...body, value: sentinel })),
    );

    expect(result).toMatchObject({ status: 422, body: { error: { code: "INVALID_VALUE" } } });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("rate limits before boundary or external work", async () => {
    const deps = dependencies();
    deps.checkRateLimit.mockReturnValue(false);
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({ status: 429, body: { error: { code: "RATE_LIMITED" } } });
    expect(deps.resolveBoundary).not.toHaveBeenCalled();
  });

  it.each([
    ["provisioner_unsupported", 423, "VARIABLE_UNAVAILABLE"],
    ["binding_ambiguous", 423, "VARIABLE_UNAVAILABLE"],
    ["authority_unavailable", 503, "AUTHORITY_UNAVAILABLE"],
  ] as const)("makes zero writes when the boundary is %s", async (reason, http, code) => {
    const deps = dependencies();
    deps.resolveBoundary.mockResolvedValue({ status: "unavailable", reason });
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({ status: http, body: { error: { code } } });
    expect(deps.claimAttempt).not.toHaveBeenCalled();
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("rejects duplicate request IDs before external work", async () => {
    const deps = dependencies();
    deps.claimAttempt.mockResolvedValue("duplicate");
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({ status: 409, body: { error: { code: "DUPLICATE_REQUEST" } } });
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("honors the durable audit-backed rate limit before external work", async () => {
    const deps = dependencies();
    deps.claimAttempt.mockResolvedValue("rate_limited");
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({ status: 429, body: { error: { code: "RATE_LIMITED" } } });
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("fails closed when the attempt audit cannot be persisted", async () => {
    const deps = dependencies();
    deps.claimAttempt.mockRejectedValue(new Error("audit unavailable"));
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({ status: 503, body: { error: { code: "AUTHORITY_UNAVAILABLE" } } });
    expect(deps.replaceManagedVariable).not.toHaveBeenCalled();
  });

  it("maps external write failure without returning the submitted value", async () => {
    const deps = dependencies();
    deps.replaceManagedVariable.mockResolvedValue({
      success: false,
      status: 502,
      code: "NETWORK_FAILURE",
    });
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({ status: 502, body: { error: { code: "SECRET_WRITE_FAILED" } } });
    expect(JSON.stringify(result)).not.toContain(value);
  });

  it("reports the provisioner's typed partial success", async () => {
    const deps = dependencies();
    deps.replaceManagedVariable.mockResolvedValue({
      success: false,
      status: 502,
      code: "RUNTIME_EFFECT_FAILED",
      data: {
        requestId: body.requestId,
        variableId: body.variableId,
        outcome: "replaced",
        runtimeEffect: "restart",
        runtimeEffectStatus: "failed",
        replayed: false,
      },
    });
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({
      status: 502,
      body: {
        success: false,
        error: { code: "RUNTIME_EFFECT_FAILED" },
        data: {
          variableId: "openrouter_api_key",
          outcome: "replaced",
          runtimeEffect: "restart",
          runtimeEffectStatus: "failed",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain(value);
  });

  it("preserves manual-recovery guidance when partial-success audit fails", async () => {
    const deps = dependencies();
    deps.replaceManagedVariable.mockResolvedValue({
      success: false,
      status: 502,
      code: "RUNTIME_EFFECT_FAILED",
      data: {
        requestId: body.requestId,
        variableId: body.variableId,
        outcome: "replaced",
        runtimeEffect: "restart",
        runtimeEffectStatus: "failed",
        replayed: false,
      },
    });
    deps.recordOutcome.mockRejectedValue(new Error("audit unavailable"));
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(result).toMatchObject({
      status: 503,
      body: {
        error: { code: "AUTHORITY_UNAVAILABLE" },
        data: {
          outcome: "replaced_unconfirmed",
          runtimeEffectStatus: "failed",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain(value);
  });

  it("calls the typed provisioner once and returns a value-free success", async () => {
    const deps = dependencies();
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(deps.replaceManagedVariable).toHaveBeenCalledWith({
      requestId: body.requestId,
      boundaryId: "cdb9a259-7e99-4dd1-a023-bf2fa9e8c033",
      variableId: "openrouter_api_key",
      value,
    });
    expect(deps.recordOutcome).toHaveBeenCalledWith(
      expect.not.objectContaining({ value: expect.anything() }),
    );
    expect(result).toMatchObject({
      status: 200,
      body: {
        success: true,
        data: {
          variableId: "openrouter_api_key",
          outcome: "replaced",
          runtimeEffect: "restart",
          runtimeEffectStatus: "completed",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain(value);
  });

  it("does not claim success when outcome audit persistence fails", async () => {
    const deps = dependencies();
    deps.recordOutcome.mockRejectedValue(new Error("audit unavailable"));
    const result = await responseJson(
      await createManagedVariablePostHandler(deps)(request()),
    );

    expect(deps.replaceManagedVariable).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 503, body: { error: { code: "AUTHORITY_UNAVAILABLE" } } });
    expect(JSON.stringify(result)).not.toContain(value);
  });
});
