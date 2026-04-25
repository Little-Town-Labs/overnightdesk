import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  return NextResponse.json({
    success: true,
    status: inst.status,
    wizardState: inst.wizardState ?? null,
  });
}
