import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  oauthClient,
  platformAuditLog,
  resourceBinding,
  runtimeIdentity,
  secretBoundaryBinding,
  useCase,
  useCaseMembership,
  useCaseNumberAllocation,
} from "@/db/schema";
import type { OpenWebuiDeployment } from "@/lib/open-webui-deployments";
import {
  buildOpenWebuiProvisioningSpec,
  classifyOpenWebuiProvisioningSnapshot,
  verifyOpenWebuiProvisioningSnapshot,
  type OpenWebuiClient,
  type OpenWebuiProvisioningSnapshot,
  type OpenWebuiResourceBinding,
} from "@/lib/open-webui-provisioning";

type Database = typeof db;

export type OpenWebuiProvisioningInspection =
  | { status: "blocked"; reasons: string[] }
  | { status: "ready"; useCaseId: string; runtimeIdentityId: string }
  | {
      status: "refresh-required";
      useCaseId: string;
      runtimeIdentityId: string;
      state: "disabled" | "enabled";
    }
  | {
      status: "verified";
      useCaseId: string;
      runtimeIdentityId: string;
      state: "disabled" | "enabled";
      summary: ReturnType<typeof verifyOpenWebuiProvisioningSnapshot>;
    };

function bindingKey(binding: readonly [string, string, string]) {
  return binding.join("\u0000");
}

function mapClient(row: typeof oauthClient.$inferSelect): OpenWebuiClient {
  return {
    clientId: row.clientId,
    clientSecret: row.clientSecret as null,
    disabled: row.disabled,
    skipConsent: row.skipConsent as true,
    enableEndSession: row.enableEndSession as true,
    subjectType: row.subjectType as "public",
    scopes: row.scopes ?? [],
    name: row.name ?? "",
    uri: row.uri ?? "",
    redirectUris: row.redirectUris,
    postLogoutRedirectUris: row.postLogoutRedirectUris ?? [],
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod as "none",
    grantTypes: row.grantTypes as OpenWebuiClient["grantTypes"],
    responseTypes: row.responseTypes as ["code"],
    public: row.public as true,
    type: row.type as "user-agent-based",
    requirePKCE: row.requirePKCE as true,
    metadata: row.metadata as OpenWebuiClient["metadata"],
  };
}

