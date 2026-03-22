import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getConversationMessages } from "@/lib/engine-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { id } = await params;
  const { subdomain, engineApiKey } = result.instance;
  const searchParams = request.nextUrl.searchParams;
  const queryParams: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    queryParams[key] = value;
  }

  const messages = await getConversationMessages(
    subdomain,
    engineApiKey,
    id,
    queryParams
  );

  if (messages === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: messages });
}
