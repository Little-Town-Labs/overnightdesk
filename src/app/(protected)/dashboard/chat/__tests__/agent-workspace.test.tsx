import { renderToStaticMarkup } from "react-dom/server";
import type { AgentCapability } from "@/lib/agent-capabilities";
import { buildAgentWorkspaceComposition } from "@/lib/agent-workspace";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AgentWorkspace } from "../agent-workspace";

const selected: AgentDirectoryEntry = {
  key: "primary-agent",
  useCaseId: "11111111-1111-4111-8111-111111111111",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
  runtime: { slug: "hermes-primary-agent", status: "active" },
  membershipRole: "owner",
  identity: {
    name: "Primary Agent",
    logo: { src: "/agents/default-mark.svg", alt: "Primary Agent mark" },
  },
  useCaseName: "Primary operations",
  workspace: {
    key: "primary-agent",
    identity: {
      name: "Primary Agent",
      logo: { src: "/agents/default-mark.svg", alt: "Primary Agent mark" },
    },
    useCaseName: "Primary operations",
    workspaceUrl: "https://primary-agent-chat.overnightdesk.com/",
    fallbackMessage: "Approved alternate channels remain available.",
  },
};

const secondAgent: AgentDirectoryEntry = {
  ...selected,
  key: "second-agent",
  runtimeIdentityId: "33333333-3333-4333-8333-333333333333",
  identity: {
    name: "Second Agent",
    logo: { src: "/agents/default-mark.svg", alt: "Second Agent mark" },
  },
  workspace: null,
};

function capabilities({
  chat = "available",
  dashboard = "available",
}: {
  chat?: AgentCapability["state"];
  dashboard?: AgentCapability["state"];
} = {}): AgentCapability[] {
  return [
    {
      id: "open_chat",
      label: "Open Chat",
      state: chat,
      detail:
        chat === "available"
          ? "Stateful chat is assigned."
          : "No Open Chat deployment is assigned to this runtime.",
      action:
        chat === "available"
          ? {
              href: "/dashboard/chat?agent=primary-agent",
              primary: true,
            }
          : undefined,
    },
    {
      id: "advanced_dashboard",
      label: "Advanced Dashboard",
      state: dashboard,
      detail:
        dashboard === "available"
          ? "The native dashboard is assigned."
          : "No advanced dashboard is assigned to this runtime.",
      action:
        dashboard === "available"
          ? {
              href: "https://primary-agent.overnightdesk.com",
              external: true,
            }
          : undefined,
    },
  ];
}

function renderWorkspace({
  agent = selected,
  agents = [selected, secondAgent],
  capabilitySet = capabilities(),
}: {
  agent?: AgentDirectoryEntry;
  agents?: AgentDirectoryEntry[];
  capabilitySet?: AgentCapability[];
} = {}): string {
  const composition = buildAgentWorkspaceComposition({
    agent,
    capabilities: capabilitySet,
  });
  if (composition.status !== "available") {
    throw new Error("test fixture must produce an available composition");
  }

  return renderToStaticMarkup(
    <AgentWorkspace agents={agents} composition={composition} />,
  );
}

describe("AgentWorkspace", () => {
  it("keeps chat embedded while launching the native dashboard independently", () => {
    const markup = renderWorkspace();

    expect(markup).toContain("Primary Agent");
    expect(markup).toContain("Primary operations");
    expect(markup).toContain('title="Primary Agent chat workspace"');
    expect(markup).toContain(
      'src="https://primary-agent-chat.overnightdesk.com/"',
    );
    expect(markup).toContain('href="https://primary-agent.overnightdesk.com"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("Open Advanced Dashboard");
  });

  it("renders a dashboard-only agent without a chat iframe", () => {
    const dashboardOnly = {
      ...secondAgent,
      identity: {
        name: "Dashboard Agent",
        logo: { src: "/agents/default-mark.svg", alt: "Dashboard Agent mark" },
      },
    };
    const markup = renderWorkspace({
      agent: dashboardOnly,
      agents: [dashboardOnly],
      capabilitySet: capabilities({ chat: "not_deployed" }).map((capability) =>
        capability.id === "open_chat"
          ? capability
          : {
              ...capability,
              action: {
                href: "https://dashboard-agent.overnightdesk.com",
                external: true,
              },
            },
      ),
    });

    expect(markup).toContain("Dashboard Agent");
    expect(markup).toContain("Open Chat is not deployed");
    expect(markup).not.toContain("<iframe");
    expect(markup).toContain("Open Advanced Dashboard");
  });

  it("renders chat-only with an honest dashboard state and no external action", () => {
    const markup = renderWorkspace({
      capabilitySet: capabilities({ dashboard: "not_deployed" }),
    });

    expect(markup).toContain("<iframe");
    expect(markup).toContain("Advanced Dashboard");
    expect(markup).toContain("Not deployed");
    expect(markup).not.toContain('target="_blank"');
  });

  it("renders neither capability as explicit state without a launch URL", () => {
    const unavailableAgent = { ...secondAgent, identity: selected.identity };
    const markup = renderWorkspace({
      agent: unavailableAgent,
      agents: [unavailableAgent],
      capabilitySet: capabilities({
        chat: "not_deployed",
        dashboard: "not_deployed",
      }),
    });

    expect(markup).toContain("Open Chat is not deployed");
    expect(markup).toContain("Advanced Dashboard");
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain('target="_blank"');
  });

  it("exposes only the authorized agents supplied by the server", () => {
    const oneAgentMarkup = renderWorkspace({ agents: [selected] });
    const multiAgentMarkup = renderWorkspace();

    expect(oneAgentMarkup).toContain("Primary Agent");
    expect(oneAgentMarkup).not.toContain("Second Agent");
    expect(oneAgentMarkup).not.toContain("agent=second-agent");
    expect(multiAgentMarkup).toContain('aria-label="Choose agent"');
    expect(multiAgentMarkup).toContain("Second Agent");
  });

  it("keeps selected identity before capability content in the shared structure", () => {
    const markup = renderWorkspace();

    expect(markup.indexOf("Primary Agent mark")).toBeLessThan(
      markup.indexOf("Open Chat"),
    );
    expect(markup.indexOf("Open Chat")).toBeLessThan(
      markup.indexOf("Advanced Dashboard"),
    );
    expect(markup).toContain("min-h-[calc(100dvh-12rem)]");
    expect(markup).toContain("w-full");
  });
});
