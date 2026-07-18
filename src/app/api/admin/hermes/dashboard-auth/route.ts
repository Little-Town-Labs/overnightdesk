import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/billing";
import { getAppUrl } from "@/lib/config";
import { db } from "@/db";
import { instance } from "@/db/schema";
import {
  activateHermesOidcClient,
  buildHermesDashboardAuthConfig,
  disableHermesOidcClient,
  ensureHermesOidcClient,
  markHermesOidcClientError,
  recoverHermesOidcClient,
} from "@/lib/hermes-oidc";
import { isHermesOidcCanaryTenant } from "@/lib/hermes-oidc-config";
import { provisionerClient } from "@/lib/provisioner";

export const dynamic = "force-dynamic";

const validTenantId = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isAdmin(session.user.email)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenantId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
  if (
    typeof body.tenantId !== "string" ||
    !validTenantId.test(body.tenantId) ||
    (body.action !== "configure" && body.action !== "disable")
  ) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(instance)
    .where(eq(instance.tenantId, body.tenantId))
    .limit(1);
  const target = rows[0];
  if (!target?.subdomain) {
    return NextResponse.json({ success: false, error: "Tenant unavailable" }, { status: 404 });
  }

  const lifecycleInput = {
    instanceId: target.id,
    ownerId: target.userId,
    subdomain: target.subdomain,
  };
  if (body.action === "disable") {
    try {
      await disableHermesOidcClient(lifecycleInput);
      return NextResponse.json({ success: true, status: "disabled" });
    } catch {
      return NextResponse.json(
        { success: false, error: "Dashboard authentication is unavailable" },
        { status: 503 }
      );
    }
  }
  if (!isHermesOidcCanaryTenant(target.tenantId)) {
    return NextResponse.json(
      { success: false, error: "Tenant is not approved for OIDC canary" },
      { status: 403 }
    );
  }

  let clientId: string | undefined;
  try {
    const ensured = await ensureHermesOidcClient(lifecycleInput);
    clientId = ensured.clientId;
    await recoverHermesOidcClient(lifecycleInput);
    const configured = await provisionerClient.configureDashboardAuth({
      tenantId: target.tenantId,
      restart: true,
      dashboardAuth: buildHermesDashboardAuthConfig({
        clientId,
        subdomain: target.subdomain,
        issuerBaseUrl: process.env.BETTER_AUTH_URL ?? getAppUrl(),
      }),
    });
    if (!configured.success) throw new Error("configuration failed");
    await activateHermesOidcClient(lifecycleInput);
    return NextResponse.json({ success: true, status: "active" });
  } catch {
    if (clientId) {
      await markHermesOidcClientError(lifecycleInput).catch(() => undefined);
    }
    return NextResponse.json(
      { success: false, error: "Dashboard authentication is unavailable" },
      { status: 503 }
    );
  }
}
