/**
 * Route protection utilities — extracted for testability.
 */

const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/verify-email",
  "/reset-password",
];

const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/waitlist",
  "/api/stripe/webhook",
  "/api/cron",
  "/api/provisioner/callback",
  "/api/email/unsubscribe",
];

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) {
    return true;
  }

  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }

  // Static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return true;
  }

  return false;
}

export function getSignInRedirectUrl(
  requestUrl: string,
  pathname: string
): string {
  const url = new URL("/sign-in", requestUrl);
  if (pathname !== "/") {
    url.searchParams.set("callbackUrl", pathname);
  }
  return url.toString();
}
