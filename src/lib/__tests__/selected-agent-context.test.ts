import type { AgentDirectory } from "@/lib/open-webui-workspace";
import {
  getSelectedAgentStatusLabel,
  resolveUnambiguousLegacyInstance,
  resolveSelectedAgentContext,
} from "@/lib/selected-agent-context";

const agents: Extract<AgentDirectory, { status: "available" }>["agents"] = [
  {
    key: "titus",
    useCaseId: "11111111-1111-4111-8111-111111111111",
    runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
    runtime: { slug: "hermes-titus", status: "active" },
    membershipRole: "owner",
    identity: {
      name: "Titus",
      logo: { src: "/agents/titus-mark.svg", alt: "Titus agent mark" },
    },
    useCaseName: "Timeless Tech Solutions",
    workspace: null,
  },
  {
    key: "walter",
    useCaseId: "33333333-3333-4333-8333-333333333333",
    runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
    runtime: { slug: "hermes-walter", status: "active" },
    membershipRole: "owner",
    identity: {
      name: "Walter",
      logo: { src: "/agents/walter-mark.svg", alt: "Walter agent mark" },
    },
    useCaseName: "OvernightDesk platform operations",
    workspace: null,
  },
];

const walterInstance = {
  id: "instance-walter",
  containerId: "hermes-walter",
  runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
};

describe("resolveSelectedAgentContext", () => {
  it("defaults deterministically only when no selector was provided", () => {
    expect(
      resolveSelectedAgentContext(
        { status: "available", agents },
        undefined,
        [walterInstance],
      ),
    ).toMatchObject({
      status: "available",
      selected: { agent: { key: "titus" }, instance: null },
    });
  });

  it("associates only an exact runtime instance", () => {
    expect(
      resolveSelectedAgentContext(
        { status: "available", agents },
        "walter",
        [walterInstance],
      ),
    ).toMatchObject({
      status: "available",
      selected: {
        agent: { key: "walter" },
        instance: { id: "instance-walter" },
      },
    });
  });

  it("never falls back to a first instance for an explicit selected agent", () => {
    expect(
      resolveSelectedAgentContext(
        { status: "available", agents },
        "titus",
        [walterInstance],
      ),
    ).toMatchObject({
      status: "available",
      selected: { agent: { key: "titus" }, instance: null },
    });
  });

  it("fails closed for invalid, empty, and unavailable directory states", () => {
    expect(
      resolveSelectedAgentContext(
        { status: "available", agents },
        "rex",
        [walterInstance],
      ),
    ).toEqual({ status: "not_found" });
    expect(
      resolveSelectedAgentContext(
        { status: "available", agents: [] },
        undefined,
        [walterInstance],
      ),
    ).toEqual({ status: "empty", agents: [] });
    expect(
      resolveSelectedAgentContext(
        { status: "unavailable" },
        undefined,
        [walterInstance],
      ),
    ).toEqual({ status: "unavailable" });
  });
});

describe("resolveUnambiguousLegacyInstance", () => {
  const legacy = {
    id: "legacy-instance",
    containerId: "tenant-runtime",
    runtimeIdentityId: null,
  };

  it("preserves the one-instance legacy dashboard path", () => {
    expect(resolveUnambiguousLegacyInstance([legacy])).toBe(legacy);
  });

  it("fails closed for mixed, multiple, or agent-linked instances", () => {
    expect(
      resolveUnambiguousLegacyInstance([legacy, walterInstance]),
    ).toBeNull();
    expect(
      resolveUnambiguousLegacyInstance([
        { ...walterInstance, containerId: "hermes-walter" },
      ]),
    ).toBeNull();
    expect(resolveUnambiguousLegacyInstance([])).toBeNull();
  });
});

describe("getSelectedAgentStatusLabel", () => {
  it("derives one label for every selected-agent consumer", () => {
    expect(getSelectedAgentStatusLabel(agents[0], { runtimeIdentityId: agents[0].runtimeIdentityId, status: "running" })).toBe("Online");
    expect(getSelectedAgentStatusLabel({ ...agents[0], workspace: { key: "titus", identity: agents[0].identity, useCaseName: agents[0].useCaseName, workspaceUrl: "https://example.test", fallbackMessage: "Fallback" } }, null)).toBe("Workspace ready");
    expect(getSelectedAgentStatusLabel(agents[1], null)).toBe("Active");
  });
});
