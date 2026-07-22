import { renderToStaticMarkup } from "react-dom/server";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AgentSettings } from "../agent-settings";

const titus: AgentDirectoryEntry = {
  key: "titus",
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

describe("AgentSettings", () => {
  it.each([
    ["Titus", titus],
    ["Walter", walter],
  ])("uses the shared selected-agent structure for %s", (_name, selected) => {
    const markup = renderToStaticMarkup(
      <AgentSettings
        agents={[titus, walter]}
        capabilities={capabilities}
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
    expect(markup).toContain("Read only");
    expect(markup).not.toContain("type=\"password\"");
  });

  it("keeps a one-agent member on the same component without exposing another identity", () => {
    const markup = renderToStaticMarkup(
      <AgentSettings
        agents={[titus]}
        capabilities={capabilities}
        selected={titus}
        statusLabel="Active"
      />,
    );

    expect(markup).toContain("Titus");
    expect(markup).not.toContain("Walter");
    expect(markup).not.toContain("agent=walter");
  });
});
