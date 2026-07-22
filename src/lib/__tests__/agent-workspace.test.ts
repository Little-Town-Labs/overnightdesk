import type { AgentCapability } from "@/lib/agent-capabilities";
import {
  buildAgentWorkspaceComposition,
  type AgentWorkspaceComposition,
} from "@/lib/agent-workspace";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";

const agent: AgentDirectoryEntry = {
  key: "runtime-one",
  useCaseId: "11111111-1111-4111-8111-111111111111",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
  runtime: { slug: "hermes-runtime-one", status: "active" },
  membershipRole: "owner",
  identity: {
    name: "Agent One",
    logo: { src: "/agents/default-mark.svg", alt: "Agent One mark" },
  },
  useCaseName: "Primary operations",
  workspace: {
    key: "runtime-one",
    identity: {
      name: "Agent One",
      logo: { src: "/agents/default-mark.svg", alt: "Agent One mark" },
    },
    useCaseName: "Primary operations",
    workspaceUrl: "https://runtime-one-chat.overnightdesk.com/",
    fallbackMessage: "Approved alternate channels remain available.",
  },
};

function capabilities(
  overrides: Partial<Record<AgentCapability["id"], Partial<AgentCapability>>> = {},
): AgentCapability[] {
  return [
    {
      id: "open_chat",
      label: "Open Chat",
      state: "available",
      detail: "Stateful chat is assigned.",
      action: {
        href: "/dashboard/chat?agent=runtime-one",
        primary: true,
      },
      ...overrides.open_chat,
    },
    {
      id: "advanced_dashboard",
      label: "Advanced Dashboard",
      state: "available",
      detail: "Native dashboard is assigned.",
      action: {
        href: "https://runtime-one.overnightdesk.com",
        external: true,
      },
      ...overrides.advanced_dashboard,
    },
  ];
}

function expectAvailable(
  composition: AgentWorkspaceComposition,
): Extract<AgentWorkspaceComposition, { status: "available" }> {
  expect(composition.status).toBe("available");
  if (composition.status !== "available") {
    throw new Error("expected available composition");
  }
  return composition;
}

describe("buildAgentWorkspaceComposition", () => {
  it("builds both independently authorized surfaces without persona policy", () => {
    const composition = expectAvailable(
      buildAgentWorkspaceComposition({ agent, capabilities: capabilities() }),
    );

    expect(composition.agent.key).toBe("runtime-one");
    expect(composition.chat.id).toBe("open_chat");
    expect(composition.chat.state).toBe("available");
    expect(composition.chat.workspace?.workspaceUrl).toBe(
      "https://runtime-one-chat.overnightdesk.com/",
    );
    expect(composition.dashboard.id).toBe("advanced_dashboard");
    expect(composition.dashboard.action?.external).toBe(true);
  });

  it("keeps a dashboard-only agent available with no chat embed URL", () => {
    const dashboardOnly = {
      ...agent,
      key: "runtime-two",
      workspace: null,
    } satisfies AgentDirectoryEntry;
    const composition = expectAvailable(
      buildAgentWorkspaceComposition({
        agent: dashboardOnly,
        capabilities: capabilities({
          open_chat: {
            state: "not_deployed",
            action: undefined,
          },
        }),
      }),
    );

    expect(composition.chat.state).toBe("not_deployed");
    expect(composition.chat.workspace).toBeNull();
    expect(composition.dashboard.state).toBe("available");
  });

  it("keeps a chat-only agent available with an honest dashboard state", () => {
    const composition = expectAvailable(
      buildAgentWorkspaceComposition({
        agent,
        capabilities: capabilities({
          advanced_dashboard: {
            state: "not_deployed",
            action: undefined,
          },
        }),
      }),
    );

    expect(composition.chat.state).toBe("available");
    expect(composition.dashboard.state).toBe("not_deployed");
    expect(composition.dashboard.action).toBeUndefined();
  });

  it.each([
    {
      name: "duplicate capability IDs",
      input: [...capabilities(), capabilities()[0]],
    },
    {
      name: "unknown capability IDs",
      input: [
        ...capabilities(),
        {
          id: "runtime_console",
          label: "Runtime console",
          state: "available",
          detail: "Unexpected surface.",
        },
      ] as unknown as AgentCapability[],
    },
  ])("fails closed for $name", ({ input }) => {
    expect(
      buildAgentWorkspaceComposition({ agent, capabilities: input }),
    ).toEqual({ status: "unavailable" });
  });

  it("fails closed when the chat workspace belongs to a different selected key", () => {
    const mismatchedAgent = {
      ...agent,
      workspace: agent.workspace
        ? { ...agent.workspace, key: "another-runtime" }
        : null,
    };

    expect(
      buildAgentWorkspaceComposition({
        agent: mismatchedAgent,
        capabilities: capabilities(),
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("fails closed when an available chat action targets another selection", () => {
    expect(
      buildAgentWorkspaceComposition({
        agent,
        capabilities: capabilities({
          open_chat: {
            action: { href: "/dashboard/chat?agent=runtime-two", primary: true },
          },
        }),
      }),
    ).toEqual({ status: "unavailable" });
  });

  it.each([
    "http://runtime-one.overnightdesk.com",
    "https://runtime-one.example.com",
    "https://user:pass@runtime-one.overnightdesk.com",
    "https://runtime-one.overnightdesk.com:9443",
  ])("fails closed for unsafe dashboard URL %s", (href) => {
    expect(
      buildAgentWorkspaceComposition({
        agent,
        capabilities: capabilities({
          advanced_dashboard: {
            action: { href, external: true },
          },
        }),
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("fails closed when an unavailable capability still carries an action", () => {
    expect(
      buildAgentWorkspaceComposition({
        agent,
        capabilities: capabilities({
          advanced_dashboard: { state: "unavailable" },
        }),
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("fails closed when chat is marked available without an assignment", () => {
    expect(
      buildAgentWorkspaceComposition({
        agent: { ...agent, workspace: null },
        capabilities: capabilities(),
      }),
    ).toEqual({ status: "unavailable" });
  });
});
