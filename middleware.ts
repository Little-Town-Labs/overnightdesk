import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPublicRoute, getSignInRedirectUrl } from "@/lib/middleware-utils";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin") ?? "";
  const hostname = req.nextUrl.hostname;

  // Redirect www to non-www for page navigations (not API/fetch requests)
  if (
    hostname === "www.overnightdesk.com" &&
    !pathname.startsWith("/api/")
  ) {
    const url = req.nextUrl.clone();
    url.hostname = "overnightdesk.com";
    return NextResponse.redirect(url, 301);
  }

  // Handle CORS preflight from www subdomain
  if (
    req.method === "OPTIONS" &&
    origin === "https://www.overnightdesk.com"
  ) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (isPublicRoute(pathname)) {
    const response = NextResponse.next();
    if (origin === "https://www.overnightdesk.com") {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }
    return response;
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
