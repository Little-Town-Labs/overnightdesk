import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/verify-cron-auth";
import { runDailyCollection } from "@/lib/usage-collection";

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const results = await runDailyCollection();
    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Collection failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
