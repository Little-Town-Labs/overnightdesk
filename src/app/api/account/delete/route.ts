import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { user, account, subscription, platformAuditLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

const deleteAccountSchema = z.object({
  password: z.string().min(1),
  confirmation: z.literal("DELETE"),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = deleteAccountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request. Password is required and confirmation must be exactly 'DELETE'." },
      { status: 400 }
    );
  }

  // Look up the credential account record to get the password hash
  const accounts = await db
    .select()
    .from(account)
    .where(
      and(
        eq(account.userId, session.user.id),
        eq(account.providerId, "credential")
      )
    );

  const credentialAccount = accounts[0];

  if (!credentialAccount?.password) {
    return NextResponse.json(
      { success: false, error: "Account not found" },
      { status: 401 }
    );
  }

  // Verify password
  const passwordValid = await bcrypt.compare(
    parsed.data.password,
    credentialAccount.password
  );

  if (!passwordValid) {
    return NextResponse.json(
      { success: false, error: "Invalid password" },
      { status: 401 }
    );
  }

  // Check for active subscription
  const subscriptions = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, session.user.id));

  const activeSub = subscriptions[0];

  // If subscription exists with a Stripe ID, cancel it
  if (activeSub?.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(activeSub.stripeSubscriptionId);
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to cancel subscription. Please try again or contact support." },
        { status: 500 }
      );
    }
  }

  // Insert audit log entry and delete user
  await db.insert(platformAuditLog).values({
    actor: session.user.id,
    action: "account_deleted",
  });

  // Delete the user (cascades to sessions, instances, etc.)
  await db.delete(user).where(eq(user.id, session.user.id));

  return NextResponse.json({ success: true });
}
