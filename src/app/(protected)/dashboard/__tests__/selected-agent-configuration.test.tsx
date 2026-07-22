import { renderToStaticMarkup } from "react-dom/server";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { SelectedAgentConfiguration } from "../selected-agent-configuration";

const titus: AgentDirectoryEntry = {
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
  workspace: {
    key: "titus",
    identity: {
      name: "Titus",
      logo: { src: "/agents/titus-mark.svg", alt: "Titus agent mark" },
    },
    useCaseName: "Timeless Tech Solutions",
    workspaceUrl: "https://titus-chat.overnightdesk.com/",
    fallbackMessage: "Matrix and email remain available.",
  },
};

const walter: AgentDirectoryEntry = {
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
};

const capabilities = [
  {
    id: "open_chat" as const,
    label: "Open Chat",
    state: "not_deployed" as const,
    detail: "No Open Chat deployment is assigned to this runtime.",
  },
  {
    id: "advanced_dashboard" as const,
    label: "Advanced Dashboard",
    state: "available" as const,
    detail: "The runtime's advanced management surface is available.",
  },
];

const managedVariables = [
  {
    id: "openrouter_api_key" as const,
    label: "OpenRouter API key",
    help: "Replace the model-provider credential used by this runtime.",
    sensitivity: "secret" as const,
    allowedRoles: ["owner" as const],
    scope: "runtime" as const,
    runtimeEffect: "restart" as const,
    confirmation: "replace:openrouter_api_key:restart",
    availability: "read_only" as const,
    availabilityDetail: "Replacement is not enabled for this agent boundary.",
  },
];

describe("SelectedAgentConfiguration", () => {
  it.each([
    ["Titus", titus],
    ["Walter", walter],
  ])("uses the shared selected-agent structure for %s", (_name, selected) => {
    const markup = renderToStaticMarkup(
      <SelectedAgentConfiguration
        agents={[titus, walter]}
        capabilities={capabilities}
        managedVariables={managedVariables}
        selected={selected}
        statusLabel="Active"
      />,
    );

    expect(markup).toContain(`href="/dashboard/settings?agent=titus"`);
    expect(markup).toContain(`href="/dashboard/settings?agent=walter"`);
    expect(markup).toContain(selected.identity.name);
    expect(markup).toContain("Runtime");
    expect(markup).toContain(selected.runtime.slug);
    expect(markup).toContain("Capabilities");
    expect(markup).toContain("Agent configuration");
    expect(markup).toContain("Agent logo");
    expect(markup).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(markup).toContain('name="agent-logo"');
    expect(markup).toContain("Read only");
    expect(markup).not.toContain("type=\"password\"");
  });

  it("offers removal only when the selected persona uses a custom logo", () => {
    const markup = renderToStaticMarkup(
      <SelectedAgentConfiguration
        agents={[titus]}
        capabilities={capabilities}
        managedVariables={managedVariables}
        selected={{
          ...titus,
          identity: {
            ...titus.identity,
            logo: { ...titus.identity.logo, custom: true },
          },
        }}
        statusLabel="Active"
      />,
    );

    expect(markup).toContain("Restore default logo");
  });

  it("keeps logo mutation controls owner-only", () => {
    const markup = renderToStaticMarkup(
      <SelectedAgentConfiguration
        agents={[{ ...titus, membershipRole: "viewer" }]}
        capabilities={capabilities}
        managedVariables={managedVariables}
        selected={{ ...titus, membershipRole: "viewer" }}
        statusLabel="Active"
      />,
    );

    expect(markup).toContain("Only an owner can replace this agent logo");
    expect(markup).not.toContain('name="agent-logo"');
  });

  it("keeps a one-agent member on the same component without exposing another identity", () => {
    const markup = renderToStaticMarkup(
      <SelectedAgentConfiguration
        agents={[titus]}
        capabilities={capabilities}
        managedVariables={managedVariables}
        selected={titus}
        statusLabel="Active"
      />,
    );

    expect(markup).toContain("Titus");
    expect(markup).not.toContain("Walter");
    expect(markup).not.toContain("agent=walter");
  });

  it("renders only a bounded write-only form when the server enables a catalog entry", () => {
    const markup = renderToStaticMarkup(
      <SelectedAgentConfiguration
        agents={[titus]}
        capabilities={capabilities}
        managedVariables={[
          {
            ...managedVariables[0],
            availability: "write_only",
            availabilityDetail: "Enter a replacement value. The existing value remains hidden.",
          },
        ]}
        selected={titus}
        statusLabel="Active"
      />,
    );

    expect(markup).toContain('type="password"');
    expect(markup).toContain('name="replacement-value"');
    expect(markup).toContain('name="confirm-runtime-effect"');
    expect(markup).not.toContain("phaseApp");
    expect(markup).not.toContain("pathIdentifier");
    expect(markup).not.toContain("OPENROUTER_API_KEY");
  });
});
