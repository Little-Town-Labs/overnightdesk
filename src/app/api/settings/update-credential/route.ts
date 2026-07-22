import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "ENDPOINT_RETIRED",
        message: "Use the selected-agent managed variable endpoint.",
      },
    },
    { status: 410 },
  );
}
