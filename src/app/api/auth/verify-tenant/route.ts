import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInstanceForUser } from "@/lib/instance";

const unauthorized = () => new NextResponse(null, { status: 401 });

export async function GET(request: NextRequest) {
  // Called by nginx auth_request — passes Cookie + X-Original-Host headers
  const host = request.headers.get("x-original-host");
  if (!host) return unauthorized();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return unauthorized();

  const instance = await getInstanceForUser(session.user.id);
  if (!instance || instance.status !== "running") return unauthorized();

  // Confirm the requested subdomain belongs to this user's instance
  if (instance.subdomain !== host) return unauthorized();

  return new NextResponse(null, { status: 200 });
}
