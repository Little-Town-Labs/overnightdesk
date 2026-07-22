import {
  OPEN_WEBUI_DEPLOYMENTS,
  TITUS_OPEN_WEBUI,
  WALTER_OPEN_WEBUI,
  findOpenWebuiDeployment,
} from "@/lib/open-webui-deployments";

describe("canonical Open WebUI deployment registry", () => {
  it("defines distinct Titus and Walter runtime boundaries", () => {
    expect(OPEN_WEBUI_DEPLOYMENTS).toHaveLength(2);
    for (const key of [
      "useCaseNumber",
      "useCaseSlug",
      "runtimeSlug",
      "deploymentId",
      "host",
      "oidcClientId",
      "hermesBaseUrl",
      "volume",
      "phaseApp",
      "phasePath",
      "clientName",
      "auditKey",
    ] as const) {
      expect(WALTER_OPEN_WEBUI[key]).not.toBe(TITUS_OPEN_WEBUI[key]);
    }
  });

  it("resolves only exact identifiers without persona-name fallbacks", () => {
    expect(
      findOpenWebuiDeployment("clientId", WALTER_OPEN_WEBUI.oidcClientId),
    ).toBe(WALTER_OPEN_WEBUI);
    expect(findOpenWebuiDeployment("host", TITUS_OPEN_WEBUI.host)).toBe(
      TITUS_OPEN_WEBUI,
    );
    expect(findOpenWebuiDeployment("deploymentId", "walter")).toBeNull();
    expect(findOpenWebuiDeployment("host", "WALTER-chat.overnightdesk.com")).toBeNull();
  });
});
