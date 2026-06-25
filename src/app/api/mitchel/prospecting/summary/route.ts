import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInstanceForUser, isHermesMitchelTenant } from "@/lib/instance";
import { fetchMitchelProspectingSummary } from "@/lib/mitchel-prospecting/trevor-summary-client";

export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status }
  );
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Unauthorized");
  }

  const inst = await getInstanceForUser(session.user.id);
  if (!isHermesMitchelTenant(inst)) {
    return errorResponse(403, "FORBIDDEN", "Not authorized for Mitchel prospecting data");
  }

  if (inst.status !== "running" || !inst.containerId) {
    return errorResponse(503, "UNAVAILABLE", "Mitchel prospecting workspace is unavailable");
  }

  const summary = await fetchMitchelProspectingSummary(inst.containerId);
  return NextResponse.json({ success: true, data: summary });
}
