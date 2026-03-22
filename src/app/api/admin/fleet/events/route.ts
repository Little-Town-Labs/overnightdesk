import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/db";
import { fleetEvent } from "@/db/schema";
import { eq, desc, and, count, gte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

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

  // Default to last 30 days when no filters are applied
  if (!instanceId && !eventType) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    conditions.push(gte(fleetEvent.createdAt, thirtyDaysAgo));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const [events, totalResult] = await Promise.all([
    db
      .select()
      .from(fleetEvent)
      .where(whereClause)
      .orderBy(desc(fleetEvent.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(fleetEvent)
      .where(whereClause),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      events,
      total: totalResult[0]?.total ?? 0,
    },
  });
}
