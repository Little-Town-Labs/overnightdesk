interface ProvisionParams {
  tenantId: string;
  plan: "starter" | "pro";
  gatewayPort: number;
  dashboardTokenHash: string;
  callbackUrl: string;
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

export const provisionerClient = {
  async provision(params: ProvisionParams): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(`${url}/provision`, {
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

  async deprovision(tenantId: string): Promise<ProvisionerResult> {
    const { url, secret } = getConfig();

    try {
      const response = await fetch(`${url}/deprovision`, {
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
