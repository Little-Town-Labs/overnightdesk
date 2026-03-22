import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthStatus } from "@/lib/engine-client";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const instances = await db
    .select()
    .from(instance)
    .where(eq(instance.userId, session.user.id));

  const inst = instances[0];

  if (!inst) {
    return NextResponse.json(
      { success: false, error: "No instance found" },
      { status: 404 }
    );
  }

  // If instance isn't running, return current DB status without calling engine
  if (inst.status !== "running" && inst.status !== "awaiting_auth") {
    return NextResponse.json({
      success: true,
      data: {
        status: "unknown",
        claudeAuthStatus: inst.claudeAuthStatus,
      },
    });
  }

  if (!inst.subdomain || !inst.engineApiKey) {
    return NextResponse.json({
      success: true,
      data: {
        status: "unknown",
        claudeAuthStatus: inst.claudeAuthStatus,
      },
    });
  }

  // Proxy to engine
  const engineStatus = await getAuthStatus(inst.subdomain, inst.engineApiKey);

  // Map engine status to claudeAuthStatus
  let claudeAuthStatus = inst.claudeAuthStatus;
  if (engineStatus === "authenticated") {
    claudeAuthStatus = "connected";
  } else if (engineStatus === "not_authenticated") {
    claudeAuthStatus =
      inst.claudeAuthStatus === "connected" ? "expired" : "not_configured";
  }

  // Update DB if status changed
  if (claudeAuthStatus !== inst.claudeAuthStatus) {
    await db
      .update(instance)
      .set({ claudeAuthStatus, updatedAt: new Date() })
      .where(eq(instance.id, inst.id));
  }

  return NextResponse.json({
    success: true,
    data: {
      status: engineStatus,
      claudeAuthStatus,
    },
  });
}
