import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { getManagedVariableDefinition } from "@/lib/managed-agent-variable";
import {
  resolveManagedVariableControlDescriptors,
  resolveManagedAgentVariableBoundary,
  type ManagedVariableBoundaryStore,
} from "@/db/managed-agent-variable-boundary";

const agent: AgentDirectoryEntry = {
  key: "example-agent",
  useCaseId: "11111111-1111-4111-8111-111111111111",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
  runtime: { slug: "hermes-example", status: "active" },
  membershipRole: "owner",
  identity: {
    name: "Example",
    logo: { src: "/agents/default-mark.svg", alt: "Example agent mark" },
  },
  useCaseName: "Example use case",
  workspace: null,
};

const instance = {
  runtimeIdentityId: agent.runtimeIdentityId,
  tenantId: "tenant-example",
};

const binding = {
  phaseApp: "legacy-app",
  environment: "production",
  pathIdentifier: "/tenant-example",
};

const legacyConfig = {
  phaseApp: "legacy-app",
  environment: "production",
};

function store(rows: typeof binding[]): ManagedVariableBoundaryStore {
  return { listExactBindings: jest.fn().mockResolvedValue(rows) };
}

describe("resolveManagedAgentVariableBoundary", () => {
  const definition = getManagedVariableDefinition("openrouter_api_key")!;

  it("accepts exactly one binding equivalent to the deployed legacy provisioner boundary", async () => {
    await expect(
      resolveManagedAgentVariableBoundary(
        { agent, definition, instance, legacyConfig },
        store([binding]),
      ),
    ).resolves.toEqual({
      status: "ready",
      boundaryKind: "legacy_tenant_path",
      tenantId: "tenant-example",
    });
  });

  it.each([
    ["missing", []],
    ["multiple", [binding, { ...binding, pathIdentifier: "/other" }]],
  ])("fails closed for %s bindings", async (_name, rows) => {
    await expect(
      resolveManagedAgentVariableBoundary(
        { agent, definition, instance, legacyConfig },
        store(rows),
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "binding_ambiguous" });
  });

  it("rejects a cross-runtime instance association", async () => {
    await expect(
      resolveManagedAgentVariableBoundary(
        {
          agent,
          definition,
          instance: { ...instance, runtimeIdentityId: "44444444-4444-4444-8444-444444444444" },
          legacyConfig,
        },
        store([binding]),
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "instance_mismatch" });
  });

  it.each([
    [{ ...binding, phaseApp: "another-app" }, legacyConfig],
    [{ ...binding, environment: "staging" }, legacyConfig],
    [{ ...binding, pathIdentifier: "/agents/example/runtime" }, legacyConfig],
    [binding, null],
  ])("rejects unsupported provisioner coordinates", async (row, config) => {
    await expect(
      resolveManagedAgentVariableBoundary(
        { agent, definition, instance, legacyConfig: config },
        store([row]),
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "provisioner_unsupported" });
  });
});

describe("resolveManagedVariableControlDescriptors", () => {
  it("exposes write-only controls only for an authorized compatible boundary", async () => {
    const controls = await resolveManagedVariableControlDescriptors(
      { agent, instance, legacyConfig },
      store([binding]),
    );

    expect(controls).toHaveLength(3);
    expect(controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openrouter_api_key",
          availability: "write_only",
          confirmation: "replace:openrouter_api_key:restart",
        }),
      ]),
    );
    expect(JSON.stringify(controls)).not.toMatch(
      /phaseKey|phaseApp|environment|pathIdentifier|tenantId/i,
    );
  });

  it("keeps unsupported or unauthorized controls explicitly read-only", async () => {
    const unsupported = await resolveManagedVariableControlDescriptors(
      { agent, instance, legacyConfig: null },
      store([binding]),
    );
    const unauthorized = await resolveManagedVariableControlDescriptors(
      { agent: { ...agent, membershipRole: "viewer" }, instance, legacyConfig },
      store([binding]),
    );

    expect(unsupported.every((item) => item.availability === "read_only")).toBe(true);
    expect(unauthorized.every((item) => item.availability === "read_only")).toBe(true);
  });
});
