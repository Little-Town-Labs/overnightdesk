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

type ProvisionerResult = { success: boolean; error?: string };

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
  writeSecrets(input: {
    tenantId: string;
    secrets: Record<string, string>;
  }): Promise<ProvisionerResult>;
  restart(tenantId: string): Promise<ProvisionerResult>;
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
  async writeSecrets(input) {
    const { provisionerClient } = await import("@/lib/provisioner");
    return provisionerClient.writeSecrets(input);
  },
  async restart(tenantId) {
    const { provisionerClient } = await import("@/lib/provisioner");
    return provisionerClient.restart(tenantId);
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

    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin) {
      return errorResponse(403, "FORBIDDEN", "Cross-origin mutation is not allowed.");
    }

    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return errorResponse(400, "INVALID_REQUEST", "A JSON request body is required.");
    }

    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return errorResponse(400, "INVALID_REQUEST", "The request body could not be read.");
    }
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return errorResponse(400, "INVALID_REQUEST", "The request body is too large.");
    }

    let unknownBody: unknown;
    try {
      unknownBody = JSON.parse(rawBody);
    } catch {
      return errorResponse(400, "INVALID_REQUEST", "The request body is not valid JSON.");
    }
    const parsed = requestSchema.safeParse(unknownBody);
    if (!parsed.success) {
      return errorResponse(400, "INVALID_REQUEST", "The request body is invalid.");
    }

    const definition = getManagedVariableDefinition(parsed.data.variableId);
    if (!definition || parsed.data.confirmation !== definition.confirmation) {
      return errorResponse(400, "INVALID_REQUEST", "The variable or confirmation is invalid.");
    }

    let context: ManagedVariableContextResolution;
    try {
      context = await dependencies.resolveContext(
        session.user.id,
        parsed.data.agentKey,
      );
    } catch {
      return errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "Agent authorization is temporarily unavailable.",
      );
    }
    if (context.status === "unavailable") {
      return errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "Agent authorization is temporarily unavailable.",
      );
    }
    if (context.status !== "available") {
      return errorResponse(404, "AGENT_NOT_FOUND", "The selected agent was not found.");
    }

    if (!definition.allowedRoles.includes(context.agent.membershipRole)) {
      return errorResponse(403, "FORBIDDEN", "You cannot replace this variable.");
    }

    const validation = validateManagedVariableValue(definition, parsed.data.value);
    if (!validation.ok) {
      return errorResponse(422, "INVALID_VALUE", validation.message);
    }

    if (!dependencies.checkRateLimit(session.user.id)) {
      return errorResponse(
        429,
        "RATE_LIMITED",
        "Too many replacement attempts. Try again later.",
      );
    }

    let boundary: ManagedVariableBoundaryResolution;
    try {
      boundary = await dependencies.resolveBoundary({
        agent: context.agent,
        definition,
        instance: context.instance,
      });
    } catch {
      return errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "The configuration authority is temporarily unavailable.",
      );
    }
    if (boundary.status !== "ready") {
      if (boundary.reason === "authority_unavailable") {
        return errorResponse(
          503,
          "AUTHORITY_UNAVAILABLE",
          "The configuration authority is temporarily unavailable.",
        );
      }
      return errorResponse(
        423,
        "VARIABLE_UNAVAILABLE",
        "Replacement is not enabled for this agent boundary.",
      );
    }

    const auditBase = {
      actorId: session.user.id,
      useCaseId: context.agent.useCaseId,
      runtimeIdentityId: context.agent.runtimeIdentityId,
      variableId: definition.id,
      requestId: parsed.data.requestId,
    } as const;

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
    if (claim === "rate_limited") {
      return errorResponse(
        429,
        "RATE_LIMITED",
        "Too many replacement attempts. Try again later.",
      );
    }

    const writeResult = await dependencies.writeSecrets({
      tenantId: boundary.tenantId,
      secrets: { [definition.phaseKey]: parsed.data.value },
    });
    if (!writeResult.success) {
      try {
        await dependencies.recordOutcome({
          ...auditBase,
          stage: "outcome",
          outcome: "write_failed",
          reason: "external_failure",
        });
      } catch {
        return errorResponse(503, "AUTHORITY_UNAVAILABLE", "The audit authority is temporarily unavailable.");
      }
      return errorResponse(502, "SECRET_WRITE_FAILED", "The replacement could not be completed.");
    }

    if (definition.runtimeEffect === "restart") {
      const restartResult = await dependencies.restart(boundary.tenantId);
      if (!restartResult.success) {
        try {
          await dependencies.recordOutcome({
            ...auditBase,
            stage: "outcome",
            outcome: "runtime_effect_failed",
            reason: "runtime_effect_failure",
          });
        } catch {
          return errorResponse(
            503,
            "AUTHORITY_UNAVAILABLE",
            "The value was replaced and the restart failed, but the audit outcome could not be confirmed. Restart the agent manually.",
            {
              variableId: definition.id,
              outcome: "replaced_unconfirmed",
              runtimeEffect: definition.runtimeEffect,
              runtimeEffectStatus: "failed",
            },
          );
        }
        return errorResponse(
          502,
          "RUNTIME_EFFECT_FAILED",
          "The value was replaced, but the runtime restart failed. Restart the agent manually.",
          {
            variableId: definition.id,
            outcome: "replaced",
            runtimeEffect: definition.runtimeEffect,
            runtimeEffectStatus: "failed",
          },
        );
      }
    }

    try {
      await dependencies.recordOutcome({
        ...auditBase,
        stage: "outcome",
        outcome: "replaced",
      });
    } catch {
      return errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "The replacement completed, but its audit outcome could not be confirmed.",
        {
          variableId: definition.id,
          outcome: "replaced_unconfirmed",
          runtimeEffect: definition.runtimeEffect,
          runtimeEffectStatus: "completed",
        },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        variableId: definition.id as ManagedVariableId,
        outcome: "replaced",
        runtimeEffect: definition.runtimeEffect,
        runtimeEffectStatus: "completed",
      },
    });
  };
}
