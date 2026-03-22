import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isAdmin } from "@/lib/billing";
import { db } from "@/db";
import { fleetEvent } from "@/db/schema";
import { eq, desc, and, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isAdmin(session.user.email)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const instanceId = url.searchParams.get("instanceId");
  const eventType = url.searchParams.get("eventType");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
  );
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  const conditions = [];
  if (instanceId) {
    conditions.push(eq(fleetEvent.instanceId, instanceId));
  }
  if (eventType) {
    conditions.push(eq(fleetEvent.eventType, eventType));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const [events, totalResult] = await Promise.all([
    whereClause
      ? db
          .select()
          .from(fleetEvent)
          .where(whereClause)
          .orderBy(desc(fleetEvent.createdAt))
          .limit(limit)
          .offset(offset)
      : db
          .select()
          .from(fleetEvent)
          .orderBy(desc(fleetEvent.createdAt))
          .limit(limit)
          .offset(offset),
    whereClause
      ? db
          .select({ total: count() })
          .from(fleetEvent)
          .where(whereClause)
      : db.select({ total: count() }).from(fleetEvent),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      events,
      total: totalResult[0]?.total ?? 0,
    },
  });
}
