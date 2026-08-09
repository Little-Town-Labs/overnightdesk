function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isInternalAdmin(email: string): boolean {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const adminEmails = process.env.ADMIN_EMAILS;
  if (!adminEmails) return false;

  return adminEmails
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)
    .includes(normalizedEmail);
}