export async function inspectOpenWebuiProvisioning(
  deployment: OpenWebuiDeployment,
  database: Database = db,
): Promise<OpenWebuiProvisioningInspection> {
  const identities = await database
    .select({
      useCaseId: useCase.id,
      useCaseStatus: useCase.status,
      useCaseNumber: useCaseNumberAllocation.number,
      runtimeIdentityId: runtimeIdentity.id,
      runtimeStatus: runtimeIdentity.status,
    })
    .from(useCaseNumberAllocation)
    .innerJoin(useCase, eq(useCase.id, useCaseNumberAllocation.useCaseId))
    .innerJoin(runtimeIdentity, eq(runtimeIdentity.useCaseId, useCase.id))
    .where(
      and(
        eq(useCaseNumberAllocation.number, deployment.useCaseNumber),
        eq(useCase.slug, deployment.useCaseSlug),
        eq(runtimeIdentity.slug, deployment.runtimeSlug),
      ),
    );
  if (identities.length !== 1) {
    return { status: "blocked", reasons: ["Canonical Open WebUI identity is not exact"] };
  }
  const identity = identities[0];
  const expected = buildOpenWebuiProvisioningSpec(deployment, identity);
  const bindingPredicates = expected.resourceBindings.map(([provider, kind, value]) =>
    and(
      eq(resourceBinding.provider, provider),
      eq(resourceBinding.kind, kind),
      eq(resourceBinding.value, value),
      ne(resourceBinding.state, "retired"),
    ),
  );
  const now = new Date();
  const [owners, bindings, boundaries, clients] = await Promise.all([
    database
      .select({ id: useCaseMembership.id })
      .from(useCaseMembership)
      .where(
        and(
          eq(useCaseMembership.useCaseId, identity.useCaseId),
          isNull(useCaseMembership.runtimeIdentityId),
          eq(useCaseMembership.role, "owner"),
          eq(useCaseMembership.status, "active"),
          or(isNull(useCaseMembership.expiresAt), gt(useCaseMembership.expiresAt, now)),
        ),
      ),
    database
      .select({
        useCaseId: resourceBinding.useCaseId,
        runtimeIdentityId: resourceBinding.runtimeIdentityId,
        provider: resourceBinding.provider,
        kind: resourceBinding.kind,
        value: resourceBinding.value,
        state: resourceBinding.state,
      })
      .from(resourceBinding)
      .where(or(...bindingPredicates)),
    database
      .select({
        useCaseId: secretBoundaryBinding.useCaseId,
        runtimeIdentityId: secretBoundaryBinding.runtimeIdentityId,
        phaseApp: secretBoundaryBinding.phaseApp,
        environment: secretBoundaryBinding.environment,
        pathIdentifier: secretBoundaryBinding.pathIdentifier,
      })
      .from(secretBoundaryBinding)
      .where(
        and(
          eq(secretBoundaryBinding.phaseApp, expected.secretBoundary.phaseApp),
          eq(secretBoundaryBinding.environment, expected.secretBoundary.environment),
          eq(secretBoundaryBinding.pathIdentifier, expected.secretBoundary.pathIdentifier),
        ),
      ),
    database
      .select()
      .from(oauthClient)
      .where(eq(oauthClient.clientId, deployment.oidcClientId)),
  ]);

  const reasons: string[] = [];
  if (identity.useCaseStatus !== "active") reasons.push("Use case is not active");
  if (identity.runtimeStatus !== "active") reasons.push("Runtime identity is not active");
  if (owners.length !== 1) reasons.push("Use case must have exactly one active unexpired owner");
  if (reasons.length > 0) return { status: "blocked", reasons };
  if (bindings.length === 0 && boundaries.length === 0 && clients.length === 0) {
    return {
      status: "ready",
      useCaseId: identity.useCaseId,
      runtimeIdentityId: identity.runtimeIdentityId,
    };
  }

  const expectedOrder = expected.resourceBindings.map(bindingKey);
  const expectedKeys = [...expectedOrder].sort();
  const actualKeys = bindings
    .filter(
      (binding) =>
        binding.useCaseId === identity.useCaseId &&
        binding.runtimeIdentityId === identity.runtimeIdentityId &&
        binding.state === "active",
    )
    .map((binding) => bindingKey([binding.provider, binding.kind, binding.value]))
    .sort();
  const exactBoundary =
    boundaries.length === 1 &&
    boundaries[0].useCaseId === identity.useCaseId &&
    boundaries[0].runtimeIdentityId === identity.runtimeIdentityId;
  if (
    clients.length !== 1 ||
    JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys) ||
    !exactBoundary
  ) {
    return {
      status: "blocked",
      reasons: ["Open WebUI provisioning is partial or conflicts with another owner"],
    };
  }

  const snapshot: OpenWebuiProvisioningSnapshot = {
    useCaseNumber: identity.useCaseNumber,
    useCaseStatus: identity.useCaseStatus,
    runtimeStatus: identity.runtimeStatus,
    activeOwnerMemberships: owners.length,
    resourceBindings: bindings
      .map((binding) => [binding.provider, binding.kind, binding.value] as OpenWebuiResourceBinding)
      .sort(
        (left, right) =>
          expectedOrder.indexOf(bindingKey(left)) - expectedOrder.indexOf(bindingKey(right)),
      ),
    secretBoundary: expected.secretBoundary,
    client: mapClient(clients[0]),
  };
  const classification = classifyOpenWebuiProvisioningSnapshot(deployment, snapshot);
  if (classification === "refresh-required") {
    return {
      status: "refresh-required",
      useCaseId: identity.useCaseId,
      runtimeIdentityId: identity.runtimeIdentityId,
      state: snapshot.client.disabled ? "disabled" : "enabled",
    };
  }
  if (classification === "current") {
    const summary = verifyOpenWebuiProvisioningSnapshot(deployment, snapshot);
    return {
      status: "verified",
      useCaseId: identity.useCaseId,
      runtimeIdentityId: identity.runtimeIdentityId,
      state: summary.state,
      summary,
    };
  }
  return { status: "blocked", reasons: ["Open WebUI provisioning contract has drifted"] };
}

