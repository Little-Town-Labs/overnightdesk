import { and, eq } from "drizzle-orm";
import { secretBoundaryBinding } from "@/db/schema";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import {
  getManagedVariableDefinition,
  listManagedVariableDescriptors,
  type ManagedVariableControlDescriptor,
  type ManagedVariableDefinition,
} from "@/lib/managed-agent-variable";

export interface ManagedVariableBoundaryRow {
  phaseApp: string;
  environment: string;
  pathIdentifier: string;
}

export interface ManagedVariableBoundaryStore {
  listExactBindings(input: {
    useCaseId: string;
    runtimeIdentityId: string;
  }): Promise<ManagedVariableBoundaryRow[]>;
}

export interface LegacyProvisionerBoundaryConfig {
  phaseApp: string;
  environment: string;
}

export type ManagedVariableBoundaryResolution =
  | {
      status: "ready";
      boundaryKind: "legacy_tenant_path";
      tenantId: string;
    }
  | {
      status: "unavailable";
      reason:
        | "authority_unavailable"
        | "binding_ambiguous"
        | "instance_mismatch"
        | "provisioner_unsupported";
    };

const databaseStore: ManagedVariableBoundaryStore = {
  async listExactBindings({ useCaseId, runtimeIdentityId }) {
    const { db } = await import("@/db");
    return db
      .select({
        phaseApp: secretBoundaryBinding.phaseApp,
        environment: secretBoundaryBinding.environment,
        pathIdentifier: secretBoundaryBinding.pathIdentifier,
      })
      .from(secretBoundaryBinding)
      .where(
        and(
          eq(secretBoundaryBinding.useCaseId, useCaseId),
          eq(secretBoundaryBinding.runtimeIdentityId, runtimeIdentityId),
        ),
      );
  },
};

export function getLegacyProvisionerBoundaryConfig(): LegacyProvisionerBoundaryConfig | null {
  const phaseApp = process.env.LEGACY_PROVISIONER_PHASE_APP?.trim();
  const environment = process.env.LEGACY_PROVISIONER_PHASE_ENVIRONMENT?.trim();
  return phaseApp && environment ? { phaseApp, environment } : null;
}

export async function resolveManagedAgentVariableBoundary(
  {
    agent,
    definition,
    instance,
    legacyConfig = getLegacyProvisionerBoundaryConfig(),
  }: {
    agent: AgentDirectoryEntry;
    definition: ManagedVariableDefinition;
    instance: { runtimeIdentityId: string | null; tenantId: string } | null;
    legacyConfig?: LegacyProvisionerBoundaryConfig | null;
  },
  store: ManagedVariableBoundaryStore = databaseStore,
): Promise<ManagedVariableBoundaryResolution> {
  if (!instance || instance.runtimeIdentityId !== agent.runtimeIdentityId) {
    return { status: "unavailable", reason: "instance_mismatch" };
  }

  let bindings: ManagedVariableBoundaryRow[];
  try {
    bindings = await store.listExactBindings({
      useCaseId: agent.useCaseId,
      runtimeIdentityId: agent.runtimeIdentityId,
    });
  } catch {
    return { status: "unavailable", reason: "authority_unavailable" };
  }

  return resolveBoundaryFromBindings({
    bindings,
    definition,
    instance,
    legacyConfig,
  });
}

function resolveBoundaryFromBindings({
  bindings,
  definition,
  instance,
  legacyConfig,
}: {
  bindings: ManagedVariableBoundaryRow[];
  definition: ManagedVariableDefinition;
  instance: { tenantId: string };
  legacyConfig: LegacyProvisionerBoundaryConfig | null;
}): ManagedVariableBoundaryResolution {
  if (bindings.length !== 1) {
    return { status: "unavailable", reason: "binding_ambiguous" };
  }

  const binding = bindings[0];
  const supportsLegacyBoundary =
    definition.enabledBoundaryKinds.includes("legacy_tenant_path") &&
    legacyConfig !== null &&
    binding.phaseApp === legacyConfig.phaseApp &&
    binding.environment === legacyConfig.environment &&
    binding.pathIdentifier === `/${instance.tenantId}`;

  if (!supportsLegacyBoundary) {
    return { status: "unavailable", reason: "provisioner_unsupported" };
  }

  return {
    status: "ready",
    boundaryKind: "legacy_tenant_path",
    tenantId: instance.tenantId,
  };
}

export async function resolveManagedVariableControlDescriptors(
  {
    agent,
    instance,
    legacyConfig = getLegacyProvisionerBoundaryConfig(),
  }: {
    agent: AgentDirectoryEntry;
    instance: { runtimeIdentityId: string | null; tenantId: string } | null;
    legacyConfig?: LegacyProvisionerBoundaryConfig | null;
  },
  store: ManagedVariableBoundaryStore = databaseStore,
): Promise<ManagedVariableControlDescriptor[]> {
  const descriptors = listManagedVariableDescriptors();
  const readOnly = (availabilityDetail: string) =>
    descriptors.map((descriptor) => ({
      ...descriptor,
      availability: "read_only" as const,
      availabilityDetail,
    }));

  if (!instance || instance.runtimeIdentityId !== agent.runtimeIdentityId) {
    return readOnly("No exact platform runtime is available for replacement.");
  }

  let bindings: ManagedVariableBoundaryRow[];
  try {
    bindings = await store.listExactBindings({
      useCaseId: agent.useCaseId,
      runtimeIdentityId: agent.runtimeIdentityId,
    });
  } catch {
    return readOnly("Configuration authority is temporarily unavailable.");
  }

  return descriptors.map((descriptor) => {
    const definition = getManagedVariableDefinition(descriptor.id)!;
    const roleAllowed = definition.allowedRoles.includes(agent.membershipRole);
    const boundary = resolveBoundaryFromBindings({
      bindings,
      definition,
      instance,
      legacyConfig,
    });
    const writeOnly = roleAllowed && boundary.status === "ready";
    return {
      ...descriptor,
      availability: writeOnly ? ("write_only" as const) : ("read_only" as const),
      availabilityDetail: writeOnly
        ? "Enter a replacement value. The existing value remains hidden."
        : roleAllowed
          ? "Replacement is not enabled for this agent boundary."
          : "Your membership can view this variable but cannot replace it.",
    };
  });
}
