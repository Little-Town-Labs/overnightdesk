import { chmod, rename, unlink, writeFile } from "node:fs/promises";

export type TitusDashboardOidcMutation = "ensure" | "activate" | "disable";

const confirmations: Record<TitusDashboardOidcMutation, string> = {
  ensure: "ENSURE_TITUS_DASHBOARD_OIDC_DISABLED",
  activate: "ACTIVATE_TITUS_DASHBOARD_OIDC",
  disable: "DISABLE_TITUS_DASHBOARD_OIDC",
};

export const TITUS_DASHBOARD_OIDC_CLIENT_FILE =
  "/tmp/overnightdesk-titus-dashboard-oidc-client-id";

export function requireTitusDashboardOidcConfirmation(
  mutation: TitusDashboardOidcMutation,
  value?: string,
) {
  if (value !== confirmations[mutation]) {
    throw new Error("Titus dashboard OIDC confirmation is required");
  }
}

export function validTitusDashboardOidcClientId(value: string) {
  return /^[A-Za-z0-9_-]{20,128}$/.test(value);
}

export async function stageTitusDashboardOidcClientId(
  clientId: string,
  outputFile = TITUS_DASHBOARD_OIDC_CLIENT_FILE,
) {
  if (!validTitusDashboardOidcClientId(clientId)) {
    throw new Error("Titus dashboard OIDC client is invalid");
  }
  const temporary = `${outputFile}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${clientId}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, outputFile);
    await chmod(outputFile, 0o600);
  } catch {
    await unlink(temporary).catch(() => undefined);
    throw new Error("Titus dashboard OIDC client staging failed");
  }
}
