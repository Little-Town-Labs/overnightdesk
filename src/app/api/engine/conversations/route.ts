import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getConversations } from "@/lib/engine-client";

export async function GET(request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { subdomain, engineApiKey } = result.instance;
  const searchParams = request.nextUrl.searchParams;
  const params: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }

  const conversations = await getConversations(
    subdomain,
    engineApiKey,
    Object.keys(params).length > 0 ? params : undefined
  );

  return NextResponse.json({ success: true, data: conversations });
}
