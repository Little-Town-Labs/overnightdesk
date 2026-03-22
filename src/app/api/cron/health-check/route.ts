import { NextRequest, NextResponse } from "next/server";
import { runFleetHealthCheck } from "@/lib/health-check";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const results = await runFleetHealthCheck();

  return NextResponse.json({ success: true, data: results });
}
