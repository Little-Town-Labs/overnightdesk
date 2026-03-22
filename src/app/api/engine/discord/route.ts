import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveInstance } from "@/lib/resolve-instance";
import {
  getDiscordConfig,
  updateDiscordConfig,
  deleteDiscordConfig,
} from "@/lib/engine-client";

const discordUpdateSchema = z.object({
  bot_token: z.string().min(20),
  allowed_users: z.array(z.string().min(1)).min(1),
  enabled: z.boolean(),
});

export async function GET(_request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { subdomain, engineApiKey } = result.instance;
  const config = await getDiscordConfig(subdomain, engineApiKey);

  if (config === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: config });
}

export async function PUT(request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = discordUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { subdomain, engineApiKey } = result.instance;
  const updated = await updateDiscordConfig(subdomain, engineApiKey, parsed.data);

  if (updated === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { subdomain, engineApiKey } = result.instance;
  const deleted = await deleteDiscordConfig(subdomain, engineApiKey);

  if (!deleted) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
