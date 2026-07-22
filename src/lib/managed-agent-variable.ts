import type { MembershipRole } from "@/lib/use-case-membership-authorization";

export type ManagedVariableId =
  | "openrouter_api_key"
  | "telegram_bot_token"
  | "telegram_allowed_users";
export type ManagedVariableSensitivity = "config" | "secret";
export type ManagedVariableScope = "runtime" | "use_case";
export type ManagedVariableRuntimeEffect = "none" | "reload" | "restart" | "manual";
export type ManagedVariableBoundaryKind = "managed_variable_v1";

export interface ManagedVariableDefinition {
  id: ManagedVariableId;
  phaseKey: string;
  label: string;
  help: string;
  sensitivity: ManagedVariableSensitivity;
  allowedRoles: readonly MembershipRole[];
  scope: ManagedVariableScope;
  runtimeEffect: ManagedVariableRuntimeEffect;
  confirmation: string;
  enabledBoundaryKinds: readonly ManagedVariableBoundaryKind[];
  validate(value: string): boolean;
  validationMessage: string;
}

export interface ManagedVariableDescriptor {
  id: ManagedVariableId;
  label: string;
  help: string;
  sensitivity: ManagedVariableSensitivity;
  allowedRoles: readonly MembershipRole[];
  scope: ManagedVariableScope;
  runtimeEffect: ManagedVariableRuntimeEffect;
  confirmation: string;
}

export interface ManagedVariableControlDescriptor extends ManagedVariableDescriptor {
  availability: "read_only" | "write_only";
  availabilityDetail: string;
}

const noControlCharacters = (value: string) =>
  !/[\u0000-\u001f\u007f]/.test(value);

const definitions: readonly ManagedVariableDefinition[] = [
  {
    id: "openrouter_api_key",
    phaseKey: "OPENROUTER_API_KEY",
    label: "OpenRouter API key",
    help: "Replace the model-provider credential used by this runtime.",
    sensitivity: "secret",
    allowedRoles: ["owner"],
    scope: "runtime",
    runtimeEffect: "restart",
    confirmation: "replace:openrouter_api_key:restart",
    enabledBoundaryKinds: ["managed_variable_v1"],
    validate: (value) =>
      value.length >= 32 &&
      value.length <= 512 &&
      value.startsWith("sk-or-v1-") &&
      noControlCharacters(value),
    validationMessage: "Enter a valid OpenRouter API key.",
  },
  {
    id: "telegram_bot_token",
    phaseKey: "TELEGRAM_BOT_TOKEN",
    label: "Telegram bot token",
    help: "Replace the bot credential used by this runtime's Telegram bridge.",
    sensitivity: "secret",
    allowedRoles: ["owner"],
    scope: "runtime",
    runtimeEffect: "restart",
    confirmation: "replace:telegram_bot_token:restart",
    enabledBoundaryKinds: ["managed_variable_v1"],
    validate: (value) =>
      value.length <= 256 && /^\d{5,16}:[A-Za-z0-9_-]{20,200}$/.test(value),
    validationMessage: "Enter a valid Telegram bot token.",
  },
  {
    id: "telegram_allowed_users",
    phaseKey: "TELEGRAM_ALLOWED_USERS",
    label: "Telegram allowed users",
    help: "Replace the comma-separated Telegram user IDs allowed to use the bridge.",
    sensitivity: "config",
    allowedRoles: ["owner"],
    scope: "runtime",
    runtimeEffect: "restart",
    confirmation: "replace:telegram_allowed_users:restart",
    enabledBoundaryKinds: ["managed_variable_v1"],
    validate: (value) =>
      value.length <= 512 && /^\d{3,20}(?:\s*,\s*\d{3,20})*$/.test(value),
    validationMessage: "Enter comma-separated Telegram user IDs.",
  },
] as const;

const byId = new Map<ManagedVariableId, ManagedVariableDefinition>(
  definitions.map((definition) => [definition.id, definition]),
);

export function getManagedVariableDefinition(
  id: string,
): ManagedVariableDefinition | null {
  return byId.get(id as ManagedVariableId) ?? null;
}

export function listManagedVariableDescriptors(): ManagedVariableDescriptor[] {
  return definitions.map(
    ({
      id,
      label,
      help,
      sensitivity,
      allowedRoles,
      scope,
      runtimeEffect,
      confirmation,
    }) => ({
      id,
      label,
      help,
      sensitivity,
      allowedRoles: [...allowedRoles],
      scope,
      runtimeEffect,
      confirmation,
    }),
  );
}

export function validateManagedVariableValue(
  definition: ManagedVariableDefinition,
  value: string,
): { ok: true } | { ok: false; message: string } {
  return definition.validate(value)
    ? { ok: true }
    : { ok: false, message: definition.validationMessage };
}
