import {
  buildManagedVariableAuditRecord,
  recordManagedVariableAuditEvent,
  type ManagedVariableAuditEvent,
} from "@/lib/managed-agent-variable-audit";

const event: ManagedVariableAuditEvent = {
  stage: "outcome",
  actorId: "better-auth-user-id",
  useCaseId: "11111111-1111-4111-8111-111111111111",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
  variableId: "openrouter_api_key",
  requestId: "018f6f54-8c2f-4a33-8f28-a7e73f4a3111",
  outcome: "replaced",
};

describe("managed variable audit", () => {
  it("builds metadata-only attempt and outcome records", () => {
    expect(buildManagedVariableAuditRecord(event)).toEqual({
      actor: "better-auth-user-id",
      action: "managed_variable_replacement.outcome",
      target: "runtime:22222222-2222-4222-8222-222222222222",
      details: {
        useCaseId: "11111111-1111-4111-8111-111111111111",
        runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
        variableId: "openrouter_api_key",
        requestId: "018f6f54-8c2f-4a33-8f28-a7e73f4a3111",
        outcome: "replaced",
      },
    });
  });

  it("ignores forbidden extra values instead of creating a derivative secret oracle", () => {
    const sentinel = "DO_NOT_AUDIT_THIS_SECRET";
    const record = buildManagedVariableAuditRecord({
      ...event,
      value: sentinel,
      valueHash: sentinel,
      email: sentinel,
      externalBody: sentinel,
    } as ManagedVariableAuditEvent & Record<string, string>);

    expect(JSON.stringify(record)).not.toContain(sentinel);
    expect(JSON.stringify(record)).not.toMatch(/value|hash|email|externalBody/i);
  });

  it("propagates audit persistence failure so callers fail closed", async () => {
    const writer = jest.fn().mockRejectedValue(new Error("audit unavailable"));

    await expect(recordManagedVariableAuditEvent(event, writer)).rejects.toThrow(
      "audit unavailable",
    );
  });
});
