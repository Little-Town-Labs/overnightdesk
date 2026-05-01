import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSubscriptionForUser } from "@/lib/billing";
import { getInstanceForUser, isHermesTenant, updateInstanceStatus } from "@/lib/instance";
import { orchestratorClient } from "@/lib/orchestrator";
import { provisionerClient } from "@/lib/provisioner";

const UNAUTHORIZED = NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

// States that block re-triggering wizard completion (in-progress + terminal).
const BLOCKING_STATUSES = ["awaiting_provisioning", "provisioning", "running", "error", "deprovisioned"];

export async function POST(_request: NextRequest) {
  const session = await auth.api.getSession({ headers: _request.headers });
  if (!session) return UNAUTHORIZED;

  const inst = await getInstanceForUser(session.user.id);
  if (!inst || !isHermesTenant(inst)) {
    return NextResponse.json({ success: false, error: "No hermes instance found" }, { status: 400 });
  }

  if (BLOCKING_STATUSES.includes(inst.status)) {
    return NextResponse.json({
      success: false,
      error: `Instance is already in ${inst.status} status`,
    }, { status: 400 });
  }

  const sub = await getSubscriptionForUser(session.user.id);
  const plan = sub?.plan ?? "starter";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://overnightdesk.com";
  const tenantId = inst.tenantId;
  const subdomain = inst.subdomain ?? `${tenantId}.overnightdesk.com`;
  const callbackUrl = `${appUrl}/api/provisioner/callback`;

  // Advance status before firing provisioners (atomic ordering gate)
  await updateInstanceStatus(tenantId, "awaiting_provisioning", {
    triggeredBy: "wizard_completion",
  });

  // Provisioning is sequential after the response:
  // 1. Orchestrator creates the hardened container + tenant DB record.
  // 2. hermes-provisioner configures nginx, TLS, and Phase secrets.
  // Ordering matters — the nginx config references the container by name,
  // so the container must exist before hermes-provisioner runs.
  after(async () => {
    const orchestratorResult = await orchestratorClient.createTenant({
      slug: tenantId,
      name: session.user.name ?? tenantId,
      plan,
    });

    if (!orchestratorResult.success) {
      console.error("wizard/complete: orchestrator createTenant failed", {
        tenantId,
        error: orchestratorResult.error,
      });
      return;
    }

    // Persist the orchestrator's tenant ID so future management calls
    // (suspend, resume, destroy) can reference it directly.
    if (orchestratorResult.tenant?.tenant_id) {
      await updateInstanceStatus(tenantId, "awaiting_provisioning", undefined, {
        orchestratorTenantId: orchestratorResult.tenant.tenant_id,
      });
    }

    const provisionerResult = await provisionerClient.provisionInfra({
      tenantId,
      subdomain,
      plan,
      callbackUrl,
    });

    if (!provisionerResult.success) {
      console.error("wizard/complete: hermes-provisioner provisionInfra failed", {
        tenantId,
        error: provisionerResult.error,
      });
    }
  });

  return NextResponse.json({ success: true, status: "awaiting_provisioning" });
}
