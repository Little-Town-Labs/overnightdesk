import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getInstanceForUser } from "@/lib/instance";
import { getSecurityQueuePending } from "@/lib/engine-client";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const instance = await getInstanceForUser(admin.session.user.id);
  if (!instance?.subdomain || !instance?.engineApiKey || instance.status !== "running") {
    return NextResponse.json({ success: false, error: "Instance not running" }, { status: 404 });
  }

  const data = await getSecurityQueuePending(instance.subdomain, instance.engineApiKey);
  if (data === null) {
    return NextResponse.json({ success: false, error: "Security service unreachable" }, { status: 502 });
  }

  return NextResponse.json({ success: true, data });
}
