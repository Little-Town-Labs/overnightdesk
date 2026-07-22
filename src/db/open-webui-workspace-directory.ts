import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  oauthClient,
  personaAssignment,
  resourceBinding,
  runtimeIdentity,
  useCase,
  useCaseMembership,
} from "@/db/schema";
import type {
  AgentDirectoryStore,
  AgentWorkspaceRecord,
} from "@/lib/open-webui-workspace";

type Database = typeof db;

interface AuthorizedRuntime {
  useCaseId: string;
  runtimeIdentityId: string;
  runtimeSlug: string;
  runtimeStatus: "planned" | "active" | "suspended" | "retired";
  membershipRole: "owner" | "operator" | "member" | "viewer";
  useCaseName: string;
  personaKey: string;
  personaName: string;
}

async function listAuthorizedRuntimes(
  userId: string,
  database: Database,
): Promise<AuthorizedRuntime[]> {
  const rows = await database
    .select({
      useCaseId: useCase.id,
      runtimeIdentityId: runtimeIdentity.id,
      runtimeSlug: runtimeIdentity.slug,
      runtimeStatus: runtimeIdentity.status,
      membershipRole: useCaseMembership.role,
      useCaseName: useCase.displayName,
      personaKey: personaAssignment.personaKey,
      personaName: personaAssignment.displayName,
    })
    .from(useCaseMembership)
    .innerJoin(useCase, eq(useCaseMembership.useCaseId, useCase.id))
    .innerJoin(
      runtimeIdentity,
      and(
        eq(runtimeIdentity.useCaseId, useCase.id),
        or(
          isNull(useCaseMembership.runtimeIdentityId),
          eq(useCaseMembership.runtimeIdentityId, runtimeIdentity.id),
        ),
      ),
    )
    .innerJoin(
      personaAssignment,
      and(
        eq(personaAssignment.runtimeIdentityId, runtimeIdentity.id),
        eq(personaAssignment.isDefault, true),
        eq(personaAssignment.status, "active"),
      ),
    )
    .where(
      and(
        eq(useCaseMembership.userId, userId),
        eq(useCaseMembership.status, "active"),
        or(
          isNull(useCaseMembership.expiresAt),
          gt(useCaseMembership.expiresAt, new Date()),
        ),
        eq(useCase.status, "active"),
        eq(runtimeIdentity.status, "active"),
      ),
    );

  return Array.from(
    new Map(rows.map((row) => [row.runtimeIdentityId, row])).values(),
  );
}

function callbackHost(redirectUris: string[]): string | null {
  if (redirectUris.length !== 1) return null;
  try {
    const callback = new URL(redirectUris[0]);
    if (
      callback.protocol !== "https:" ||
      callback.port ||
      callback.username ||
      callback.password ||
      callback.pathname !== "/oauth/oidc/callback" ||
      callback.search ||
      callback.hash ||
      !callback.hostname.endsWith(".overnightdesk.com")
    ) {
      return null;
    }
    return callback.hostname;
  } catch {
    return null;
  }
}

async function resolveWorkspace(
  runtime: AuthorizedRuntime,
  database: Database,
): Promise<AgentWorkspaceRecord | null> {
  const bindings = await database
    .select({
      provider: resourceBinding.provider,
      kind: resourceBinding.kind,
      value: resourceBinding.value,
    })
    .from(resourceBinding)
    .where(
      and(
        eq(resourceBinding.useCaseId, runtime.useCaseId),
        eq(resourceBinding.runtimeIdentityId, runtime.runtimeIdentityId),
        eq(resourceBinding.state, "active"),
      ),
    );
  const clientIds = bindings
    .filter(
      (binding) =>
        binding.provider === "better-auth" && binding.kind === "oidc_client",
    )
    .map((binding) => binding.value);
  if (clientIds.length === 0) return null;

  const clients = await database
    .select({
      clientId: oauthClient.clientId,
      disabled: oauthClient.disabled,
      redirectUris: oauthClient.redirectUris,
      metadata: oauthClient.metadata,
    })
    .from(oauthClient)
    .where(inArray(oauthClient.clientId, clientIds));
  const workspaceClients = clients.filter((client) => {
    const metadata = client.metadata;
    return (
      !client.disabled &&
      metadata?.kind === "open-webui" &&
      metadata.schemaVersion === 1 &&
      metadata.useCaseId === runtime.useCaseId &&
      metadata.runtimeIdentityId === runtime.runtimeIdentityId &&
      typeof metadata.deploymentId === "string"
    );
  });
  if (workspaceClients.length !== 1) return null;

  const client = workspaceClients[0];
  const deploymentId = client.metadata?.deploymentId;
  const host = callbackHost(client.redirectUris);
  if (typeof deploymentId !== "string" || !host) return null;

  const hasContainer = bindings.some(
    (binding) =>
      binding.provider === "docker" &&
      binding.kind === "container" &&
      binding.value === deploymentId,
  );
  const hasHost = bindings.some(
    (binding) =>
      binding.provider === "overnightdesk" &&
      binding.kind === "hostname" &&
      binding.value === host,
  );
  if (!hasContainer || !hasHost) return null;

  return {
    ...runtime,
    deploymentId,
    host,
  };
}

export function createOpenWebuiWorkspaceDirectoryStore(
  database: Database = db,
): AgentDirectoryStore {
  return {
    async listAuthorizedAgents(userId) {
      const runtimes = await listAuthorizedRuntimes(userId, database);
      const workspaceCapabilities = await Promise.all(
        runtimes.map((runtime) => resolveWorkspace(runtime, database)),
      );
      return runtimes.map((runtime, index) =>
        workspaceCapabilities[index] ?? {
          ...runtime,
          deploymentId: null,
          host: null,
        },
      );
    },
  };
}

export const openWebuiWorkspaceDirectoryStore =
  createOpenWebuiWorkspaceDirectoryStore();
