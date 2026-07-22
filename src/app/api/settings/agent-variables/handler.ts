import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type {
  ManagedVariableBoundaryResolution,
} from "@/db/managed-agent-variable-boundary";
import {
  getManagedVariableDefinition,
  validateManagedVariableValue,
  type ManagedVariableDefinition,
  type ManagedVariableId,
} from "@/lib/managed-agent-variable";
import type { ManagedVariableAuditEvent } from "@/lib/managed-agent-variable-audit";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import type {
  ManagedVariableReplacementParams,
  ManagedVariableReplacementResult,
} from "@/lib/provisioner";

const MAX_BODY_BYTES = 8_192;
const requestSchema = z
  .object({
    agentKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    variableId: z.enum([
      "openrouter_api_key",
      "telegram_bot_token",
      "telegram_allowed_users",
    ]),
    value: z.string().min(1).max(512),
    requestId: z.string().uuid(),
    confirmation: z.string().min(1).max(128),
  })
  .strict();

type ManagedVariableRequest = z.infer<typeof requestSchema>;
type RouteStep<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse };

type MutationInstance = {
  runtimeIdentityId: string | null;
  tenantId: string;
};

type ManagedVariableContextResolution =
  | {
      status: "available";
      agent: AgentDirectoryEntry;
      instance: MutationInstance | null;
    }
  | { status: "empty" | "not_found" | "unavailable" };

type AvailableManagedVariableContext = Extract<
  ManagedVariableContextResolution,
  { status: "available" }
>;

export interface ManagedVariableRouteDependencies {
  getSession(request: NextRequest): Promise<{ user: { id: string } } | null>;
  checkRateLimit(userId: string): boolean;
  resolveContext(
    userId: string,
    agentKey: string,
  ): Promise<ManagedVariableContextResolution>;
  resolveBoundary(input: {
    agent: AgentDirectoryEntry;
    definition: ManagedVariableDefinition;
    instance: MutationInstance | null;
  }): Promise<ManagedVariableBoundaryResolution>;
  claimAttempt(
    event: Omit<ManagedVariableAuditEvent, "stage" | "outcome">,
  ): Promise<"claimed" | "duplicate" | "rate_limited">;
  recordOutcome(event: ManagedVariableAuditEvent): Promise<void>;
  replaceManagedVariable(
    input: ManagedVariableReplacementParams,
  ): Promise<ManagedVariableReplacementResult>;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  data?: Record<string, unknown>,
) {
  return NextResponse.json(
    { success: false, error: { code, message }, ...(data ? { data } : {}) },
    { status },
  );
}

const rateLimitState = globalThis as typeof globalThis & {
  __managedVariableReplacementTimestamps?: Map<string, number[]>;
};
const replacementTimestamps =
  rateLimitState.__managedVariableReplacementTimestamps ?? new Map<string, number[]>();
rateLimitState.__managedVariableReplacementTimestamps = replacementTimestamps;

function checkManagedVariableRateLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (replacementTimestamps.get(userId) ?? []).filter(
    (timestamp) => now - timestamp < 10 * 60_000,
  );
  if (replacementTimestamps.size > 10_000) replacementTimestamps.clear();
  if (recent.length >= 3) {
    replacementTimestamps.set(userId, recent);
    return false;
  }
  recent.push(now);
  replacementTimestamps.set(userId, recent);
  return true;
}

function validateMutationRequestMetadata(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return errorResponse(
      403,
      "FORBIDDEN",
      "Cross-origin mutation is not allowed.",
    );
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "A JSON request body is required.",
    );
  }
  return null;
}

async function readBoundedJsonBody(
  request: NextRequest,
): Promise<RouteStep<unknown>> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return {
      ok: false,
      response: errorResponse(
        400,
        "INVALID_REQUEST",
        "The request body could not be read.",
      ),
    };
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: errorResponse(400, "INVALID_REQUEST", "The request body is too large."),
    };
  }

  try {
    return { ok: true, value: JSON.parse(rawBody) };
  } catch {
    return {
      ok: false,
      response: errorResponse(400, "INVALID_REQUEST", "The request body is not valid JSON."),
    };
  }
}

