import { renderToStaticMarkup } from "react-dom/server";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AgentAccessState } from "../agent-access-state";
import { AgentOverview } from "../agent-overview";

const capabilities = [
  {
    id: "open_chat" as const,
    label: "Open Chat",
    state: "available" as const,
    detail: "Stateful chat is assigned.",
  },
  {
    id: "advanced_dashboard" as const,
    label: "Advanced Dashboard",
    state: "not_deployed" as const,
    detail: "No dashboard is assigned.",
  },
];

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

describe("AgentOverview", () => {
  it("lets a multi-agent member select either authorized identity", () => {
    const markup = renderToStaticMarkup(
      <AgentOverview
        agents={[titus, walter]}
        capabilities={capabilities}
        selected={titus}
        statusLabel="Workspace ready"
      />,
    );

    expect(markup).toContain('aria-label="Choose agent"');
    expect(markup).toContain('href="/dashboard?agent=titus"');
    expect(markup).toContain('href="/dashboard?agent=walter"');
    expect(markup).toContain("Titus");
    expect(markup).toContain("Walter");
  });

  it("shows a single-agent member only that authorized identity", () => {
    const markup = renderToStaticMarkup(
      <AgentOverview
        agents={[titus]}
        capabilities={capabilities}
        selected={titus}
        statusLabel="Workspace ready"
      />,
    );

    expect(markup).toContain("Titus");
    expect(markup).not.toContain("Walter");
    expect(markup).not.toContain("agent=walter");
  });

  it("renders selected identity data and reusable actions without agent-specific UI", () => {
    const markup = renderToStaticMarkup(
      <AgentOverview
        agents={[titus, walter]}
        capabilities={[
          {
            ...capabilities[0],
            action: { href: "/dashboard/chat?agent=titus", primary: true },
          },
          {
            ...capabilities[1],
            state: "available",
            action: { href: "https://example.overnightdesk.com", external: true },
          },
        ]}
        selected={titus}
        statusLabel="Workspace ready"
      />,
    );

    expect(markup).toContain("Titus agent mark");
    expect(markup).toContain("Timeless Tech Solutions");
    expect(markup).toContain("Workspace ready");
    expect(markup).toContain("Open Chat");
    expect(markup).toContain("Advanced Dashboard");
    expect(markup).toContain('target="_blank"');
    expect(markup.indexOf('aria-label="Choose agent"')).toBeLessThan(
      markup.indexOf("Open Chat"),
    );
  });

  it.each([
    ["Titus", titus],
    ["Walter", walter],
  ])("keeps the Runtime section in the same structure for %s", (_name, selected) => {
    const markup = renderToStaticMarkup(
      <AgentOverview
        agents={[titus, walter]}
        capabilities={capabilities}
        selected={selected}
        statusLabel="Online"
      />,
    );

    expect(markup).toContain("Runtime");
    expect(markup).toContain(selected.runtime.slug);
    expect(markup.indexOf(selected.identity.name)).toBeLessThan(
      markup.indexOf("Runtime"),
    );
  });

  it("keeps Open Chat and Advanced Dashboard rows visible when availability differs", () => {
    const markup = renderToStaticMarkup(
      <AgentOverview
        agents={[titus, walter]}
        capabilities={capabilities}
        selected={titus}
        statusLabel="Online"
      />,
    );

    expect(markup).toContain("Capabilities");
    expect(markup).toContain("Open Chat");
    expect(markup).toContain("Available");
    expect(markup).toContain("Advanced Dashboard");
    expect(markup).toContain("Not deployed");
  });
});

describe("AgentAccessState", () => {
  it.each([
    ["empty" as const, "No active agent access"],
    ["unavailable" as const, "Agent access is temporarily unavailable"],
  ])("renders the fail-closed %s state", (state, message) => {
    const markup = renderToStaticMarkup(<AgentAccessState state={state} />);

    expect(markup).toContain(message);
    expect(markup).not.toContain("Runtime");
    expect(markup).not.toContain("Open Chat");
    expect(markup).not.toContain("Advanced Dashboard");
  });
});
