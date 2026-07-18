export function getSafeSignInCallbackUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  try {
    const parsed = new URL(value, "https://overnightdesk.invalid");
    if (parsed.origin !== "https://overnightdesk.invalid") return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}