async function parseManagedVariableRequest(
  request: NextRequest,
): Promise<RouteStep<ManagedVariableRequest>> {
  const metadataError = validateMutationRequestMetadata(request);
  if (metadataError) return { ok: false, response: metadataError };

  const body = await readBoundedJsonBody(request);
  if (!body.ok) return body;
  const parsed = requestSchema.safeParse(body.value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        response: errorResponse(
          400,
          "INVALID_REQUEST",
          "The request body is invalid.",
        ),
      };
}

async function resolveMutationContext(
  dependencies: ManagedVariableRouteDependencies,
  userId: string,
  agentKey: string,
): Promise<RouteStep<AvailableManagedVariableContext>> {
  let context: ManagedVariableContextResolution;
  try {
    context = await dependencies.resolveContext(userId, agentKey);
  } catch {
    return {
      ok: false,
      response: errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "Agent authorization is temporarily unavailable.",
      ),
    };
  }
  if (context.status === "unavailable") {
    return {
      ok: false,
      response: errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "Agent authorization is temporarily unavailable.",
      ),
    };
  }
  return context.status === "available"
    ? { ok: true, value: context }
    : {
        ok: false,
        response: errorResponse(
          404,
          "AGENT_NOT_FOUND",
          "The selected agent was not found.",
        ),
      };
}

async function resolveMutationBoundary(
  dependencies: ManagedVariableRouteDependencies,
  context: AvailableManagedVariableContext,
  definition: ManagedVariableDefinition,
): Promise<
  RouteStep<Extract<ManagedVariableBoundaryResolution, { status: "ready" }>>
> {
  let boundary: ManagedVariableBoundaryResolution;
  try {
    boundary = await dependencies.resolveBoundary({
      agent: context.agent,
      definition,
      instance: context.instance,
    });
  } catch {
    return {
      ok: false,
      response: errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "The configuration authority is temporarily unavailable.",
      ),
    };
  }
  if (boundary.status === "ready") return { ok: true, value: boundary };
  return {
    ok: false,
    response:
      boundary.reason === "authority_unavailable"
        ? errorResponse(
            503,
            "AUTHORITY_UNAVAILABLE",
            "The configuration authority is temporarily unavailable.",
          )
        : errorResponse(
            423,
            "VARIABLE_UNAVAILABLE",
            "Replacement is not enabled for this agent boundary.",
          ),
  };
}

async function claimMutationAttempt(
  dependencies: ManagedVariableRouteDependencies,
  auditBase: Omit<ManagedVariableAuditEvent, "stage" | "outcome">,
): Promise<NextResponse | null> {
  let claim: "claimed" | "duplicate" | "rate_limited";
  try {
    claim = await dependencies.claimAttempt(auditBase);
  } catch {
    return errorResponse(
      503,
      "AUTHORITY_UNAVAILABLE",
      "The audit authority is temporarily unavailable.",
    );
  }
  if (claim === "duplicate") {
    return errorResponse(
      409,
      "DUPLICATE_REQUEST",
      "This replacement request was already accepted.",
    );
  }
  return claim === "rate_limited"
    ? errorResponse(429, "RATE_LIMITED", "Too many replacement attempts. Try again later.")
    : null;
}

async function recordOutcome(
  dependencies: ManagedVariableRouteDependencies,
  event: ManagedVariableAuditEvent,
): Promise<boolean> {
  try {
    await dependencies.recordOutcome(event);
    return true;
  } catch {
    return false;
  }
}

