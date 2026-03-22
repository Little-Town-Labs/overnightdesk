import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveInstance } from "@/lib/resolve-instance";
import {
  getHeartbeatConfig,
  updateHeartbeatConfig,
} from "@/lib/engine-client";

const heartbeatUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  intervalSeconds: z.number().int().min(60).max(86400).optional(),
  prompt: z.string().max(100_000).optional(),
});

export async function GET(_request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { subdomain, engineApiKey } = result.instance;
  const config = await getHeartbeatConfig(subdomain, engineApiKey);

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

  const parsed = heartbeatUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { subdomain, engineApiKey } = result.instance;
  const updated = await updateHeartbeatConfig(
    subdomain,
    engineApiKey,
    parsed.data
  );

  if (updated === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: updated });
}
