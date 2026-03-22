import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { getAppUrl } from "@/lib/config";
import { db } from "@/db";
import { subscription } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const subs = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, session.user.id));

  const sub = subs.find((s) => s.stripeCustomerId);

  if (!sub?.stripeCustomerId) {
    return NextResponse.json(
      { success: false, error: "No subscription found" },
      { status: 404 }
    );
  }

  const appUrl = getAppUrl();

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/dashboard`,
    });

    return NextResponse.json({
      success: true,
      data: { url: portalSession.url },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
