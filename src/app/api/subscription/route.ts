import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  isBillingEnabled,
  isAdmin,
  getSubscriptionForUser,
} from "@/lib/billing";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const billingEnabled = isBillingEnabled();
  const userIsAdmin = isAdmin(session.user.email);

  if (userIsAdmin) {
    return NextResponse.json({
      success: true,
      data: {
        hasSubscription: true,
        plan: "pro",
        status: "active",
        currentPeriodEnd: null,
        isAdmin: true,
        billingEnabled,
      },
    });
  }

  const sub = await getSubscriptionForUser(session.user.id);

  if (!sub) {
    return NextResponse.json({
      success: true,
      data: {
        hasSubscription: false,
        plan: null,
        status: null,
        currentPeriodEnd: null,
        isAdmin: false,
        billingEnabled,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      hasSubscription: true,
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      isAdmin: false,
      billingEnabled,
    },
  });
}
