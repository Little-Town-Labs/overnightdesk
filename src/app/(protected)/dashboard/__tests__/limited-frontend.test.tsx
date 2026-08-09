import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentDirectoryEntry } from "@/lib/open-webui-workspace";
import { buildSelectedAgentCapabilities } from "@/lib/selected-agent-capabilities";
import { AgentOverview } from "../agent-overview";

const ownerAgent: AgentDirectoryEntry = {
  key: "titus",
  useCaseId: "11111111-1111-4111-8111-111111111111",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
  runtime: { slug: "hermes-titus", status: "active" },
  membershipRole: "owner",
  identity: {
    name: "Titus",
    logo: { src: "/agents/titus-mark.svg", alt: "Titus agent mark" },
  },
  useCaseName: "Timeless Technology Solutions",
  workspace: {
    key: "titus",
    identity: {
      name: "Titus",
      logo: { src: "/agents/titus-mark.svg", alt: "Titus agent mark" },
    },
    useCaseName: "Timeless Technology Solutions",
    workspaceUrl: "https://titus-chat.overnightdesk.com/",
    fallbackMessage: "Contact the owner if chat is unavailable.",
  },
};

const otherAgent: AgentDirectoryEntry = {
  ...ownerAgent,
  key: "walter",
  useCaseId: "33333333-3333-4333-8333-333333333333",
  runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
  runtime: { slug: "hermes-walter", status: "active" },
  identity: {
    name: "Walter",
    logo: { src: "/agents/walter-mark.svg", alt: "Walter agent mark" },
  },
  useCaseName: "Platform Operations",
  workspace: null,
};

describe("limited internal dashboard", () => {
  it("retains the membership-selected agent and Open Chat capability", () => {
    const markup = renderToStaticMarkup(
      <AgentOverview
        agents={[ownerAgent, otherAgent]}
        capabilities={buildSelectedAgentCapabilities({
          agent: ownerAgent,
          instance: {
            runtimeIdentityId: ownerAgent.runtimeIdentityId,
            subdomain: null,
            hermesDashboardAuthStatus: undefined,
            hermesOidcClientId: null,
          },
        })}
        selected={ownerAgent}
        statusLabel="Workspace ready"
      />,
    );

    expect(markup).toContain("Timeless Technology Solutions");
    expect(markup).toContain("Open Chat");
    expect(markup).toContain('href="/dashboard/chat?agent=titus"');
    expect(markup).toContain('href="/dashboard?agent=walter"');
    expect(markup).toMatch(
      /aria-current="page"[^>]*href="\/dashboard\?agent=titus"/,
    );
  });

  it("contains no customer lifecycle authority or presentation", () => {
    const source = [
      "src/app/(protected)/dashboard/page.tsx",
      "src/app/(protected)/dashboard/layout.tsx",
      "src/app/(protected)/dashboard/security/page.tsx",
      "src/app/(protected)/dashboard/settings/page.tsx",
    ]
      .map((relativePath) =>
        readFileSync(path.join(process.cwd(), relativePath), "utf8"),
      )
      .join("\n");

    expect(source).not.toMatch(/@\/lib\/billing/);
    expect(source).not.toMatch(/getSubscriptionForUser|ManageBillingButton/);
    expect(source).not.toMatch(/PastDueBanner|OnboardingWizard|SetupWizard/);
    expect(source).not.toMatch(/ProvisioningProgress|RestartButton/);
    expect(source).not.toMatch(/DeleteAccount|\/pricing|Pro plan/);
  });

  it("does not derive dashboard presentation from subscription state", () => {
    const source = [
      "src/app/(protected)/dashboard/page.tsx",
      "src/app/(protected)/dashboard/layout.tsx",
      "src/app/(protected)/dashboard/security/page.tsx",
    ]
      .map((relativePath) =>
        readFileSync(path.join(process.cwd(), relativePath), "utf8"),
      )
      .join("\n");

    expect(source).toMatch(/resolveSelectedAgentPageContext/);
    expect(source).not.toMatch(/@\/lib\/billing/);
    expect(source).not.toMatch(/getSubscriptionForUser|ManageBillingButton/);
    expect(source).not.toMatch(/PastDueBanner|\/pricing|Pro plan/);
    expect(source).not.toMatch(/subscription|payment method|View plans/i);
  });
});
