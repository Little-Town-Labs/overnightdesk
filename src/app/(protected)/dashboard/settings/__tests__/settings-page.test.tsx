import { renderToStaticMarkup } from "react-dom/server";
import { resolveSelectedAgentContext } from "@/lib/selected-agent-context";
import { SettingsSurface } from "../settings-surface";

describe("SettingsSurface", () => {
  it("labels account controls as global and agent controls as selected-agent scope", () => {
    const markup = renderToStaticMarkup(
      <SettingsSurface
        accountSecurity={<div>Account security control</div>}
        dangerZone={<div>Account deletion control</div>}
        email="owner@example.test"
        name="Owner"
        agentContent={<div>Titus agent controls</div>}
      />,
    );

    expect(markup).toContain("Account-wide settings");
    expect(markup).toContain("Owner");
    expect(markup).toContain("owner@example.test");
    expect(markup).toContain("Account security control");
    expect(markup).toContain("Account deletion control");
    expect(markup).toContain("Agent settings");
    expect(markup).toContain("Titus agent controls");
  });

  it.each([
    ["empty" as const, "No active agent access"],
    ["unavailable" as const, "Agent access is temporarily unavailable"],
  ])("keeps global account controls when agent state is %s", (agentState, message) => {
    const markup = renderToStaticMarkup(
      <SettingsSurface
        accountSecurity={<div>Account security control</div>}
        dangerZone={<div>Account deletion control</div>}
        email="owner@example.test"
        name="Owner"
        agentState={agentState}
      />,
    );

    expect(markup).toContain("Account-wide settings");
    expect(markup).toContain("Account security control");
    expect(markup).toContain(message);
  });

  it("fails closed for an explicit unauthorized selector", () => {
    expect(
      resolveSelectedAgentContext(
        { status: "available", agents: [] },
        "walter",
        [],
      ),
    ).toEqual({ status: "empty", agents: [] });

    const agent = {
      key: "titus",
      useCaseId: "11111111-1111-4111-8111-111111111111",
      runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
      runtime: { slug: "hermes-titus", status: "active" as const },
      membershipRole: "owner" as const,
      identity: {
        name: "Titus",
        logo: { src: "/agents/titus-mark.svg", alt: "Titus agent mark" },
      },
      useCaseName: "Timeless Tech Solutions",
      workspace: null,
    };

    expect(
      resolveSelectedAgentContext(
        { status: "available", agents: [agent] },
        "walter",
        [],
      ),
    ).toEqual({ status: "not_found" });
  });
});
