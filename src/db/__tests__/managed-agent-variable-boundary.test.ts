import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { getManagedVariableDefinition } from "@/lib/managed-agent-variable";
import {
  resolveManagedVariableControlDescriptors,
  resolveManagedAgentVariableBoundary,
  type ManagedVariableBoundaryStore,
  type ManagedVariableProvisionerBoundaryConfig,
} from "@/db/managed-agent-variable-boundary";

const agent: AgentDirectoryEntry = {
  key: "titus",
  useCaseId: "11111111-1111-4111-8111-111111111111",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
  runtime: { slug: "hermes-titus", status: "active" },
  membershipRole: "owner",
  identity: {
    name: "Titus",
    logo: { src: "/agents/default-mark.svg", alt: "Titus agent mark" },
  },
  useCaseName: "Timeless Tech Solutions",
  workspace: null,
};

const runtimeBinding = {
  phaseApp: "timeless-tech-solutions",
  environment: "production",
  pathIdentifier: "/agents/hermes-titus/runtime",
};

const bindings = [
  runtimeBinding,
  { ...runtimeBinding, pathIdentifier: "/agents/hermes-titus/memory" },
  { ...runtimeBinding, pathIdentifier: "/agents/hermes-titus/teams" },
];

const qualifiedBoundary: ManagedVariableProvisionerBoundaryConfig = {
  boundaryId: "cdb9a259-7e99-4dd1-a023-bf2fa9e8c033",
  phaseApp: runtimeBinding.phaseApp,
  environment: runtimeBinding.environment,
  pathIdentifier: runtimeBinding.pathIdentifier,
  variableIds: ["openrouter_api_key"],
};

function store(rows: typeof bindings): ManagedVariableBoundaryStore {
  return { listExactBindings: jest.fn().mockResolvedValue(rows) };
}

describe("resolveManagedAgentVariableBoundary", () => {
  const definition = getManagedVariableDefinition("openrouter_api_key")!;

  it("resolves one qualified canonical binding without requiring a legacy instance", async () => {
    await expect(
      resolveManagedAgentVariableBoundary(
        {
          agent,
          definition,
          instance: null,
          qualifiedBoundaries: [qualifiedBoundary],
        },
        store(bindings),
      ),
    ).resolves.toEqual({
      status: "ready",
      boundaryKind: "managed_variable_v1",
      boundaryId: qualifiedBoundary.boundaryId,
    });
  });

  it.each([
    ["missing canonical binding", bindings.slice(1), [qualifiedBoundary]],
    ["missing qualified mapping", bindings, []],
    [
      "ambiguous qualified mapping",
      bindings,
      [
        qualifiedBoundary,
        { ...qualifiedBoundary, boundaryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ],
    ],
  ] as const)("fails closed for %s", async (_name, rows, configs) => {
    await expect(
      resolveManagedAgentVariableBoundary(
        {
          agent,
          definition,
          instance: null,
          qualifiedBoundaries: [...configs],
        },
        store([...rows]),
      ),
    ).resolves.toEqual({
      status: "unavailable",
      reason: _name === "ambiguous qualified mapping"
        ? "binding_ambiguous"
        : "provisioner_unsupported",
    });
  });

  it("does not enable a variable omitted from the qualified mapping", async () => {
    const telegram = getManagedVariableDefinition("telegram_bot_token")!;

    await expect(
      resolveManagedAgentVariableBoundary(
        {
          agent,
          definition: telegram,
          instance: null,
          qualifiedBoundaries: [qualifiedBoundary],
        },
        store(bindings),
      ),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "provisioner_unsupported",
    });
  });
});

describe("resolveManagedVariableControlDescriptors", () => {
  it("enables only the qualified Titus variable and exposes no boundary coordinates", async () => {
    const controls = await resolveManagedVariableControlDescriptors(
      {
        agent,
        instance: null,
        qualifiedBoundaries: [qualifiedBoundary],
      },
      store(bindings),
    );

    expect(controls).toHaveLength(3);
    expect(controls.find((item) => item.id === "openrouter_api_key")).toMatchObject({
      availability: "write_only",
      confirmation: "replace:openrouter_api_key:restart",
    });
    expect(
      controls
        .filter((item) => item.id !== "openrouter_api_key")
        .every((item) => item.availability === "read_only"),
    ).toBe(true);
    expect(JSON.stringify(controls)).not.toMatch(
      /boundaryId|phaseKey|phaseApp|environment|pathIdentifier|tenantId/i,
    );
  });

  it("keeps unqualified and unauthorized agents explicitly read-only", async () => {
    const unqualified = await resolveManagedVariableControlDescriptors(
      { agent, instance: null, qualifiedBoundaries: [] },
      store(bindings),
    );
    const unauthorized = await resolveManagedVariableControlDescriptors(
      {
        agent: { ...agent, membershipRole: "viewer" },
        instance: null,
        qualifiedBoundaries: [qualifiedBoundary],
      },
      store(bindings),
    );

    expect(unqualified.every((item) => item.availability === "read_only")).toBe(true);
    expect(unauthorized.every((item) => item.availability === "read_only")).toBe(true);
  });
});
