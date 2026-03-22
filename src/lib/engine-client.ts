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

export async function getEngineStatus(
  subdomain: string,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function getHeartbeatConfig(
  subdomain: string,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/heartbeat`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function updateHeartbeatConfig(
  subdomain: string,
  apiKey: string,
  config: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/heartbeat`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

function buildUrlWithParams(
  base: string,
  params?: Record<string, unknown>
): string {
  if (!params || Object.keys(params).length === 0) return base;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }

  return `${base}?${searchParams.toString()}`;
}

export async function getJobs(
  subdomain: string,
  apiKey: string,
  params?: Record<string, unknown>
): Promise<unknown[]> {
  try {
    const url = buildUrlWithParams(
      `https://${subdomain}/api/jobs`,
      params
    );

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];

    return await response.json();
  } catch {
    return [];
  }
}

export async function createJob(
  subdomain: string,
  apiKey: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function getJob(
  subdomain: string,
  apiKey: string,
  id: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/jobs/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function deleteJob(
  subdomain: string,
  apiKey: string,
  id: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://${subdomain}/api/jobs/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function getConversations(
  subdomain: string,
  apiKey: string,
  params?: Record<string, unknown>
): Promise<unknown[]> {
  try {
    const url = buildUrlWithParams(
      `https://${subdomain}/api/conversations`,
      params
    );

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];

    return await response.json();
  } catch {
    return [];
  }
}

export async function getConversationMessages(
  subdomain: string,
  apiKey: string,
  id: string,
  params?: Record<string, unknown>
): Promise<unknown[]> {
  try {
    const url = buildUrlWithParams(
      `https://${subdomain}/api/conversations/${id}/messages`,
      params
    );

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];

    return await response.json();
  } catch {
    return [];
  }
}

export async function getEngineLogs(
  subdomain: string,
  apiKey: string,
  lines?: number
): Promise<string[]> {
  try {
    const params = lines !== undefined ? { lines } : undefined;
    const url = buildUrlWithParams(
      `https://${subdomain}/api/logs`,
      params
    );

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];

    return await response.json();
  } catch {
    return [];
  }
}

export async function getTelegramConfig(
  subdomain: string,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/telegram`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function updateTelegramConfig(
  subdomain: string,
  apiKey: string,
  config: {
    bot_token: string;
    allowed_users: number[];
    enabled: boolean;
    webhook_base_url: string;
  }
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/telegram`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function deleteTelegramConfig(
  subdomain: string,
  apiKey: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://${subdomain}/api/telegram`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function getDiscordConfig(
  subdomain: string,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/discord`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function updateDiscordConfig(
  subdomain: string,
  apiKey: string,
  config: {
    bot_token: string;
    allowed_users: string[];
    enabled: boolean;
  }
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://${subdomain}/api/discord`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function deleteDiscordConfig(
  subdomain: string,
  apiKey: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://${subdomain}/api/discord`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}