function auditPrefix(deployment: OpenWebuiDeployment) {
  return deployment.auditKey;
}

export async function applyOpenWebuiProvisioning(
  deployment: OpenWebuiDeployment,
  inspection: Extract<OpenWebuiProvisioningInspection, { status: "ready" }>,
  actor: string,
  database: Database = db,
) {
  const spec = buildOpenWebuiProvisioningSpec(deployment, inspection);
  await database.batch([
    database.insert(resourceBinding).values(
      spec.resourceBindings.map(([provider, kind, value]) => ({
        id: randomUUID(),
        useCaseId: inspection.useCaseId,
        runtimeIdentityId: inspection.runtimeIdentityId,
        provider,
        kind,
        value,
        state: "active" as const,
      })),
    ),
    database.insert(secretBoundaryBinding).values({
      id: randomUUID(),
      useCaseId: inspection.useCaseId,
      runtimeIdentityId: inspection.runtimeIdentityId,
      ...spec.secretBoundary,
    }),
    database.insert(oauthClient).values({ id: randomUUID(), ...spec.client }),
    database.insert(platformAuditLog).values({
      actor,
      action: `${auditPrefix(deployment)}_open_webui_provisioned_disabled`,
      target: deployment.deploymentId,
      details: {
        useCaseNumber: deployment.useCaseNumber,
        resourceBindingCount: spec.resourceBindings.length,
        secretBoundaryCount: 1,
        oidcClientCount: 1,
        state: "disabled",
      },
    }),
  ] as const);
}

export async function setOpenWebuiClientEnabled(
  deployment: OpenWebuiDeployment,
  enabled: boolean,
  actor: string,
  database: Database = db,
) {
  await database.batch([
    database
      .update(oauthClient)
      .set({ disabled: !enabled, updatedAt: new Date() })
      .where(eq(oauthClient.clientId, deployment.oidcClientId)),
    database.insert(platformAuditLog).values({
      actor,
      action: `${auditPrefix(deployment)}_open_webui_oidc_client_${enabled ? "enabled" : "disabled"}`,
      target: deployment.deploymentId,
      details: {
        useCaseNumber: deployment.useCaseNumber,
        state: enabled ? "enabled" : "disabled",
      },
    }),
  ] as const);
}

export async function applyOpenWebuiRefreshContract(
  deployment: OpenWebuiDeployment,
  inspection: Extract<OpenWebuiProvisioningInspection, { status: "refresh-required" }>,
  actor: string,
  database: Database = db,
) {
  const spec = buildOpenWebuiProvisioningSpec(deployment, inspection);
  await database.batch([
    database
      .update(oauthClient)
      .set({
        scopes: spec.client.scopes,
        grantTypes: spec.client.grantTypes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(oauthClient.clientId, deployment.oidcClientId),
          eq(oauthClient.scopes, ["openid", "email", "profile"]),
          eq(oauthClient.grantTypes, ["authorization_code"]),
        ),
      ),
    database.insert(platformAuditLog).values({
      actor,
      action: `${auditPrefix(deployment)}_open_webui_oauth_refresh_contract_enabled`,
      target: deployment.deploymentId,
      details: {
        useCaseNumber: deployment.useCaseNumber,
        state: inspection.state,
        grants: spec.client.grantTypes,
        scopes: spec.client.scopes,
        refreshTokenExpiresInSeconds: 7 * 24 * 60 * 60,
      },
    }),
  ] as const);
}
