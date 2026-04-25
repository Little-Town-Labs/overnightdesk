import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInstanceForUser, isHermesTenant } from "@/lib/instance";
import { provisionerClient } from "@/lib/provisioner";

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
  if (!inst || !isHermesTenant(inst) || inst.status !== "running") {
    return NextResponse.json({ success: false, error: "Instance not available" }, { status: 400 });
  }

  const body = await request.json();
  const { secrets } = body as { secrets: Record<string, string> };

  if (!secrets || Object.keys(secrets).length === 0) {
    return NextResponse.json({ success: false, error: "No secrets provided" }, { status: 400 });
  }

  // Re-validate OpenRouter key if being updated (FR-29)
  if (secrets.OPENROUTER_API_KEY) {
    const valid = await validateOpenRouterKey(secrets.OPENROUTER_API_KEY);
    if (!valid) {
      return NextResponse.json({
        success: false,
        error: "This API key is not valid. Please check it at openrouter.ai/keys and try again.",
      }, { status: 422 });
    }
  }

  // Write updated secrets to Phase.dev
  const writeResult = await provisionerClient.writeSecrets({ tenantId: inst.tenantId, secrets });
  if (!writeResult.success) {
    return NextResponse.json({ success: false, error: writeResult.error ?? "Failed to write secrets" }, { status: 502 });
  }

  // Restart container to pick up new secrets
  const restartResult = await provisionerClient.restart(inst.tenantId);
  if (!restartResult.success) {
    return NextResponse.json({ success: false, error: "Secrets saved but restart failed — agent will use new keys on next restart" }, { status: 502 });
  }

  return NextResponse.json({ success: true, message: "Credentials updated and agent restarted" });
}
