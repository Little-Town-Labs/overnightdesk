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

export function rejectSendCapableAction(action: string): void {
  const normalized = action.toLowerCase();
  if (/(send|text|email|message|dm|telegram|sms)/.test(normalized)) {
    throw new Error("Daily call queue cannot send or trigger outbound messages");
  }
}
