import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInstanceForUser, isHermesTenant } from "@/lib/instance";
import { provisionerClient } from "@/lib/provisioner";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";

const UNAUTHORIZED = NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

async function validateOpenRouterKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return UNAUTHORIZED;

  const inst = await getInstanceForUser(session.user.id);
  if (!inst || !isHermesTenant(inst)) {
    return NextResponse.json({ success: false, error: "No hermes instance found" }, { status: 400 });
  }

  const body = await request.json();
  const { step, secrets = {} } = body as { step: number; secrets: Record<string, string> };

  // Step 1 — OpenRouter API key (required)
  if (step === 1) {
    const key = secrets.OPENROUTER_API_KEY;
    if (!key) {
      return NextResponse.json({ success: false, error: "OPENROUTER_API_KEY is required" }, { status: 400 });
    }
    const valid = await validateOpenRouterKey(key);
    if (!valid) {
      return NextResponse.json({
        success: false,
        error: "This API key is not valid. Please check it at openrouter.ai/keys and try again.",
      }, { status: 422 });
    }
  }

  // Step 2 — Telegram (optional, but if token provided user IDs must also be provided)
  if (step === 2) {
    const hasToken = !!secrets.TELEGRAM_BOT_TOKEN;
    const hasUsers = !!secrets.TELEGRAM_ALLOWED_USERS;
    if (hasToken && !hasUsers) {
      return NextResponse.json({
        success: false,
        error: "TELEGRAM_ALLOWED_USERS is required when a bot token is provided",
      }, { status: 400 });
    }
    // Empty step 2 = skip
    if (!hasToken && !hasUsers) {
      await advanceWizardState(inst.id, step);
      return NextResponse.json({ success: true });
    }
  }

  // Write secrets to Phase.dev if any provided
  if (Object.keys(secrets).length > 0) {
    const result = await provisionerClient.writeSecrets({ tenantId: inst.tenantId, secrets });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? "Failed to write secrets" }, { status: 502 });
    }
  }

  await advanceWizardState(inst.id, step);
  return NextResponse.json({ success: true });
}

async function advanceWizardState(instanceId: string, completedStep: number) {
  const rows = await db.select().from(instance).where(eq(instance.id, instanceId));
  const current = rows[0];
  const state = (current?.wizardState as { completedSteps: number[]; currentStep: number } | null) ?? {
    completedSteps: [],
    currentStep: 1,
  };
  const completedSteps = Array.from(new Set([...state.completedSteps, completedStep]));
  await db.update(instance)
    .set({ wizardState: { completedSteps, currentStep: completedStep + 1 }, updatedAt: new Date() })
    .where(eq(instance.id, instanceId));
}
