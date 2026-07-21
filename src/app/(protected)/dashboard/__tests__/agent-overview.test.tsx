import { renderToStaticMarkup } from "react-dom/server";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AgentOverview } from "../agent-overview";

const titus: AgentDirectoryEntry = {
  key: "titus",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
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
  runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
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
        actions={[]}
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
        actions={[]}
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
        actions={[
          { href: "/dashboard/chat?agent=titus", label: "Open Chat", primary: true },
          { href: "https://example.overnightdesk.com", label: "Advanced Dashboard", external: true },
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
  });
});
