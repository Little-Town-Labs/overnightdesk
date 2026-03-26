import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getFlightRecorderSnapshots } from "@/lib/engine-client";

export async function GET(_request: NextRequest) {
  const result = await resolveInstance();
  if (!result.ok) return result.response;

  const { subdomain, engineApiKey } = result.instance;
  const snapshots = await getFlightRecorderSnapshots(subdomain, engineApiKey);

  if (snapshots === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: snapshots });
}
