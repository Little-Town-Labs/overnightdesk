import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/verify-cron-auth";
import { runFleetHealthCheck } from "@/lib/health-check";

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const results = await runFleetHealthCheck();

  return NextResponse.json({ success: true, data: results });
}
