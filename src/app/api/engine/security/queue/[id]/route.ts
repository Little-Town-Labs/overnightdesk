import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getInstanceForUser } from "@/lib/instance";
import { getSecurityQueueItem } from "@/lib/engine-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const instance = await getInstanceForUser(admin.session.user.id);
  if (!instance?.subdomain || !instance?.engineApiKey || instance.status !== "running") {
    return NextResponse.json({ success: false, error: "Instance not running" }, { status: 404 });
  }

  const { id } = await params;
  const data = await getSecurityQueueItem(instance.subdomain, instance.engineApiKey, id);
  if (data === null) {
    return NextResponse.json({ success: false, error: "Item not found or service unreachable" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}
