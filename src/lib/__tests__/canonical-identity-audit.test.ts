import { platformAuditLog } from "@/db/schema";
import { createPlatformIdentityAudit } from "@/lib/canonical-identity-audit";
import type { IdentityResolutionAuditEvent } from "@/lib/canonical-identity";

describe("createPlatformIdentityAudit", () => {
  it("stores only the allowlisted canonical-resolution metadata", async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const database = { insert: jest.fn(() => ({ values })) };
    const audit = createPlatformIdentityAudit(database);
    const event: IdentityResolutionAuditEvent = {
      eventType: "canonical_resolution_mismatch",
      selectorType: "resource_binding",
      expectedUseCaseId: "11111111-1111-4111-8111-111111111111",
      resolvedUseCaseId: "33333333-3333-4333-8333-333333333333",
      expectedRuntimeId: "22222222-2222-4222-8222-222222222222",
      resolvedRuntimeId: null,
    };

    await audit(event);

    expect(database.insert).toHaveBeenCalledWith(platformAuditLog);
    expect(values).toHaveBeenCalledWith({
      actor: "identity-resolver",
      action: "canonical_resolution_mismatch",
      target: event.expectedUseCaseId,
      details: {
        selectorType: "resource_binding",
        expectedUseCaseId: event.expectedUseCaseId,
        resolvedUseCaseId: event.resolvedUseCaseId,
        expectedRuntimeId: event.expectedRuntimeId,
        resolvedRuntimeId: event.resolvedRuntimeId,
      },
    });
    expect(JSON.stringify(values.mock.calls)).not.toContain("value");
    expect(JSON.stringify(values.mock.calls)).not.toContain("hostname");
  });
});
