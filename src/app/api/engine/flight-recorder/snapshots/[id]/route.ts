import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getFlightRecorderSnapshot } from "@/lib/engine-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveInstance();
  if (!result.ok) return result.response;

  const { id } = await params;
  const { subdomain, engineApiKey } = result.instance;
  const snapshot = await getFlightRecorderSnapshot(
    subdomain,
    engineApiKey,
    id
  );

  if (snapshot === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: snapshot });
}
