import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { triggerFlightRecorderSnapshot } from "@/lib/engine-client";

export async function POST(request: NextRequest) {
  const result = await resolveInstance();
  if (!result.ok) return result.response;

  let reason: string | undefined;
  try {
    const body = await request.json();
    if (typeof body.reason === "string" && body.reason.length > 0) {
      reason = body.reason.slice(0, 255);
    }
  } catch {
    // Empty body is fine — reason defaults to "manual"
  }

  const { subdomain, engineApiKey } = result.instance;
  const snapshot = await triggerFlightRecorderSnapshot(
    subdomain,
    engineApiKey,
    reason
  );

  if (snapshot === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: snapshot });
}
