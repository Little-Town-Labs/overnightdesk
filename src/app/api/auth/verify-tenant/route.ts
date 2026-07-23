import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dashboardAuthorizationStore } from "@/db/dashboard-authorization-store";
import { isApprovedDashboardHost } from "@/lib/dashboard-authorization";

export const dynamic = "force-dynamic";

const unauthorized = () => new NextResponse(null, { status: 401 });

export async function GET(request: NextRequest) {
  const host = request.headers.get("x-original-host");
  if (!host || !isApprovedDashboardHost(host)) return unauthorized();

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return unauthorized();
    const decision = await dashboardAuthorizationStore.authorize({
      requestedHost: host,
      userId: session.user.id,
      ...(request.headers.get("x-request-id")
        ? { requestId: request.headers.get("x-request-id")! }
        : {}),
    });
    if (!decision.authorized) return unauthorized();
    return new NextResponse(null, { status: 200 });
  } catch {
    return unauthorized();
  }
}
