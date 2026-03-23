import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireProOrAdmin } from "@/lib/require-pro-or-admin";
import { getInstanceForUser } from "@/lib/instance";
import { resolveSecurityQueueItem } from "@/lib/engine-client";

const resolveSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireProOrAdmin();
  if (!result.ok) return result.response;

  const instance = await getInstanceForUser(result.session.user.id);
  if (!instance?.subdomain || !instance?.engineApiKey || instance.status !== "running") {
    return NextResponse.json({ success: false, error: "Instance not running" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request: decision must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const { id } = await params;
  const reviewedBy = result.session.user.email;
  const data = await resolveSecurityQueueItem(
    instance.subdomain,
    instance.engineApiKey,
    id,
    parsed.data.decision,
    reviewedBy
  );
  if (data === null) {
    return NextResponse.json({ success: false, error: "Failed to resolve item" }, { status: 502 });
  }

  return NextResponse.json({ success: true, data });
}
