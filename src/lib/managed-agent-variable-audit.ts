import { and, eq, gt, sql } from "drizzle-orm";
import { platformAuditLog } from "@/db/schema";
import type { ManagedVariableId } from "@/lib/managed-agent-variable";

export type ManagedVariableAuditOutcome =
  | "attempted"
  | "denied"
  | "replaced"
  | "runtime_effect_failed"
  | "write_failed";

export interface ManagedVariableAuditEvent {
  stage: "attempt" | "outcome";
  actorId: string;
  useCaseId: string;
  runtimeIdentityId: string;
  variableId: ManagedVariableId;
  requestId: string;
  outcome: ManagedVariableAuditOutcome;
  reason?:
    | "audit_unavailable"
    | "boundary_unavailable"
    | "external_failure"
    | "runtime_effect_failure";
}

export function buildManagedVariableAuditRecord(event: ManagedVariableAuditEvent) {
  return {
    actor: event.actorId,
    action: `managed_variable_replacement.${event.stage}`,
    target: `runtime:${event.runtimeIdentityId}`,
    details: {
      useCaseId: event.useCaseId,
      runtimeIdentityId: event.runtimeIdentityId,
      variableId: event.variableId,
      requestId: event.requestId,
      outcome: event.outcome,
      ...(event.reason ? { reason: event.reason } : {}),
    },
  };
}

type AuditWriter = (
  record: ReturnType<typeof buildManagedVariableAuditRecord>,
) => Promise<unknown>;

async function defaultAuditWriter(
  record: ReturnType<typeof buildManagedVariableAuditRecord>,
): Promise<void> {
  const { db } = await import("@/db");
  await db.insert(platformAuditLog).values(record);
}

export async function recordManagedVariableAuditEvent(
  event: ManagedVariableAuditEvent,
  writer: AuditWriter = defaultAuditWriter,
): Promise<void> {
  await writer(buildManagedVariableAuditRecord(event));
}

export async function claimManagedVariableAttempt(
  event: Omit<ManagedVariableAuditEvent, "stage" | "outcome">,
): Promise<"claimed" | "duplicate" | "rate_limited"> {
  const { db } = await import("@/db");
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`managed-variable:${event.actorId}`}, 0))`,
    );
    const prior = await transaction
      .select({ id: platformAuditLog.id })
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.action, "managed_variable_replacement.attempt"),
          sql`${platformAuditLog.details}->>'requestId' = ${event.requestId}`,
        ),
      )
      .limit(1);
    if (prior.length > 0) return "duplicate" as const;

    const recent = await transaction
      .select({ id: platformAuditLog.id })
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.actor, event.actorId),
          eq(platformAuditLog.action, "managed_variable_replacement.attempt"),
          gt(platformAuditLog.createdAt, new Date(Date.now() - 10 * 60_000)),
        ),
      )
      .limit(3);
    if (recent.length >= 3) return "rate_limited" as const;

    await transaction.insert(platformAuditLog).values(
      buildManagedVariableAuditRecord({
        ...event,
        stage: "attempt",
        outcome: "attempted",
      }),
    );
    return "claimed" as const;
  });
}
