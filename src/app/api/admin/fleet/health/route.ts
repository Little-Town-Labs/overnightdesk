import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isAdmin } from "@/lib/billing";
import { db } from "@/db";
import { instance } from "@/db/schema";

export async function GET(_request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isAdmin(session.user.email)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

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
