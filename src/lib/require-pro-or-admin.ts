import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdmin, getSubscriptionForUser } from "@/lib/billing";

type ProOrAdminResult =
  | {
      ok: true;
      session: { user: { id: string; email: string; name: string } };
      isAdmin: boolean;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireProOrAdmin(): Promise<ProOrAdminResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  // Admin always allowed
  if (isAdmin(session.user.email)) {
    return { ok: true, session, isAdmin: true };
  }

  // Check subscription plan
  const subscription = await getSubscriptionForUser(session.user.id);
  if (!subscription || subscription.plan !== "pro") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Security screening requires Pro plan",
          upgrade: "/pricing",
        },
        { status: 403 }
      ),
    };
  }

  if (subscription.status !== "active" && subscription.status !== "past_due") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Subscription not active" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session, isAdmin: false };
}
