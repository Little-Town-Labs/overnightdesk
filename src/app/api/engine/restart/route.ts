import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { provisionerClient } from "@/lib/provisioner";

// Rate limiter: 1 request per 300 seconds (5 minutes) per user
// Stored on globalThis so test infrastructure can reset between tests
const g = globalThis as unknown as Record<string, unknown>;
if (!(g.__restartTimestamps instanceof Map)) {
  g.__restartTimestamps = new Map<string, number[]>();
}
const restartTimestamps = g.__restartTimestamps as Map<string, number[]>;

function checkRestartRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 300_000;
  const maxRequests = 1;

  // Circuit breaker: clear entire map if it grows too large (serverless edge case)
  if (restartTimestamps.size > 10_000) {
    restartTimestamps.clear();
  }

  const timestamps = restartTimestamps.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  // Clean up stale entry if all timestamps expired
  if (recent.length === 0 && timestamps.length > 0) {
    restartTimestamps.delete(userId);
  }

  if (recent.length >= maxRequests) {
    restartTimestamps.set(userId, recent);
    return false;
  }

  recent.push(now);
  restartTimestamps.set(userId, recent);
  return true;
}

export async function POST(_request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { tenantId, userId } = result.instance;

  if (!checkRestartRateLimit(userId)) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded. Please wait before restarting again." },
      { status: 429 }
    );
  }

  const restartResult = await provisionerClient.restart(tenantId);

  if (!restartResult.success) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: { restarted: true } });
}
