import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { isAdmin } from "@/lib/billing";
import { getAppUrl } from "@/lib/config";
import { db } from "@/db";
import { subscription } from "@/db/schema";
import { eq } from "drizzle-orm";

const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro"]),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  if (isAdmin(session.user.email)) {
    return NextResponse.json(
      { success: false, error: "Admin accounts do not need a subscription" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid plan. Must be 'starter' or 'pro'" },
      { status: 400 }
    );
  }

  // Check for existing active subscription
  const existing = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, session.user.id));

  const activeSub = existing.find(
    (s) => s.status === "active" || s.status === "past_due"
  );

  if (activeSub) {
    return NextResponse.json(
      { success: false, error: "You already have an active subscription" },
      { status: 400 }
    );
  }

  const priceId =
    parsed.data.plan === "pro"
      ? process.env.STRIPE_PRO_PRICE_ID
      : process.env.STRIPE_STARTER_PRICE_ID;

  if (!priceId) {
    return NextResponse.json(
      { success: false, error: "Billing is not configured" },
      { status: 500 }
    );
  }

  const appUrl = getAppUrl();

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: session.user.email,
      client_reference_id: session.user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
    });

    return NextResponse.json({
      success: true,
      data: { url: checkoutSession.url },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
