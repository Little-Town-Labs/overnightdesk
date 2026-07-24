import { requireAuditActor } from "@/lib/audit-actor";

describe("value-free audit actor", () => {
  it.each([
    undefined,
    "",
    "  ",
    " operator:feature-024 ",
    "operator@example.test",
    "https://operator.example.test",
    "TOKEN=secret-value",
    "operator:\nfeature-024",
    `operator:${"x".repeat(120)}`,
  ])("rejects an unsafe actor identifier", (value) => {
    expect(() => requireAuditActor(value)).toThrow("Audit actor is invalid");
  });

  it.each([
    "operator:feature-024",
    "deployment-operator",
    "operator:feature-024.discovered-work",
  ])("accepts a bounded namespaced actor identifier", (value) => {
    expect(requireAuditActor(value)).toBe(value);
  });
});
