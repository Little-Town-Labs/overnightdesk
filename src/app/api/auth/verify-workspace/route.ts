import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordOpenWebuiAuditEvent } from "@/lib/open-webui-audit";
import {
  TITUS_OPEN_WEBUI,
  authorizeTitusOpenWebuiEdge,
} from "@/lib/open-webui-titus-canary";

export const dynamic = "force-dynamic";

const unauthorized = () => new NextResponse(null, { status: 401 });
const transports = new Set(["http", "sse", "websocket"] as const);

export async function GET(request: NextRequest) {
  const host = request.headers.get("x-original-host") ?? undefined;
  const rawTransport = request.headers.get("x-open-webui-transport") ?? "http";
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const transport = transports.has(
    rawTransport as "http" | "sse" | "websocket",
  )
    ? (rawTransport as "http" | "sse" | "websocket")
    : null;

  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!host || !transport || !session) {
    await recordOpenWebuiAuditEvent({
      category: "denied",
      reason: !session
        ? "session_required"
        : !host
          ? "invalid_host"
          : "invalid_transport",
      deploymentId: TITUS_OPEN_WEBUI.deploymentId,
      host,
      requestId,
      transport: transport ?? undefined,
    }).catch(() => undefined);
    return unauthorized();
  }

  try {
    const authorized = await authorizeTitusOpenWebuiEdge(
      { userId: session.user.id, host, transport },
      undefined,
      undefined,
    );
    if (!authorized) throw new Error("not authorized");
    await recordOpenWebuiAuditEvent({
      category: "success",
      deploymentId: TITUS_OPEN_WEBUI.deploymentId,
      host,
      requestId,
      transport,
    });
    return new NextResponse(null, { status: 200 });
  } catch {
    await recordOpenWebuiAuditEvent({
      category: "denied",
      reason: "not_authorized",
      deploymentId: TITUS_OPEN_WEBUI.deploymentId,
      host,
      requestId,
      transport,
    }).catch(() => undefined);
    return unauthorized();
  }
}
