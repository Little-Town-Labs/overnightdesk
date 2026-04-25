import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages } from "@ai-sdk/react";
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

  // convertToModelMessages converts UIMessage[] (parts format from useChat)
  // to ModelMessage[] (content format expected by streamText) — AI SDK v6
  const messages = convertToModelMessages(uiMessages);

  const hermes = createOpenAI({
    baseURL: `https://${inst.subdomain}/v1`,
    apiKey: inst.engineApiKey,
  });

  const result = streamText({
    model: hermes("hermes-agent"),
    messages,
  });

  return result.toTextStreamResponse();
}
