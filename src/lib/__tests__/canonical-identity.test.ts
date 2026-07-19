import {
  compareCanonicalResolution,
  resolveCanonicalIdentity,
  type CanonicalIdentity,
  type CanonicalIdentityStore,
  type IdentityResolutionAuditEvent,
} from "@/lib/canonical-identity";

const canonicalIdentity: CanonicalIdentity = {
  useCaseId: "11111111-1111-4111-8111-111111111111",
  useCaseNumber: 17,
  useCaseSlug: "mitchel-business",
  runtimeId: "22222222-2222-4222-8222-222222222222",
  runtimeSlug: "trevor",
};

function createStore(
  result: CanonicalIdentity | null = canonicalIdentity
): CanonicalIdentityStore & { resolve: jest.Mock } {
  return { resolve: jest.fn().mockResolvedValue(result) };
}

describe("resolveCanonicalIdentity", () => {
  it("resolves canonical UUID selectors without treating them as resource names", async () => {
    const store = createStore();

    const result = await resolveCanonicalIdentity(
      { type: "use_case_id", value: canonicalIdentity.useCaseId },
      store
    );

    expect(result).toEqual(canonicalIdentity);
    expect(store.resolve).toHaveBeenCalledWith({
      type: "use_case_id",
      value: canonicalIdentity.useCaseId,
    });
  });

  it("accepts Tenet 0 as a safe zero-based lookup only", async () => {
    const store = createStore();

    await resolveCanonicalIdentity({ type: "use_case_number", value: 0 }, store);

    expect(store.resolve).toHaveBeenCalledWith({
      type: "use_case_number",
      value: 0,
    });
  });

  it("rejects invalid UUIDs and negative numbers before querying storage", async () => {
    const store = createStore();

    await expect(
      resolveCanonicalIdentity({ type: "use_case_id", value: "tenant-17" }, store)
    ).rejects.toThrow("Invalid canonical identity selector");
    await expect(
      resolveCanonicalIdentity({ type: "use_case_number", value: -1 }, store)
    ).rejects.toThrow("Invalid canonical identity selector");
    expect(store.resolve).not.toHaveBeenCalled();
  });

  it("supports legacy tenant and explicit resource-binding compatibility selectors", async () => {
    const store = createStore();

    await resolveCanonicalIdentity(
      { type: "legacy_tenant_id", value: "hermes-mitchel" },
      store
    );
    await resolveCanonicalIdentity(
      {
        type: "resource_binding",
        provider: "docker",
        kind: "container",
        value: "hermes-mitchel",
      },
      store
    );

    expect(store.resolve).toHaveBeenNthCalledWith(1, {
      type: "legacy_tenant_id",
      value: "hermes-mitchel",
    });
    expect(store.resolve).toHaveBeenNthCalledWith(2, {
      type: "resource_binding",
      provider: "docker",
      kind: "container",
      value: "hermes-mitchel",
    });
  });

  it("supports runtime, platform-instance, and orchestrator registry identifiers", async () => {
    const store = createStore();
    const orchestratorId = "44444444-4444-4444-8444-444444444444";

    await resolveCanonicalIdentity(
      { type: "runtime_id", value: canonicalIdentity.runtimeId! },
      store
    );
    await resolveCanonicalIdentity(
      { type: "instance_id", value: "platform-instance-1" },
      store
    );
    await resolveCanonicalIdentity(
      {
        type: "resource_binding",
        provider: "orchestrator",
        kind: "orchestrator_tenant",
        value: orchestratorId,
      },
      store
    );

    expect(store.resolve).toHaveBeenNthCalledWith(1, {
      type: "runtime_id",
      value: canonicalIdentity.runtimeId,
    });
    expect(store.resolve).toHaveBeenNthCalledWith(2, {
      type: "instance_id",
      value: "platform-instance-1",
    });
    expect(store.resolve).toHaveBeenNthCalledWith(3, {
      type: "resource_binding",
      provider: "orchestrator",
      kind: "orchestrator_tenant",
      value: orchestratorId,
    });
  });
});

describe("compareCanonicalResolution", () => {
  it("emits metadata-only match telemetry and returns the canonical result", async () => {
    const store = createStore();
    const events: IdentityResolutionAuditEvent[] = [];

    const result = await compareCanonicalResolution({
      selector: {
        type: "resource_binding",
        provider: "nginx",
        kind: "hostname",
        value: "private-value-that-must-not-be-logged.example.com",
      },
      expectedUseCaseId: canonicalIdentity.useCaseId,
      expectedRuntimeId: canonicalIdentity.runtimeId,
      store,
      audit: async (event) => events.push(event),
    });

    expect(result).toEqual(canonicalIdentity);
    expect(events).toEqual([
      {
        eventType: "canonical_resolution_match",
        selectorType: "resource_binding",
        expectedUseCaseId: canonicalIdentity.useCaseId,
        resolvedUseCaseId: canonicalIdentity.useCaseId,
        expectedRuntimeId: canonicalIdentity.runtimeId,
        resolvedRuntimeId: canonicalIdentity.runtimeId,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("private-value-that-must-not-be-logged");
  });

  it("emits mismatch telemetry without changing the legacy caller's authority", async () => {
    const store = createStore({
      ...canonicalIdentity,
      useCaseId: "33333333-3333-4333-8333-333333333333",
    });
    const events: IdentityResolutionAuditEvent[] = [];

    await compareCanonicalResolution({
      selector: { type: "instance_id", value: "legacy-instance-id" },
      expectedUseCaseId: canonicalIdentity.useCaseId,
      expectedRuntimeId: canonicalIdentity.runtimeId,
      store,
      audit: async (event) => events.push(event),
    });

    expect(events[0].eventType).toBe("canonical_resolution_mismatch");
    expect(events[0].selectorType).toBe("instance_id");
  });
});
