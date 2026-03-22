import { NextRequest, NextResponse } from "next/server";
import { runDailyCollection } from "@/lib/usage-collection";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

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
