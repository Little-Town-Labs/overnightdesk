import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getInstanceForUser } from "@/lib/instance";
import { getEngineStatus, getSecurityServiceStatus } from "@/lib/engine-client";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const instance = await getInstanceForUser(admin.session.user.id);
  if (!instance?.subdomain || !instance?.engineApiKey || instance.status !== "running") {
    return NextResponse.json({ success: false, error: "Instance not running" }, { status: 404 });
  }

  // Fetch both engine security status and SecurityTeam service status in parallel
  const [engineStatus, serviceStatus] = await Promise.all([
    getEngineStatus(instance.subdomain, instance.engineApiKey),
    getSecurityServiceStatus(instance.subdomain, instance.engineApiKey),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      engine: engineStatus ? (engineStatus as Record<string, unknown>).security ?? null : null,
      service: serviceStatus,
    },
  });
}
