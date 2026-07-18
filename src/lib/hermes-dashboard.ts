export interface HermesDashboardLinkage {
  authStatus?: "legacy" | "pending" | "active" | "disabled" | "error";
  clientId?: string | null;
}

export function getHermesDashboardUrl(
  subdomain: string,
  linkage?: HermesDashboardLinkage
): string {
  const root = `https://${subdomain}`;
  return linkage?.authStatus === "active" && linkage.clientId
    ? root
    : `${root}/login`;
}
