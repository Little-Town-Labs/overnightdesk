import { buildAgentCapabilities } from "@/lib/agent-capabilities";

describe("buildAgentCapabilities", () => {
  it("derives Titus-style availability and actions without identity branches", () => {
    expect(
      buildAgentCapabilities({
        agentKey: "any-agent",
        dashboardUnavailableMessage: null,
        dashboardUrl: null,
        hasOpenChat: true,
      }),
    ).toEqual([
      expect.objectContaining({
        id: "open_chat",
        state: "available",
        action: expect.objectContaining({
          href: "/dashboard/chat?agent=any-agent",
        }),
      }),
      expect.objectContaining({
        id: "advanced_dashboard",
        state: "not_deployed",
        action: undefined,
      }),
    ]);
  });

  it("derives Walter-style availability and actions from capabilities", () => {
    expect(
      buildAgentCapabilities({
        agentKey: "another-agent",
        dashboardUnavailableMessage: null,
        dashboardUrl: "https://agent.example.test/",
        hasOpenChat: false,
      }),
    ).toEqual([
      expect.objectContaining({
        id: "open_chat",
        state: "not_deployed",
        action: undefined,
      }),
      expect.objectContaining({
        id: "advanced_dashboard",
        state: "available",
        action: expect.objectContaining({
          href: "https://agent.example.test/",
          external: true,
        }),
      }),
    ]);
  });

  it("shows an unavailable dashboard without exposing an action", () => {
    const [, dashboard] = buildAgentCapabilities({
      agentKey: "agent",
      dashboardUnavailableMessage: "Authorization is incomplete.",
      dashboardUrl: null,
      hasOpenChat: false,
    });

    expect(dashboard).toMatchObject({
      state: "unavailable",
      detail: "Authorization is incomplete.",
      action: undefined,
    });
  });
});
