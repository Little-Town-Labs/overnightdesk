import { createHash } from "node:crypto";

export type OpenWebuiAuditCategory =
  | "start"
  | "success"
  | "denied"
  | "callback_failure"
  | "canary_enabled"
  | "canary_disabled"
  | "configuration_change";

export interface OpenWebuiAuditEvent {
  category: OpenWebuiAuditCategory;
  reason?:
    | "session_required"
    | "invalid_host"
    | "invalid_transport"
    | "not_authorized"
    | "authorization_unavailable"
    | "invalid_client"
    | "invalid_callback";
  deploymentId?: string;
  clientId?: string;
  host?: string;
  requestId?: string;
  transport?: "http" | "sse" | "websocket";
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function safeRequestId(value?: string): string | undefined {
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : undefined;
}

export function buildOpenWebuiAuditRecord(event: OpenWebuiAuditEvent) {
  const details: Record<string, string> = { category: event.category };
  if (event.reason) details.reason = event.reason;
  if (event.transport) details.transport = event.transport;
  if (event.clientId) details.clientFingerprint = fingerprint(event.clientId);
  if (event.host) details.hostFingerprint = fingerprint(event.host);
  const requestId = safeRequestId(event.requestId);
  if (requestId) details.requestId = requestId;

  return {
    actor: "open-webui-edge",
    action: `open_webui_authorization.${event.category}`,
    target: event.deploymentId
      ? `open-webui:${event.deploymentId}`
      : "open-webui:titus",
    details,
  };
}

export async function recordOpenWebuiAuditEvent(
  event: OpenWebuiAuditEvent,
): Promise<void> {
  const [{ db }, { platformAuditLog }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  await db.insert(platformAuditLog).values(buildOpenWebuiAuditRecord(event));
}
