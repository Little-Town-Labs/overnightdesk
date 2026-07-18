import { createHash } from "node:crypto";

export type HermesOidcAuditCategory =
  | "start"
  | "success"
  | "denied"
  | "callback_failure"
  | "jwks_failure"
  | "revoked";

export interface HermesOidcAuditEvent {
  category: HermesOidcAuditCategory;
  reason?:
    | "owner_mismatch"
    | "inactive_instance"
    | "invalid_client"
    | "invalid_callback"
    | "invalid_scope"
    | "tenant_mismatch"
    | "expired";
  instanceId?: string;
  clientId?: string;
  requestId?: string;
}

function safeRequestId(value?: string): string | undefined {
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : undefined;
}

export function buildHermesOidcAuditRecord(event: HermesOidcAuditEvent) {
  const details: Record<string, string> = { category: event.category };
  if (event.reason) details.reason = event.reason;
  if (event.instanceId) details.instanceId = event.instanceId;
  if (event.clientId) {
    details.clientFingerprint = createHash("sha256")
      .update(event.clientId)
      .digest("hex")
      .slice(0, 16);
  }
  const requestId = safeRequestId(event.requestId);
  if (requestId) details.requestId = requestId;

  return {
    actor: "hermes-oidc",
    action: `dashboard_authorization.${event.category}`,
    target: event.instanceId ? `instance:${event.instanceId}` : null,
    details,
  };
}

export async function recordHermesOidcAuditEvent(
  event: HermesOidcAuditEvent
): Promise<void> {
  const [{ db }, { platformAuditLog }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  await db.insert(platformAuditLog).values(buildHermesOidcAuditRecord(event));
}

export async function withHermesJwksFailureAudit(
  request: Request,
  handler: () => Promise<Response>,
  recorder: typeof recordHermesOidcAuditEvent = recordHermesOidcAuditEvent
): Promise<Response> {
  const isJwksRequest = new URL(request.url).pathname === "/api/auth/jwks";
  try {
    const response = await handler();
    if (isJwksRequest && response.status >= 500) {
      await recorder({ category: "jwks_failure" }).catch(
        () => undefined
      );
    }
    return response;
  } catch (error) {
    if (isJwksRequest) {
      await recorder({ category: "jwks_failure" }).catch(
        () => undefined
      );
    }
    throw error;
  }
}
