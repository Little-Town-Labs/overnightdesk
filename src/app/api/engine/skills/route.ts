import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getSkills } from "@/lib/engine-client";

export async function GET(request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { subdomain, engineApiKey } = result.instance;
  const searchParams = request.nextUrl.searchParams;
  const params: Record<string, string> = {};

  const allowed = new Set(["agent", "source", "include_global"]);
  for (const [key, value] of searchParams.entries()) {
    if (allowed.has(key)) {
      params[key] = value;
    }
  }

  const data = await getSkills(
    subdomain,
    engineApiKey,
    Object.keys(params).length > 0 ? params : undefined
  );

  if (data === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data });
}
