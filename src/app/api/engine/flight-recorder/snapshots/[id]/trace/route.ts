import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getFlightRecorderSnapshotTrace } from "@/lib/engine-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveInstance();
  if (!result.ok) return result.response;

  const { id } = await params;
  const { subdomain, engineApiKey } = result.instance;
  const trace = await getFlightRecorderSnapshotTrace(
    subdomain,
    engineApiKey,
    id
  );

  if (trace === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return new NextResponse(trace, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="runtime.trace"',
    },
  });
}
