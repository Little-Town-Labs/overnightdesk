export function getCanonicalServiceOrigin(value: string, name: string): string {
  const normalized = value.trim();
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]");
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an origin-only HTTPS URL`);
  }

  return url.origin;
}

export function getAppUrl(): string {
  return getCanonicalServiceOrigin(
    process.env.NEXT_PUBLIC_APP_URL || "https://overnightdesk.com",
    "NEXT_PUBLIC_APP_URL"
  );
}

export function getBetterAuthUrl(): string {
  return getCanonicalServiceOrigin(
    process.env.BETTER_AUTH_URL || getAppUrl(),
    "BETTER_AUTH_URL"
  );
}
