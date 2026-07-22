import { getCanonicalServiceOrigin } from "@/lib/config";
import { z } from "zod";

export interface DashboardAuthParams {
  provider: "self-hosted";
  issuer: string;
  clientId: string;
  publicUrl: string;
  callbackUrl: string;
  scopes: readonly ["openid", "profile", "email"];
}

interface ProvisionParams {
  tenantId: string;
  subdomain: string;
  plan: "starter" | "pro";
  callbackUrl: string;
  dashboardAuth: DashboardAuthParams;
}

export interface ConfigureDashboardAuthParams {
  tenantId: string;
  dashboardAuth: DashboardAuthParams;
  restart: boolean;
}

export interface HermesMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface HermesSession {
  id: string;
  source: string; // telegram | api_server | discord | cli
  started_at: number;
  ended_at: number | null;
  message_count: number;
  title: string | null;
  est_cost: number;
  messages: HermesMessage[];
}

interface WriteSecretsParams {
  tenantId: string;
  secrets: Record<string, string>;
}

interface ProvisionerResult {
  success: boolean;
  error?: string;
}

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
  async provision(params: ProvisionParams): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(getProvisionerEndpoint(url, "/provision"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Provisioner returned ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async restart(tenantId: string): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(getProvisionerEndpoint(url, "/restart"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ tenantId }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Provisioner returned ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

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
      if (response.ok) {
        const parsed = managedVariableSuccessSchema.safeParse(body);
        return parsed.success
          ? parsed.data
          : { success: false, status: 502, code: "INVALID_RESPONSE" };
      }
      const parsed = managedVariableFailureSchema.safeParse(body);
      return parsed.success
        ? {
            success: false,
            status: response.status,
            code: parsed.data.error.code,
            ...(parsed.data.data ? { data: parsed.data.data } : {}),
          }
        : { success: false, status: 502, code: "INVALID_RESPONSE" };
    } catch {
      return { success: false, status: 502, code: "NETWORK_FAILURE" };
    }
  },

  async configureDashboardAuth(
    params: ConfigureDashboardAuthParams
  ): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(
        getProvisionerEndpoint(url, "/dashboard-auth"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Provisioner returned ${response.status}`,
        };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async writeSecrets(params: WriteSecretsParams): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(getProvisionerEndpoint(url, "/write-secrets"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return { success: false, error: `Provisioner returned ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  async getSessions(containerId: string): Promise<{ sessions: HermesSession[] } | null> {
    const { url, secret } = getConfig();
    try {
      const response = await fetch(
        getProvisionerEndpoint(
          url,
          `/sessions?containerId=${encodeURIComponent(containerId)}`
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

  async deprovision(tenantId: string): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(getProvisionerEndpoint(url, "/deprovision"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ tenantId }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Provisioner returned ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
