import { NextRequest, NextResponse } from "next/server";
import { streamText, convertToModelMessages } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { auth } from "@/lib/auth";
import { getInstanceForUser, isHermesTenant } from "@/lib/instance";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inst = await getInstanceForUser(session.user.id);

  if (!inst || !isHermesTenant(inst)) {
    return NextResponse.json({ error: "No hermes instance found" }, { status: 400 });
  }

  if (inst.status !== "running") {
    return NextResponse.json(
      { error: "Agent is not running. Start your agent from the Overview tab." },
      { status: 503 }
    );
  }

  if (!inst.engineApiKey || !inst.subdomain) {
    return NextResponse.json(
      { error: "Agent not configured for chat. Please contact support." },
      { status: 400 }
    );
  }

  const { messages: uiMessages } = await request.json();

  // Extract only the latest user message — hermes manages conversation state
  // internally via X-Hermes-Session-Id (same as Telegram sessions).
  // Sending full history would duplicate context hermes already holds.
  const allMessages = await convertToModelMessages(uiMessages);
  const latestMessage = allMessages.at(-1);
  if (!latestMessage) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  // Forward the hermes session ID so it maintains conversation continuity
  const hermesSessionId = request.headers.get("x-hermes-session-id") ?? undefined;

  const hermes = createOpenAI({
    baseURL: `https://${inst.subdomain}/v1`,
    apiKey: inst.engineApiKey,
    headers: hermesSessionId ? { "X-Hermes-Session-Id": hermesSessionId } : {},
  });

  const result = streamText({
    model: hermes("hermes-agent"),
    messages: [latestMessage],
  });

  return result.toUIMessageStreamResponse();
}
