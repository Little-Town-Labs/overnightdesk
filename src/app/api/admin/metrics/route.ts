import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { computeAdminMetrics } from "@/lib/admin-metrics";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const metrics = await computeAdminMetrics();
    return NextResponse.json({ success: true, data: metrics });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to compute metrics";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