async function writeFailureResponse(
  dependencies: ManagedVariableRouteDependencies,
  auditBase: Omit<ManagedVariableAuditEvent, "stage" | "outcome">,
  code: Extract<ManagedVariableReplacementResult, { success: false }>["code"],
): Promise<NextResponse> {
  const recorded = await recordOutcome(dependencies, {
    ...auditBase,
    stage: "outcome",
    outcome: "write_failed",
    reason: "external_failure",
  });
  if (!recorded) {
    return errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "The audit authority is temporarily unavailable.",
      );
  }
  switch (code) {
    case "BOUNDARY_NOT_FOUND":
    case "BOUNDARY_DISABLED":
      return errorResponse(
        423,
        "VARIABLE_UNAVAILABLE",
        "Replacement is not enabled for this agent boundary.",
      );
    case "RATE_LIMITED":
      return errorResponse(
        429,
        "RATE_LIMITED",
        "Too many replacement attempts. Try again later.",
      );
    case "INVALID_VALUE":
      return errorResponse(
        422,
        "INVALID_VALUE",
        "The replacement value was rejected.",
      );
    case "STATE_UNAVAILABLE":
      return errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "The configuration authority is temporarily unavailable.",
      );
    default:
      return errorResponse(
        502,
        "SECRET_WRITE_FAILED",
        "The replacement could not be completed.",
      );
  }
}

async function runtimeEffectFailureResponse(
  dependencies: ManagedVariableRouteDependencies,
  definition: ManagedVariableDefinition,
  auditBase: Omit<ManagedVariableAuditEvent, "stage" | "outcome">,
): Promise<NextResponse> {
  const recorded = await recordOutcome(dependencies, {
    ...auditBase,
    stage: "outcome",
    outcome: "runtime_effect_failed",
    reason: "runtime_effect_failure",
  });
  const data = {
    variableId: definition.id,
    outcome: recorded ? "replaced" : "replaced_unconfirmed",
    runtimeEffect: definition.runtimeEffect,
    runtimeEffectStatus: "failed",
  };
  return recorded
    ? errorResponse(
        502,
        "RUNTIME_EFFECT_FAILED",
        "The value was replaced, but the runtime restart failed. Restart the agent manually.",
        data,
      )
    : errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "The value was replaced and the restart failed, but the audit outcome could not be confirmed. Restart the agent manually.",
        data,
      );
}

async function completeMutation(
  dependencies: ManagedVariableRouteDependencies,
  definition: ManagedVariableDefinition,
  auditBase: Omit<ManagedVariableAuditEvent, "stage" | "outcome">,
): Promise<NextResponse> {
  const recorded = await recordOutcome(dependencies, {
    ...auditBase,
    stage: "outcome",
    outcome: "replaced",
  });
  const data = {
    variableId: definition.id as ManagedVariableId,
    outcome: recorded ? "replaced" : "replaced_unconfirmed",
    runtimeEffect: definition.runtimeEffect,
    runtimeEffectStatus: "completed",
  };
  return recorded
    ? NextResponse.json({ success: true, data })
    : errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "The replacement completed, but its audit outcome could not be confirmed.",
        data,
      );
}

async function executeMutation(
  dependencies: ManagedVariableRouteDependencies,
  actorId: string,
  request: ManagedVariableRequest,
  context: AvailableManagedVariableContext,
  definition: ManagedVariableDefinition,
  boundary: Extract<ManagedVariableBoundaryResolution, { status: "ready" }>,
): Promise<NextResponse> {
  const auditBase = {
    actorId,
    useCaseId: context.agent.useCaseId,
    runtimeIdentityId: context.agent.runtimeIdentityId,
    variableId: definition.id,
    requestId: request.requestId,
  } satisfies Omit<ManagedVariableAuditEvent, "stage" | "outcome">;

  const claimResponse = await claimMutationAttempt(dependencies, auditBase);
  if (claimResponse) return claimResponse;

  const replacement = await dependencies.replaceManagedVariable({
    requestId: request.requestId,
    boundaryId: boundary.boundaryId,
    variableId: definition.id,
    value: request.value,
  });
  if (!replacement.success) {
    if (
      replacement.code === "RUNTIME_EFFECT_FAILED" &&
      replacement.data?.outcome === "replaced" &&
      replacement.data.runtimeEffectStatus === "failed"
    ) {
      return runtimeEffectFailureResponse(dependencies, definition, auditBase);
    }
    return writeFailureResponse(dependencies, auditBase, replacement.code);
  }
  return completeMutation(dependencies, definition, auditBase);
}

