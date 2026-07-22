export function isHermesTenant(
  instance: { containerId: string | null } | null,
): boolean {
  return instance?.containerId?.startsWith("hermes-") ?? false;
}
