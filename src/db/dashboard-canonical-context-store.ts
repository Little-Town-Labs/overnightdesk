import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  resourceBinding,
  runtimeIdentity,
  useCase,
} from "@/db/schema";
import {
  hasExactCanonicalDashboardContext,
  type DashboardCanonicalContextRequirement,
} from "@/lib/dashboard-canonical-context";

type Database = typeof db;
type RequiredBindingKind =
  | "platform_instance"
  | "hostname"
  | "oidc_client";

function bindingRequirements(
  requirement: DashboardCanonicalContextRequirement,
): Array<{ provider: string; kind: RequiredBindingKind; value: string }> {
  const bindings: Array<{
    provider: string;
    kind: RequiredBindingKind;
    value: string;
  }> = [
    {
      provider: "overnightdesk",
      kind: "platform_instance",
      value: requirement.tenantId,
    },
    {
      provider: "nginx",
      kind: "hostname",
      value: requirement.hostname,
    },
  ];
  if (requirement.oidc) {
    bindings.push({
      provider: "better-auth",
      kind: "oidc_client",
      value: requirement.oidc.clientId,
    });
  }
  return bindings;
}

export async function readDashboardCanonicalContext(
  requirement: DashboardCanonicalContextRequirement,
  database: Database = db,
): Promise<boolean> {
  const requiredBindings = bindingRequirements(requirement);
  const [useCases, runtimes, bindings] = await Promise.all([
    database
      .select({
        id: useCase.id,
        slug: useCase.slug,
        status: useCase.status,
      })
      .from(useCase)
      .where(eq(useCase.id, requirement.useCaseId))
      .limit(2),
    database
      .select({
        id: runtimeIdentity.id,
        useCaseId: runtimeIdentity.useCaseId,
        slug: runtimeIdentity.slug,
        status: runtimeIdentity.status,
      })
      .from(runtimeIdentity)
      .where(eq(runtimeIdentity.id, requirement.runtimeIdentityId))
      .limit(2),
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
      .where(
        and(
          ne(resourceBinding.state, "retired"),
          or(
            ...requiredBindings.map((binding) =>
              and(
                eq(resourceBinding.provider, binding.provider),
                eq(resourceBinding.kind, binding.kind),
                eq(resourceBinding.value, binding.value),
              ),
            ),
          ),
        ),
      )
      .limit(requiredBindings.length + 1),
  ]);

  return hasExactCanonicalDashboardContext(
    { useCases, runtimes, bindings },
    requirement,
  );
}
