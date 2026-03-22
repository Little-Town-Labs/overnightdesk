import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTerminalTicket } from "@/lib/engine-client";

export async function POST() {
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

  if (inst.status !== "running" && inst.status !== "awaiting_auth") {
    return NextResponse.json(
      { success: false, error: "Instance is not running" },
      { status: 409 }
    );
  }

  if (!inst.subdomain || !inst.engineApiKey) {
    return NextResponse.json(
      { success: false, error: "Instance not configured" },
      { status: 500 }
    );
  }

  const ticket = await getTerminalTicket(inst.subdomain, inst.engineApiKey);

  if (!ticket) {
    return NextResponse.json(
      { success: false, error: "Unable to reach your instance" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      ticket,
      wsUrl: `wss://${inst.subdomain}/api/terminal`,
    },
  });
}
