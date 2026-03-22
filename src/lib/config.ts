export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://overnightdesk.com";
}