async function processManagedVariableRequest(
  dependencies: ManagedVariableRouteDependencies,
  actorId: string,
  request: ManagedVariableRequest,
): Promise<NextResponse> {
  const definition = getManagedVariableDefinition(request.variableId);
  if (!definition || request.confirmation !== definition.confirmation) {
    return errorResponse(400, "INVALID_REQUEST", "The variable or confirmation is invalid.");
  }

  const context = await resolveMutationContext(
    dependencies,
    actorId,
    request.agentKey,
  );
  if (!context.ok) return context.response;
  if (!definition.allowedRoles.includes(context.value.agent.membershipRole)) {
    return errorResponse(403, "FORBIDDEN", "You cannot replace this variable.");
  }

  const validation = validateManagedVariableValue(definition, request.value);
  if (!validation.ok) return errorResponse(422, "INVALID_VALUE", validation.message);
  if (!dependencies.checkRateLimit(actorId)) {
    return errorResponse(
      429,
      "RATE_LIMITED",
      "Too many replacement attempts. Try again later.",
    );
  }

  const boundary = await resolveMutationBoundary(
    dependencies,
    context.value,
    definition,
  );
  if (!boundary.ok) return boundary.response;
  return executeMutation(
    dependencies,
    actorId,
    request,
    context.value,
    definition,
    boundary.value,
  );
}

export const defaultManagedVariableDependencies: ManagedVariableRouteDependencies = {
  async getSession(request) {
    const { auth } = await import("@/lib/auth");
    return auth.api.getSession({ headers: request.headers });
  },
  checkRateLimit: checkManagedVariableRateLimit,
  async resolveContext(userId, agentKey) {
    const [database, schema, drizzle, workspace, context] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/lib/open-webui-workspace"),
      import("@/lib/selected-agent-context"),
    ]);
    const [instances, directory] = await Promise.all([
      database.db
        .select()
        .from(schema.instance)
        .where(drizzle.eq(schema.instance.userId, userId)),
      workspace.resolveAgentDirectory(userId),
    ]);
    const resolution = context.resolveSelectedAgentContext(
      directory,
      agentKey,
      instances,
    );
    if (resolution.status !== "available") return { status: resolution.status };
    return {
      status: "available",
      agent: resolution.selected.agent,
      instance: resolution.selected.instance,
    };
  },
  async resolveBoundary(input) {
    const boundary = await import("@/db/managed-agent-variable-boundary");
    return boundary.resolveManagedAgentVariableBoundary(input);
  },
  async claimAttempt(event) {
    const audit = await import("@/lib/managed-agent-variable-audit");
    return audit.claimManagedVariableAttempt(event);
  },
  async recordOutcome(event) {
    const audit = await import("@/lib/managed-agent-variable-audit");
    return audit.recordManagedVariableAuditEvent(event);
  },
  async replaceManagedVariable(input) {
    const { provisionerClient } = await import("@/lib/provisioner");
    return provisionerClient.replaceManagedVariable(input);
  },
};

export function createManagedVariablePostHandler(
  dependencies: ManagedVariableRouteDependencies,
) {
  return async function managedVariablePost(request: NextRequest) {
    const session = await dependencies.getSession(request);
    if (!session) {
      return errorResponse(401, "UNAUTHORIZED", "Unauthorized");
    }
    const parsed = await parseManagedVariableRequest(request);
    return parsed.ok
      ? processManagedVariableRequest(dependencies, session.user.id, parsed.value)
      : parsed.response;
  };
}
