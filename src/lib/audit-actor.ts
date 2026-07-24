export function requireAuditActor(actor?: string) {
  const value = actor?.trim();
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$/.test(value)) {
    throw new Error("Audit actor is invalid");
  }
  return value;
}
