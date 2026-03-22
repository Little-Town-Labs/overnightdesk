export async function getAuthStatus(
  subdomain: string,
  apiKey: string
): Promise<"authenticated" | "not_authenticated" | "unknown"> {
  try {
    const response = await fetch(`https://${subdomain}/api/auth-status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return "unknown";

    const data = await response.json();
    return data.status ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function getTerminalTicket(
  subdomain: string,
  apiKey: string
): Promise<string | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/terminal/ticket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.ticket ?? null;
  } catch {
    return null;
  }
}
