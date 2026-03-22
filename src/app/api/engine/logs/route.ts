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
  const lines = linesStr ? Math.min(Math.max(1, Number(linesStr) || 100), 1000) : undefined;

  const logs = await getEngineLogs(subdomain, engineApiKey, lines);

  return NextResponse.json({ success: true, data: logs });
}
