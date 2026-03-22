import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { instance, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateInstanceStatus } from "@/lib/instance";
import { sendProvisioningEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/config";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!secret || secret !== process.env.PROVISIONER_SECRET) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { tenantId, status, containerId, error: errorMsg } = body;

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
  if (errorMsg) details.error = errorMsg;

  const extraFields: Record<string, unknown> = {};
  if (containerId) extraFields.containerId = containerId;

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
