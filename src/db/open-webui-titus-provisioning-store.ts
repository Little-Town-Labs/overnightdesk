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
import {
  buildTitusOpenWebuiProvisioningSpec,
  classifyTitusOpenWebuiProvisioningSnapshot,
  verifyTitusOpenWebuiProvisioningSnapshot,
  type TitusOpenWebuiClient,
  type TitusOpenWebuiProvisioningSnapshot,
  type TitusOpenWebuiResourceBinding,
} from "@/lib/open-webui-titus-provisioning";
import { TITUS_OPEN_WEBUI } from "@/lib/open-webui-titus-canary";

type Database = typeof db;

export type TitusOpenWebuiProvisioningInspection =
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
      summary: ReturnType<typeof verifyTitusOpenWebuiProvisioningSnapshot>;
    };

function bindingKey(binding: readonly [string, string, string]): string {
  return binding.join("\u0000");
}

function mapClient(row: typeof oauthClient.$inferSelect): TitusOpenWebuiClient {
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
    grantTypes: row.grantTypes as TitusOpenWebuiClient["grantTypes"],
    responseTypes: row.responseTypes as ["code"],
    public: row.public as true,
    type: row.type as "user-agent-based",
    requirePKCE: row.requirePKCE as true,
    metadata: row.metadata as TitusOpenWebuiClient["metadata"],
  };
}

export async function inspectTitusOpenWebuiProvisioning(
  database: Database = db,
): Promise<TitusOpenWebuiProvisioningInspection> {
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
        eq(useCaseNumberAllocation.number, TITUS_OPEN_WEBUI.useCaseNumber),
        eq(useCase.slug, TITUS_OPEN_WEBUI.useCaseSlug),
        eq(runtimeIdentity.slug, TITUS_OPEN_WEBUI.runtimeSlug),
      ),
    );
  if (identities.length !== 1) {
    return { status: "blocked", reasons: ["Tenant 2 Titus identity is not exact"] };
  }
  const identity = identities[0];
  const expected = buildTitusOpenWebuiProvisioningSpec(identity);
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
      .where(eq(oauthClient.clientId, TITUS_OPEN_WEBUI.oidcClientId)),
  ]);

  const prerequisiteReasons: string[] = [];
  if (identity.useCaseStatus !== "active") prerequisiteReasons.push("Tenant 2 is not active");
  if (identity.runtimeStatus !== "active") prerequisiteReasons.push("Titus runtime identity is not active");
  if (owners.length !== 1) prerequisiteReasons.push("Tenant 2 must have exactly one active unexpired use-case owner");
  if (prerequisiteReasons.length > 0) return { status: "blocked", reasons: prerequisiteReasons };

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
    return { status: "blocked", reasons: ["Titus Open WebUI provisioning is partial or conflicts with another owner"] };
  }

  const snapshot: TitusOpenWebuiProvisioningSnapshot = {
    useCaseNumber: identity.useCaseNumber,
    useCaseStatus: identity.useCaseStatus,
    runtimeStatus: identity.runtimeStatus,
    activeOwnerMemberships: owners.length,
    resourceBindings: bindings
      .map((binding) => [binding.provider, binding.kind, binding.value] as TitusOpenWebuiResourceBinding)
      .sort((left, right) => expectedOrder.indexOf(bindingKey(left)) - expectedOrder.indexOf(bindingKey(right))),
    secretBoundary: expected.secretBoundary,
    client: mapClient(clients[0]),
  };
  const classification = classifyTitusOpenWebuiProvisioningSnapshot(snapshot);
  if (classification === "refresh-required") {
    return {
      status: "refresh-required",
      useCaseId: identity.useCaseId,
      runtimeIdentityId: identity.runtimeIdentityId,
      state: snapshot.client.disabled ? "disabled" : "enabled",
    };
  }
  if (classification === "current") {
    const summary = verifyTitusOpenWebuiProvisioningSnapshot(snapshot);
    return {
      status: "verified",
      useCaseId: identity.useCaseId,
      runtimeIdentityId: identity.runtimeIdentityId,
      state: summary.state,
      summary,
    };
  }
  return { status: "blocked", reasons: ["Titus Open WebUI provisioning contract has drifted"] };
}

export async function applyTitusOpenWebuiProvisioning(
  inspection: Extract<TitusOpenWebuiProvisioningInspection, { status: "ready" }>,
  actor: string,
  database: Database = db,
): Promise<void> {
  const spec = buildTitusOpenWebuiProvisioningSpec(inspection);
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
    database.insert(oauthClient).values({
      id: randomUUID(),
      ...spec.client,
    }),
    database.insert(platformAuditLog).values({
      actor,
      action: "titus_open_webui_provisioned_disabled",
      target: TITUS_OPEN_WEBUI.deploymentId,
      details: {
        useCaseNumber: TITUS_OPEN_WEBUI.useCaseNumber,
        resourceBindingCount: spec.resourceBindings.length,
        secretBoundaryCount: 1,
        oidcClientCount: 1,
        state: "disabled",
      },
    }),
  ] as const);
}

export async function setTitusOpenWebuiClientEnabled(
  enabled: boolean,
  actor: string,
  database: Database = db,
): Promise<void> {
  await database.batch([
    database
      .update(oauthClient)
      .set({ disabled: !enabled, updatedAt: new Date() })
      .where(eq(oauthClient.clientId, TITUS_OPEN_WEBUI.oidcClientId)),
    database.insert(platformAuditLog).values({
      actor,
      action: enabled
        ? "titus_open_webui_oidc_client_enabled"
        : "titus_open_webui_oidc_client_disabled",
      target: TITUS_OPEN_WEBUI.deploymentId,
      details: {
        useCaseNumber: TITUS_OPEN_WEBUI.useCaseNumber,
        state: enabled ? "enabled" : "disabled",
      },
    }),
  ] as const);
}

export async function applyTitusOpenWebuiRefreshContract(
  inspection: Extract<
    TitusOpenWebuiProvisioningInspection,
    { status: "refresh-required" }
  >,
  actor: string,
  database: Database = db,
): Promise<void> {
  const spec = buildTitusOpenWebuiProvisioningSpec(inspection);
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
          eq(oauthClient.clientId, TITUS_OPEN_WEBUI.oidcClientId),
          eq(oauthClient.scopes, ["openid", "email", "profile"]),
          eq(oauthClient.grantTypes, ["authorization_code"]),
        ),
      ),
    database.insert(platformAuditLog).values({
      actor,
      action: "titus_open_webui_oauth_refresh_contract_enabled",
      target: TITUS_OPEN_WEBUI.deploymentId,
      details: {
        useCaseNumber: TITUS_OPEN_WEBUI.useCaseNumber,
        state: inspection.state,
        grants: spec.client.grantTypes,
        scopes: spec.client.scopes,
        refreshTokenExpiresInSeconds: 7 * 24 * 60 * 60,
      },
    }),
  ] as const);
}
