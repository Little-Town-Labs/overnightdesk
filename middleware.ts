import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPublicRoute, getSignInRedirectUrl } from "@/lib/middleware-utils";

export default async function middleware(req: NextRequest) {
  const hostname = req.nextUrl.hostname;

  // Redirect www to non-www to avoid CORS issues
  if (hostname === "www.overnightdesk.com") {
    const url = req.nextUrl.clone();
    url.hostname = "overnightdesk.com";
    return NextResponse.redirect(url, 301);
  }

  const { pathname } = req.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return NextResponse.redirect(
      getSignInRedirectUrl(req.url, pathname)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
