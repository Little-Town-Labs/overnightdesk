import { db } from "@/db";
import { waitlist, platformAuditLog } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export interface WaitlistConversionResult {
  isWaitlisted: boolean;
  waitlistEntry?: {
    id: string;
    email: string;
    name: string | null;
    business: string | null;
    createdAt: Date;
  };
}

export async function checkWaitlistConversion(
  email: string
): Promise<WaitlistConversionResult> {
  const normalizedEmail = email.toLowerCase();

  const entries = await db
    .select()
    .from(waitlist)
    .where(eq(sql`lower(${waitlist.email})`, normalizedEmail))
    .limit(1);

  if (entries.length === 0) {
    return { isWaitlisted: false };
  }

  return {
    isWaitlisted: true,
    waitlistEntry: entries[0],
  };
}

export async function logWaitlistConversion(
  userId: string,
  email: string,
  waitlistEntryId: string
): Promise<void> {
  await db.insert(platformAuditLog).values({
    actor: userId,
    action: "waitlist_conversion",
    target: `waitlist:${waitlistEntryId}`,
    details: { email, convertedAt: new Date().toISOString() },
  });
}
