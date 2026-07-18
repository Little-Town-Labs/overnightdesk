import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { instance, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateInstanceStatus } from "@/lib/instance";
import { sendProvisioningEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/config";
import {
  activateHermesOidcClient,
  markHermesOidcClientError,
} from "@/lib/hermes-oidc";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const provisionerSecret = process.env.PROVISIONER_SECRET;

  if (!provisionerSecret) {
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${provisionerSecret}`;

  let isValid = false;
  try {
    isValid =
      authHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    isValid = false;
  }

  if (!isValid) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { tenantId, status, containerId, phaseServiceToken, error: errorMsg } = body;

  if (!tenantId || !status) {
    return NextResponse.json(
      { success: false, error: "Missing tenantId or status" },
      { status: 400 }
    );
  }

  // Find instance
  const instances = await db
    .select()
    .from(instance)
    .where(eq(instance.tenantId, tenantId));

  if (instances.length === 0) {
    return NextResponse.json(
      { success: false, error: "Instance not found" },
      { status: 404 }
    );
  }

  const inst = instances[0];

  // Update instance status
  const details: Record<string, unknown> = {};
  if (containerId) details.containerId = containerId;
  if (errorMsg) details.error = "provisioning_failed";

  const extraFields: Record<string, unknown> = {};
  if (containerId) extraFields.containerId = containerId;
  if (phaseServiceToken) extraFields.phaseServiceToken = phaseServiceToken;

  if (
    status === "running" &&
    inst.hermesOidcClientId &&
    process.env.HERMES_DASHBOARD_OIDC_ENABLED === "true"
  ) {
    if (!inst.subdomain) {
      return NextResponse.json(
        { success: false, error: "Dashboard authentication is unavailable" },
        { status: 503 }
      );
    }
    try {
      await activateHermesOidcClient({
        instanceId: inst.id,
        ownerId: inst.userId,
        subdomain: inst.subdomain,
      });
    } catch {
      await markHermesOidcClientError({
        instanceId: inst.id,
        ownerId: inst.userId,
        subdomain: inst.subdomain,
      }).catch(() => undefined);
      await updateInstanceStatus(
        tenantId,
        "error",
        { error: "dashboard_auth_activation_failed" },
        extraFields
      );
      return NextResponse.json(
        { success: false, error: "Dashboard authentication is unavailable" },
        { status: 503 }
      );
    }
  }
  if (status === "error" && inst.hermesOidcClientId && inst.subdomain) {
    try {
      await markHermesOidcClientError({
        instanceId: inst.id,
        ownerId: inst.userId,
        subdomain: inst.subdomain,
      });
    } catch {
      return NextResponse.json(
        { success: false, error: "Dashboard authentication is unavailable" },
        { status: 503 }
      );
    }
  }

  await updateInstanceStatus(tenantId, status, details, extraFields);

  // Send welcome email when instance is running
  if (status === "running") {
    const userRows = await db
      .select()
      .from(user)
      .where(eq(user.id, inst.userId));

    const userRecord = userRows[0];
    if (userRecord) {
      const appUrl = getAppUrl();

      await sendProvisioningEmail({
        user: {
          email: userRecord.email,
          name: userRecord.name,
          id: userRecord.id,
        },
        dashboardUrl: `${appUrl}/dashboard`,
      });
    }
  }

  return NextResponse.json({ success: true });
}
