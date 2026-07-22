import { and, eq } from "drizzle-orm";
import { secretBoundaryBinding } from "@/db/schema";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import {
  getManagedVariableDefinition,
  listManagedVariableDescriptors,
  type ManagedVariableControlDescriptor,
  type ManagedVariableDefinition,
  type ManagedVariableId,
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

export interface ManagedVariableProvisionerBoundaryConfig {
  boundaryId: string;
  phaseApp: string;
  environment: string;
  pathIdentifier: string;
  variableIds: readonly ManagedVariableId[];
}

export type ManagedVariableBoundaryResolution =
  | {
      status: "ready";
      boundaryKind: "managed_variable_v1";
      boundaryId: string;
    }
  | {
      status: "unavailable";
      reason:
        | "authority_unavailable"
        | "binding_ambiguous"
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

const qualifiedBoundaryPolicies = [
  {
    boundaryIdEnvironmentVariable:
      "MANAGED_VARIABLE_TITUS_RUNTIME_BOUNDARY_ID",
    phaseApp: "timeless-tech-solutions",
    environment: "production",
    pathIdentifier: "/agents/hermes-titus/runtime",
    variableIds: ["openrouter_api_key"],
  },
] as const;

const canonicalUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function getQualifiedManagedVariableBoundaries(): ManagedVariableProvisionerBoundaryConfig[] {
  return qualifiedBoundaryPolicies.flatMap((policy) => {
    const boundaryId =
      process.env[policy.boundaryIdEnvironmentVariable]?.trim() ?? "";
    return canonicalUuid.test(boundaryId)
      ? [{
          boundaryId,
          phaseApp: policy.phaseApp,
          environment: policy.environment,
          pathIdentifier: policy.pathIdentifier,
          variableIds: [...policy.variableIds],
        }]
      : [];
  });
}

export async function resolveManagedAgentVariableBoundary(
  {
    agent,
    definition,
    qualifiedBoundaries = getQualifiedManagedVariableBoundaries(),
  }: {
    agent: AgentDirectoryEntry;
    definition: ManagedVariableDefinition;
    instance: { runtimeIdentityId: string | null; tenantId: string } | null;
    qualifiedBoundaries?: readonly ManagedVariableProvisionerBoundaryConfig[];
  },
  store: ManagedVariableBoundaryStore = databaseStore,
): Promise<ManagedVariableBoundaryResolution> {
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
    qualifiedBoundaries,
  });
}

function resolveBoundaryFromBindings({
  bindings,
  definition,
  qualifiedBoundaries,
}: {
  bindings: ManagedVariableBoundaryRow[];
  definition: ManagedVariableDefinition;
  qualifiedBoundaries: readonly ManagedVariableProvisionerBoundaryConfig[];
}): ManagedVariableBoundaryResolution {
  const matches = qualifiedBoundaries.filter(
    (candidate) =>
      candidate.variableIds.includes(definition.id) &&
      bindings.some(
        (binding) =>
          binding.phaseApp === candidate.phaseApp &&
          binding.environment === candidate.environment &&
          binding.pathIdentifier === candidate.pathIdentifier,
      ),
  );
  if (matches.length > 1) {
    return { status: "unavailable", reason: "binding_ambiguous" };
  }
  if (matches.length === 0) {
    return { status: "unavailable", reason: "provisioner_unsupported" };
  }
  return {
    status: "ready",
    boundaryKind: "managed_variable_v1",
    boundaryId: matches[0].boundaryId,
  };
}

export async function resolveManagedVariableControlDescriptors(
  {
    agent,
    qualifiedBoundaries = getQualifiedManagedVariableBoundaries(),
  }: {
    agent: AgentDirectoryEntry;
    instance: { runtimeIdentityId: string | null; tenantId: string } | null;
    qualifiedBoundaries?: readonly ManagedVariableProvisionerBoundaryConfig[];
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
      qualifiedBoundaries,
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
