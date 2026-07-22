import type { AgentDirectory } from "@/lib/open-webui-workspace";
import type { RuntimeLinkedInstance } from "@/lib/selected-agent-context";
import { resolveAgentWorkspacePageContext } from "../page-resolution";

const directory: AgentDirectory = {
  status: "available",
  agents: [
    {
      key: "dashboard-only",
      useCaseId: "11111111-1111-4111-8111-111111111111",
      runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
      runtime: { slug: "hermes-dashboard-only", status: "active" },
      membershipRole: "owner",
      identity: {
        name: "Dashboard Only",
        logo: { src: "/agents/default-mark.svg", alt: "Dashboard Only mark" },
      },
      useCaseName: "Dashboard operations",
      workspace: null,
    },
    {
      key: "chat-ready",
      useCaseId: "33333333-3333-4333-8333-333333333333",
      runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
      runtime: { slug: "hermes-chat-ready", status: "active" },
      membershipRole: "owner",
      identity: {
        name: "Chat Ready",
        logo: { src: "/agents/default-mark.svg", alt: "Chat Ready mark" },
      },
      useCaseName: "Chat operations",
      workspace: {
        key: "chat-ready",
        identity: {
          name: "Chat Ready",
          logo: { src: "/agents/default-mark.svg", alt: "Chat Ready mark" },
        },
        useCaseName: "Chat operations",
        workspaceUrl: "https://chat-ready.overnightdesk.com/",
        fallbackMessage: "Approved alternate channels remain available.",
      },
    },
  ],
};

const instances: RuntimeLinkedInstance[] = [
  { runtimeIdentityId: "22222222-2222-4222-8222-222222222222" },
  { runtimeIdentityId: "44444444-4444-4444-8444-444444444444" },
];

describe("resolveAgentWorkspacePageContext", () => {
  it("preserves the current default by preferring an authorized chat assignment", () => {
    const resolution = resolveAgentWorkspacePageContext(
      directory,
      undefined,
      instances,
    );

    expect(resolution.status).toBe("available");
    if (resolution.status === "available") {
      expect(resolution.selected.agent.key).toBe("chat-ready");
      expect(resolution.agents).toHaveLength(2);
    }
  });

  it("allows an explicit authorized dashboard-only selection", () => {
    const resolution = resolveAgentWorkspacePageContext(
      directory,
      "dashboard-only",
      instances,
    );

    expect(resolution.status).toBe("available");
    if (resolution.status === "available") {
      expect(resolution.selected.agent.key).toBe("dashboard-only");
      expect(resolution.selected.agent.workspace).toBeNull();
      expect(resolution.selected.instance).toBe(instances[0]);
    }
  });

  it.each(["unknown", "../chat-ready", "CHAT-READY"])(
    "fails closed for explicit selector %s",
    (requestedKey) => {
      expect(
        resolveAgentWorkspacePageContext(directory, requestedKey, instances),
      ).toEqual({ status: "not_found" });
    },
  );

  it("does not let an explicit selector fall back when the directory is empty", () => {
    expect(
      resolveAgentWorkspacePageContext(
        { status: "available", agents: [] },
        "chat-ready",
        [],
      ),
    ).toEqual({ status: "not_found" });
  });

  it("preserves an honest empty state when no selector was supplied", () => {
    expect(
      resolveAgentWorkspacePageContext(
        { status: "available", agents: [] },
        undefined,
        [],
      ),
    ).toEqual({ status: "empty", agents: [] });
  });

  it("fails closed when the canonical directory is unavailable", () => {
    expect(
      resolveAgentWorkspacePageContext(
        { status: "unavailable" },
        undefined,
        instances,
      ),
    ).toEqual({ status: "unavailable" });
  });

  it("fails closed for duplicate exact instance linkage", () => {
    expect(
      resolveAgentWorkspacePageContext(directory, "dashboard-only", [
        instances[0],
        { ...instances[0] },
      ]),
    ).toEqual({ status: "unavailable" });
  });
});
