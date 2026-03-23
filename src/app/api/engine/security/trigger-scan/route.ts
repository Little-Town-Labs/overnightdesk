import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { getInstanceForUser } from "@/lib/instance";
import { triggerSecurityScan } from "@/lib/engine-client";

const triggerSchema = z.object({
  type: z.enum(["inbound", "audit"]),
  auditName: z.enum(["nightly_code_review", "weekly_gateway", "monthly_memory"]).optional(),
});

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const instance = await getInstanceForUser(admin.session.user.id);
  if (!instance?.subdomain || !instance?.engineApiKey || instance.status !== "running") {
    return NextResponse.json({ success: false, error: "Instance not running" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = triggerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const data = await triggerSecurityScan(
    instance.subdomain,
    instance.engineApiKey,
    parsed.data.type,
    parsed.data.auditName
  );
  if (data === null) {
    return NextResponse.json({ success: false, error: "Scan failed or service unreachable" }, { status: 502 });
  }

  return NextResponse.json({ success: true, data });
}
