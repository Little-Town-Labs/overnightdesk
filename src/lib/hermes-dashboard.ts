export interface HermesDashboardLinkage {
  authStatus?: "legacy" | "pending" | "active" | "disabled" | "error";
  clientId?: string | null;
}

export function getHermesDashboardUrl(
  subdomain: string,
  linkage?: HermesDashboardLinkage
): string | null {
  const root = `https://${subdomain}`;
  if (linkage?.authStatus === "active" && linkage.clientId) return root;
  if (!linkage || linkage.authStatus === "legacy") return `${root}/login`;
  return null;
}

export function getHermesDashboardUnavailableMessage(
  linkage?: HermesDashboardLinkage
): string | null {
  if (linkage?.authStatus === "pending") {
    return "Dashboard sign-in is being configured. Try again shortly.";
  }
  if (linkage?.authStatus === "disabled") {
    return "Dashboard access is disabled for this account.";
  }
  if (
    linkage?.authStatus === "error" ||
    (linkage?.authStatus === "active" && !linkage.clientId)
  ) {
    return "Dashboard sign-in is unavailable. Recovery is required before launch.";
  }
  return null;
}
