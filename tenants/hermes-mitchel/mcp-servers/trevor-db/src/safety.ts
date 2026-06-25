const SENSITIVE_PATTERNS = [
  /token/gi,
  /secret/gi,
  /password/gi,
  /authorization/gi,
  /bearer/gi
];

export function sanitizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return SENSITIVE_PATTERNS.reduce((msg, pattern) => msg.replace(pattern, "[redacted]"), raw);
}

export function noteSummary(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const normalized = notes.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

export function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._:-]{8,}/gi, "Bearer [redacted]")
    .replace(/(CAMOFOX_API_KEY|BROWSERACT_API_KEY|AGILED_API_KEY|TREVOR_DB_URL)\s*=\s*\S+/gi, "$1=[redacted]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
    .replace(/app-[A-Za-z0-9._:-]{8,}/g, "[redacted]")
    .replace(/[A-Fa-f0-9]{32,}/g, "[redacted]");
}

export function boundedNote(value: string | null | undefined, max = 1000): string | null {
  const normalized = redactSecrets(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

export function rejectSendCapableAction(action: string): void {
  const normalized = action.toLowerCase();
  if (/(send|text|email|message|dm|telegram|sms)/.test(normalized)) {
    throw new Error("Daily call queue cannot send or trigger outbound messages");
  }
}
