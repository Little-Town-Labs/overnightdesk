import { resolveDashboardNavigationState } from "../dashboard-navigation-state";

describe("resolveDashboardNavigationState", () => {
  it("uses canonical navigation whenever the authorized directory has an agent", () => {
    expect(
      resolveDashboardNavigationState({
        directory: { status: "available", agentCount: 2 },
        instances: [],
      }),
    ).toEqual({ instanceRunning: false, usesCanonicalAgentContext: true });
  });

  it("does not depend on the first legacy instance when agent linkage exists", () => {
    expect(
      resolveDashboardNavigationState({
        directory: { status: "unavailable" },
        instances: [
          { containerId: "legacy-runtime", runtimeIdentityId: null, status: "running" },
          {
            containerId: "hermes-walter",
            runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
            status: "stopped",
          },
        ],
      }),
    ).toEqual({ instanceRunning: true, usesCanonicalAgentContext: true });
  });

  it("preserves legacy navigation when no canonical agent evidence exists", () => {
    expect(
      resolveDashboardNavigationState({
        directory: { status: "available", agentCount: 0 },
        instances: [
          { containerId: "tenant-runtime", runtimeIdentityId: null, status: "running" },
        ],
      }),
    ).toEqual({ instanceRunning: true, usesCanonicalAgentContext: false });
  });
});
