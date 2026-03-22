import { db } from "@/db";
import { subscription } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export function isBillingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
}

export function isAdmin(email: string): boolean {
  const adminEmails = process.env.ADMIN_EMAILS;
  if (!adminEmails) return false;

  const list = adminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return list.includes(email.toLowerCase());
}

export function isInvitedEmail(email: string): boolean {
  const invitedEmails = process.env.INVITED_EMAILS;
  if (!invitedEmails) return false;

  const list = invitedEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return list.includes(email.toLowerCase());
}

export async function getSubscriptionForUser(userId: string) {
  const rows = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId));

  return rows[0] ?? null;
}

interface SubscriptionResult {
  allowed: boolean;
  reason?: "billing_disabled" | "admin" | "no_subscription" | "canceled";
  subscription?: typeof subscription.$inferSelect;
}

export async function requireSubscription(
  userId: string,
  userEmail: string
): Promise<SubscriptionResult> {
  if (!isBillingEnabled()) {
    return { allowed: true, reason: "billing_disabled" };
  }

  if (isAdmin(userEmail)) {
    return { allowed: true, reason: "admin" };
  }

  const rows = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId));

  const activeSub = rows.find(
    (s) => s.status === "active" || s.status === "past_due"
  );

  if (activeSub) {
    return { allowed: true, subscription: activeSub };
  }

  return { allowed: false, reason: "no_subscription" };
}
