import { renderToStaticMarkup } from "react-dom/server";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AdminAgentConfiguration } from "../configuration/admin-agent-configuration";

const agents: AgentDirectoryEntry[] = [
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

describe("AdminAgentConfiguration", () => {
  it.each(agents)("keeps shared configuration structure for $key", (selected) => {
    const markup = renderToStaticMarkup(
      <AdminAgentConfiguration
        agents={agents}
        capabilities={capabilities}
        managedVariables={managedVariables}
        selected={selected}
        statusLabel="Active"
      />,
    );

    expect(markup).toContain("Selected-agent scope");
    expect(markup).toContain(selected.identity.name);
    expect(markup).toContain(selected.runtime.slug);
    expect(markup).toContain("Runtime");
    expect(markup).toContain("Capabilities");
    expect(markup).toContain("Agent configuration");
    expect(markup).toContain("Read only");
    expect(markup).toContain(
      `href="/dashboard/admin/configuration?agent=${selected.key}"`,
    );
  });

  it("does not expose another identity to a one-agent administrator", () => {
    const markup = renderToStaticMarkup(
      <AdminAgentConfiguration
        agents={[agents[0]]}
        capabilities={capabilities}
        managedVariables={managedVariables}
        selected={agents[0]}
        statusLabel="Active"
      />,
    );

    expect(markup).toContain("Titus");
    expect(markup).not.toContain("Walter");
  });
});
