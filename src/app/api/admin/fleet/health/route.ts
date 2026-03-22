import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/db";
import { instance } from "@/db/schema";

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const instances = await db
    .select({
      id: instance.id,
      tenantId: instance.tenantId,
      status: instance.status,
      subdomain: instance.subdomain,
      lastHealthCheck: instance.lastHealthCheck,
      consecutiveHealthFailures: instance.consecutiveHealthFailures,
      claudeAuthStatus: instance.claudeAuthStatus,
    })
    .from(instance);

  return NextResponse.json({ success: true, data: instances });
}
