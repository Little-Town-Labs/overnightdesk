import { NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getAgents } from "@/lib/engine-client";

export async function GET() {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { subdomain, engineApiKey } = result.instance;
  const data = await getAgents(subdomain, engineApiKey);

  if (data === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data });
}
