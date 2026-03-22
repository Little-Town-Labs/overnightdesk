import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getEngineLogs } from "@/lib/engine-client";

export async function GET(request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { subdomain, engineApiKey } = result.instance;
  const linesStr = request.nextUrl.searchParams.get("lines");
  const lines = linesStr ? Number(linesStr) : undefined;

  const logs = await getEngineLogs(subdomain, engineApiKey, lines);

  return NextResponse.json({ success: true, data: logs });
}
