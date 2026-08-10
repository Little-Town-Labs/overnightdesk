import { getCanonicalServiceOrigin } from "@/lib/config";
import { z } from "zod";

export interface ManagedVariableReplacementParams {
  requestId: string;
  boundaryId: string;
  variableId:
    | "openrouter_api_key"
    | "telegram_bot_token"
    | "telegram_allowed_users";
  value: string;
}

const managedVariableDataSchema = z
  .object({
    requestId: z.string().uuid(),
    variableId: z.enum([
      "openrouter_api_key",
      "telegram_bot_token",
      "telegram_allowed_users",
    ]),
    outcome: z.literal("replaced"),
    runtimeEffect: z.enum(["none", "restart"]),
    runtimeEffectStatus: z.enum(["not_required", "completed", "failed"]),
    replayed: z.boolean(),
  })
  .strict();

const managedVariableSuccessSchema = z
  .object({
    success: z.literal(true),
    data: managedVariableDataSchema,
  })
  .strict();

const managedVariableFailureSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: z.enum([
          "INVALID_REQUEST",
          "UNAUTHORIZED",
          "BOUNDARY_NOT_FOUND",
          "BOUNDARY_DISABLED",
          "RATE_LIMITED",
          "INVALID_VALUE",
          "OPERATION_IN_PROGRESS",
          "IDEMPOTENCY_CONFLICT",
          "SECRET_WRITE_FAILED",
          "WRITE_OUTCOME_UNKNOWN",
          "RUNTIME_EFFECT_FAILED",
          "STATE_UNAVAILABLE",
          "INTERNAL_ERROR",
        ]),
        message: z.string().max(256),
      })
      .strict(),
    data: managedVariableDataSchema.optional(),
  })
  .strict();

export type ManagedVariableReplacementResult =
  | { success: true; data: z.infer<typeof managedVariableDataSchema> }
  | {
      success: false;
      status: number;
      code:
        | z.infer<typeof managedVariableFailureSchema>["error"]["code"]
        | "INVALID_RESPONSE"
        | "NETWORK_FAILURE";
      data?: z.infer<typeof managedVariableDataSchema>;
    };

async function readBoundedResponse(
  response: Response,
  maxBytes = 8_192,
): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function matchesManagedVariableRequest(
  data: z.infer<typeof managedVariableDataSchema>,
  params: ManagedVariableReplacementParams,
): boolean {
  return (
    data.requestId === params.requestId &&
    data.variableId === params.variableId
  );
}

function parseManagedVariableResponse(
  response: Response,
  body: unknown,
  params: ManagedVariableReplacementParams,
): ManagedVariableReplacementResult {
  if (response.ok) {
    const parsed = managedVariableSuccessSchema.safeParse(body);
    if (
      !parsed.success ||
      !matchesManagedVariableRequest(parsed.data.data, params) ||
      parsed.data.data.runtimeEffectStatus === "failed"
    ) {
      return { success: false, status: 502, code: "INVALID_RESPONSE" };
    }
    return parsed.data;
  }

  const parsed = managedVariableFailureSchema.safeParse(body);
  if (
    !parsed.success ||
    (parsed.data.data &&
      !matchesManagedVariableRequest(parsed.data.data, params))
  ) {
    return { success: false, status: 502, code: "INVALID_RESPONSE" };
  }
  return {
    success: false,
    status: response.status,
    code: parsed.data.error.code,
    ...(parsed.data.data ? { data: parsed.data.data } : {}),
  };
}

function getConfig() {
  return {
    url: process.env.PROVISIONER_URL || "",
    secret: process.env.PROVISIONER_SECRET || "",
  };
}

function getProvisionerEndpoint(baseUrl: string, path: string): string {
  const origin = getCanonicalServiceOrigin(baseUrl, "PROVISIONER_URL");
  return new URL(path, `${origin}/`).toString();
}

export const provisionerClient = {
  async replaceManagedVariable(
    params: ManagedVariableReplacementParams,
  ): Promise<ManagedVariableReplacementResult> {
    const { url, secret } = getConfig();
    try {
      const response = await fetch(
        getProvisionerEndpoint(url, "/v1/managed-variable-replacements"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(60_000),
        },
      );
      const rawBody = await readBoundedResponse(response);
      if (rawBody === null) {
        return { success: false, status: 502, code: "INVALID_RESPONSE" };
      }
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return { success: false, status: 502, code: "INVALID_RESPONSE" };
      }
      return parseManagedVariableResponse(response, body, params);
    } catch {
      return { success: false, status: 502, code: "NETWORK_FAILURE" };
    }
  },

  async getMitchelProspectingSummary(containerId: string): Promise<unknown | null> {
    const { url, secret } = getConfig();
    try {
      const response = await fetch(
        getProvisionerEndpoint(
          url,
          `/mitchel/prospecting/summary?containerId=${encodeURIComponent(containerId)}`
        ),
        {
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

};
