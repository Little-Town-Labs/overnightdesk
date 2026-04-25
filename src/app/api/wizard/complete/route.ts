import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInstanceForUser, isHermesTenant, updateInstanceStatus } from "@/lib/instance";
import { provisionerClient } from "@/lib/provisioner";

const UNAUTHORIZED = NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

const TERMINAL_STATUSES = ["awaiting_provisioning", "provisioning", "running", "error", "deprovisioned"];

export async function POST(_request: NextRequest) {
  const session = await auth.api.getSession({ headers: _request.headers });
  if (!session) return UNAUTHORIZED;

  const inst = await getInstanceForUser(session.user.id);
  if (!inst || !isHermesTenant(inst)) {
    return NextResponse.json({ success: false, error: "No hermes instance found" }, { status: 400 });
  }

  if (TERMINAL_STATUSES.includes(inst.status)) {
    return NextResponse.json({
      success: false,
      error: `Instance is already in ${inst.status} status`,
    }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://overnightdesk.com";

  // Advance status before firing provisioner (atomic ordering gate)
  await updateInstanceStatus(inst.tenantId, "awaiting_provisioning", {
    triggeredBy: "wizard_completion",
  });

  // Fire provisioner — fire-and-forget; callback updates status to provisioning → running
  provisionerClient.provision({
    tenantId: inst.tenantId,
    subdomain: inst.subdomain ?? `${inst.tenantId}.overnightdesk.com`,
    plan: "starter",
    callbackUrl: `${appUrl}/api/provisioner/callback`,
  }).catch(() => {
    // Provisioner failure surfaces via callback or fleet events
  });

  return NextResponse.json({ success: true, status: "awaiting_provisioning" });
}
