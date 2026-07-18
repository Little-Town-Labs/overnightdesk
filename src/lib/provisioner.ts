import { getCanonicalServiceOrigin } from "@/lib/config";

export interface DashboardAuthParams {
  provider: "self-hosted";
  issuer: string;
  clientId: string;
  publicUrl: string;
  callbackUrl: string;
  scopes: readonly ["openid", "profile", "email"];
}

interface ProvisionParams {
  tenantId: string;
  subdomain: string;
  plan: "starter" | "pro";
  callbackUrl: string;
  dashboardAuth: DashboardAuthParams;
}

export interface ConfigureDashboardAuthParams {
  tenantId: string;
  dashboardAuth: DashboardAuthParams;
  restart: boolean;
}

export interface HermesMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface HermesSession {
  id: string;
  source: string; // telegram | api_server | discord | cli
  started_at: number;
  ended_at: number | null;
  message_count: number;
  title: string | null;
  est_cost: number;
  messages: HermesMessage[];
}

interface WriteSecretsParams {
  tenantId: string;
  secrets: Record<string, string>;
}

interface ProvisionerResult {
  success: boolean;
  error?: string;
}

function getConfig() {
  return {
    url: process.env.PROVISIONER_URL || "",
    secret: process.env.PROVISIONER_SECRET || "",
  };
}

function getProvisionerEndpoint(baseUrl: string, path: string): string {
  const origin = getCanonicalServiceOrigin(baseUrl, "PROVISIONER_URL");
  return new URL(path, `${origin}/`).toString();
}

export const provisionerClient = {
  async provision(params: ProvisionParams): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(getProvisionerEndpoint(url, "/provision"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Provisioner returned ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async restart(tenantId: string): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(getProvisionerEndpoint(url, "/restart"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ tenantId }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Provisioner returned ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async configureDashboardAuth(
    params: ConfigureDashboardAuthParams
  ): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(
        getProvisionerEndpoint(url, "/dashboard-auth"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Provisioner returned ${response.status}`,
        };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async writeSecrets(params: WriteSecretsParams): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(getProvisionerEndpoint(url, "/write-secrets"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return { success: false, error: `Provisioner returned ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  async getSessions(containerId: string): Promise<{ sessions: HermesSession[] } | null> {
    const { url, secret } = getConfig();
    try {
      const response = await fetch(
        getProvisionerEndpoint(
          url,
          `/sessions?containerId=${encodeURIComponent(containerId)}`
        ),
        {
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

  async getMitchelProspectingSummary(containerId: string): Promise<unknown | null> {
    const { url, secret } = getConfig();
    try {
      const response = await fetch(
        getProvisionerEndpoint(
          url,
          `/mitchel/prospecting/summary?containerId=${encodeURIComponent(containerId)}`
        ),
        {
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

  async deprovision(tenantId: string): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(getProvisionerEndpoint(url, "/deprovision"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ tenantId }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Provisioner returned ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
