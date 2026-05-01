interface CreateTenantParams {
  slug: string
  name: string
  plan: string
}

interface TenantView {
  tenant_id: string
  slug: string
  name: string
  container_name: string
  status: string
  plan: string
  created_at: string
  updated_at: string
}

interface OrchestratorResult {
  success: boolean
  tenant?: TenantView
  error?: string
}

function getConfig() {
  return {
    url: process.env.ORCHESTRATOR_URL || "",
    token: process.env.ORCHESTRATOR_OPERATOR_TOKEN || "",
  }
}

function isConfigured() {
  const { url, token } = getConfig()
  return Boolean(url && token)
}

export const orchestratorClient = {
  async createTenant(params: CreateTenantParams): Promise<OrchestratorResult> {
    if (!isConfigured()) {
      return { success: false, error: "Orchestrator not configured" }
    }
    const { url, token } = getConfig()

    try {
      const response = await fetch(`${url}/api/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": params.slug,
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(30_000),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
        return {
          success: false,
          error: body?.error?.message ?? `Orchestrator returned ${response.status}`,
        }
      }

      const body = await response.json() as { data: TenantView }
      return { success: true, tenant: body.data }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },

  async suspendTenant(tenantId: string, reason?: string): Promise<OrchestratorResult> {
    if (!isConfigured()) return { success: false, error: "Orchestrator not configured" }
    const { url, token } = getConfig()

    try {
      const qs = reason ? `?reason=${encodeURIComponent(reason)}` : ""
      const response = await fetch(`${url}/api/tenants/${tenantId}/suspend${qs}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      })
      return { success: response.ok, error: response.ok ? undefined : `Orchestrator returned ${response.status}` }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },

  async resumeTenant(tenantId: string): Promise<OrchestratorResult> {
    if (!isConfigured()) return { success: false, error: "Orchestrator not configured" }
    const { url, token } = getConfig()

    try {
      const response = await fetch(`${url}/api/tenants/${tenantId}/resume`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      })
      return { success: response.ok, error: response.ok ? undefined : `Orchestrator returned ${response.status}` }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },

  async destroyTenant(tenantId: string): Promise<OrchestratorResult> {
    if (!isConfigured()) return { success: false, error: "Orchestrator not configured" }
    const { url, token } = getConfig()

    try {
      const response = await fetch(`${url}/api/tenants/${tenantId}?confirm=true`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      })
      return { success: response.ok, error: response.ok ? undefined : `Orchestrator returned ${response.status}` }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}
