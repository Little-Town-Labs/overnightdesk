jest.mock("@/db", () => ({ db: {} }));

import fs from "node:fs";
import path from "node:path";
import {
  resolveSelectedAgentPageContext,
  type SelectedAgentInstance,
  type SelectedAgentInstanceStore,
} from "@/db/selected-agent-page-context";
import type { AgentDirectory } from "@/lib/open-webui-workspace";

const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";
const useCaseId = "11111111-1111-4111-8111-111111111111";

const directory: AgentDirectory = {
  status: "available",
  agents: [
    {
      key: "titus",
      useCaseId,
      runtimeIdentityId,
      runtime: { slug: "hermes-titus", status: "active" },
      membershipRole: "member",
      identity: {
        name: "Titus",
        logo: { src: "/agents/titus-mark.svg", alt: "Titus agent mark" },
      },
      useCaseName: "Timeless Tech Solutions",
      workspace: null,
    },
  ],
};

const projection: SelectedAgentInstance = {
  id: "titus-dashboard",
  tenantId: "titus-dashboard",
  useCaseId,
  runtimeIdentityId,
  status: "running",
  containerId: "hermes-titus",
  subdomain: "titus-dashboard.overnightdesk.com",
  wizardState: null,
  claudeAuthStatus: "not_configured",
  hermesDashboardAuthStatus: "active",
  hermesOidcClientId: "public_client_id_1234567890",
  engineApiKey: null,
};

function store(
  canonical: SelectedAgentInstance[],
  legacy: SelectedAgentInstance[] = [],
): SelectedAgentInstanceStore {
  return {
    listCanonicalInstances: jest.fn().mockResolvedValue(canonical),
    listLegacyOwnerInstances: jest.fn().mockResolvedValue(legacy),
  };
}

describe("selected-agent page context", () => {
  it("loads an exact projection for an authorized non-owner member", async () => {
    await expect(
      resolveSelectedAgentPageContext(
        "member-user",
        directory,
        store([projection]),
      ),
    ).resolves.toEqual({
      status: "available",
      directory,
      instances: [projection],
    });
  });

  it("fails closed on duplicate or cross-use-case projections", async () => {
    await expect(
      resolveSelectedAgentPageContext(
        "member-user",
        directory,
        store([projection, { ...projection, id: "duplicate-dashboard" }]),
      ),
    ).resolves.toEqual({ status: "unavailable" });

    await expect(
      resolveSelectedAgentPageContext(
        "member-user",
        directory,
        store([
          {
            ...projection,
            useCaseId: "33333333-3333-4333-8333-333333333333",
          },
        ]),
      ),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("does not load another runtime for a non-member", async () => {
    const emptyDirectory: AgentDirectory = { status: "available", agents: [] };
    const contextStore = store([projection]);

    await expect(
      resolveSelectedAgentPageContext(
        "non-member",
        emptyDirectory,
        contextStore,
      ),
    ).resolves.toEqual({
      status: "available",
      directory: emptyDirectory,
      instances: [],
    });
    expect(contextStore.listCanonicalInstances).not.toHaveBeenCalled();
  });

  it("keeps the four selected-agent pages on the shared loader", () => {
    const pages = [
      "src/app/(protected)/dashboard/page.tsx",
      "src/app/(protected)/dashboard/chat/page.tsx",
      "src/app/(protected)/dashboard/settings/page.tsx",
      "src/app/(protected)/dashboard/admin/configuration/page.tsx",
    ];

    for (const page of pages) {
      const source = fs.readFileSync(path.join(process.cwd(), page), "utf8");
      expect(source).toContain("resolveSelectedAgentPageContext");
      expect(source).not.toContain(
        "db.select().from(instance).where(eq(instance.userId, session.user.id))",
      );
    }
  });
});
