import { platformAuditLog } from "@/db/schema";
import type { IdentityResolutionAuditEvent } from "@/lib/canonical-identity";

interface PlatformAuditDatabase {
  insert(table: typeof platformAuditLog): {
    values(
      value: typeof platformAuditLog.$inferInsert
    ): PromiseLike<unknown>;
  };
}

export function createPlatformIdentityAudit(database: PlatformAuditDatabase) {
  return async (event: IdentityResolutionAuditEvent): Promise<void> => {
    await database.insert(platformAuditLog).values({
      actor: "identity-resolver",
      action: event.eventType,
      target: event.expectedUseCaseId,
      details: {
        selectorType: event.selectorType,
        expectedUseCaseId: event.expectedUseCaseId,
        resolvedUseCaseId: event.resolvedUseCaseId,
        expectedRuntimeId: event.expectedRuntimeId,
        resolvedRuntimeId: event.resolvedRuntimeId,
      },
    });
  };
}
