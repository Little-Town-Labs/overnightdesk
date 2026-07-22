import {
  getManagedVariableDefinition,
  listManagedVariableDescriptors,
  validateManagedVariableValue,
} from "@/lib/managed-agent-variable";

describe("managed agent variable catalog", () => {
  it("exposes stable value-free public descriptors", () => {
    const descriptors = listManagedVariableDescriptors();

    expect(descriptors.map((item) => item.id)).toEqual([
      "openrouter_api_key",
      "telegram_bot_token",
      "telegram_allowed_users",
    ]);
    expect(JSON.stringify(descriptors)).not.toMatch(
      /phaseKey|phaseApp|environment|pathIdentifier|secretValue/i,
    );
    expect(descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openrouter_api_key",
          allowedRoles: ["owner"],
          confirmation: "replace:openrouter_api_key:restart",
          runtimeEffect: "restart",
          sensitivity: "secret",
        }),
      ]),
    );
  });

  it("keeps internal Phase keys server-defined", () => {
    expect(getManagedVariableDefinition("openrouter_api_key")).toMatchObject({
      phaseKey: "OPENROUTER_API_KEY",
      scope: "runtime",
      enabledBoundaryKinds: ["managed_variable_v1"],
    });
    expect(getManagedVariableDefinition("unknown")).toBeNull();
  });

  it("validates bounded OpenRouter and Telegram values", () => {
    expect(
      validateManagedVariableValue(
        getManagedVariableDefinition("openrouter_api_key")!,
        `sk-or-v1-${"a".repeat(32)}`,
      ),
    ).toEqual({ ok: true });
    expect(
      validateManagedVariableValue(
        getManagedVariableDefinition("openrouter_api_key")!,
        "short",
      ),
    ).toEqual({ ok: false, message: "Enter a valid OpenRouter API key." });
    expect(
      validateManagedVariableValue(
        getManagedVariableDefinition("telegram_bot_token")!,
        `123456789:${"A".repeat(32)}`,
      ),
    ).toEqual({ ok: true });
    expect(
      validateManagedVariableValue(
        getManagedVariableDefinition("telegram_allowed_users")!,
        "123456789, 987654321",
      ),
    ).toEqual({ ok: true });
    expect(
      validateManagedVariableValue(
        getManagedVariableDefinition("telegram_allowed_users")!,
        "123,not-a-user",
      ),
    ).toEqual({ ok: false, message: "Enter comma-separated Telegram user IDs." });
  });

  it("rejects control characters and oversized input without echoing it", () => {
    const definition = getManagedVariableDefinition("openrouter_api_key")!;
    const sentinel = `sk-or-v1-${"x".repeat(600)}\nDO_NOT_ECHO`;
    const result = validateManagedVariableValue(definition, sentinel);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(JSON.stringify(result)).not.toContain("DO_NOT_ECHO");
  });
});
