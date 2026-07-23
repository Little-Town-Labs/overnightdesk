import { renderToStaticMarkup } from "react-dom/server";
import { buildSelectedAgentCapabilities } from "@/lib/selected-agent-capabilities";
import { buildAgentWorkspaceComposition } from "@/lib/agent-workspace";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { AdminAgentConfiguration } from "../admin/configuration/admin-agent-configuration";
import { AgentOverview } from "../agent-overview";
import { AgentWorkspace } from "../chat/agent-workspace";
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
    fallbackMessage: "Approved channels remain available.",
  },
};

const titusDashboardInstance = {
  runtimeIdentityId: titus.runtimeIdentityId,
  subdomain: "titus-dashboard.overnightdesk.com",
  hermesDashboardAuthStatus: "active" as const,
  hermesOidcClientId: "overnightdesk-hermes-titus-dashboard-v1",
};

describe("Titus dashboard capability", () => {
  it("derives one shared capability model from canonical runtime data", () => {
    const capabilities = buildSelectedAgentCapabilities({
      agent: titus,
      instance: titusDashboardInstance,
    });

    expect(capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "open_chat",
          state: "available",
          action: { href: "/dashboard/chat?agent=titus", primary: true },
        }),
        expect.objectContaining({
          id: "advanced_dashboard",
          state: "available",
          action: {
            href: "https://titus-dashboard.overnightdesk.com",
            external: true,
          },
        }),
      ]),
    );
    expect(JSON.stringify(capabilities)).not.toContain("walter");
  });

  it("renders the same available dashboard state on all four selected-agent surfaces", () => {
    const capabilities = buildSelectedAgentCapabilities({
      agent: titus,
      instance: titusDashboardInstance,
    });
    const composition = buildAgentWorkspaceComposition({
      agent: titus,
      capabilities,
    });
    if (composition.status !== "available") {
      throw new Error("expected an available Titus workspace");
    }

    const surfaces = [
      renderToStaticMarkup(
        <AgentOverview
          agents={[titus]}
          capabilities={capabilities}
          selected={titus}
          statusLabel="Online"
        />,
      ),
      renderToStaticMarkup(
        <AgentWorkspace agents={[titus]} composition={composition} />,
      ),
      renderToStaticMarkup(
        <SelectedAgentConfiguration
          agents={[titus]}
          capabilities={capabilities}
          managedVariables={[]}
          selected={titus}
          statusLabel="Online"
        />,
      ),
      renderToStaticMarkup(
        <AdminAgentConfiguration
          agents={[titus]}
          capabilities={capabilities}
          managedVariables={[]}
          selected={titus}
          statusLabel="Online"
        />,
      ),
    ];

    for (const markup of surfaces) {
      expect(markup).toContain("Titus");
      expect(markup).toContain("Advanced Dashboard");
      expect(markup).toContain("Available");
      expect(markup).not.toContain("Walter");
    }
    expect(surfaces[0]).toContain(
      'href="https://titus-dashboard.overnightdesk.com"',
    );
    expect(surfaces[1]).toContain(
      'href="https://titus-dashboard.overnightdesk.com"',
    );
  });
});
