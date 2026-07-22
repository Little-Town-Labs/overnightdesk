import { buildOpenWebuiProvisioningSpec } from "@/lib/open-webui-provisioning";
import {
  TITUS_OPEN_WEBUI,
  WALTER_OPEN_WEBUI,
} from "@/lib/open-webui-deployments";

const identity = {
  useCaseId: "00000000-0000-4000-8000-000000000001",
  runtimeIdentityId: "00000000-0000-4000-8000-000000000002",
};

describe("shared Open WebUI provisioning contract", () => {
  it.each([TITUS_OPEN_WEBUI, WALTER_OPEN_WEBUI])(
    "builds the exact disabled canonical assignment for $deploymentId",
    (deployment) => {
      const spec = buildOpenWebuiProvisioningSpec(deployment, identity);
      expect(spec.resourceBindings).toEqual([
        ["docker", "container", deployment.deploymentId],
        ["docker", "volume", deployment.volume],
        ["overnightdesk", "hostname", deployment.host],
        ["better-auth", "oidc_client", deployment.oidcClientId],
        ["phase", "phase_path", deployment.phasePath],
      ]);
      expect(spec.secretBoundary).toEqual({
        phaseApp: deployment.phaseApp,
        environment: "production",
        pathIdentifier: deployment.phasePath,
      });
      expect(spec.client).toMatchObject({
        clientId: deployment.oidcClientId,
        clientSecret: null,
        disabled: true,
        uri: `https://${deployment.host}`,
        redirectUris: [`https://${deployment.host}/oauth/oidc/callback`],
        scopes: ["openid", "email", "profile", "offline_access"],
        grantTypes: ["authorization_code", "refresh_token"],
        metadata: {
          kind: "open-webui",
          schemaVersion: 1,
          deploymentId: deployment.deploymentId,
          ...identity,
        },
      });
    },
  );

  it("does not reuse any Titus assignment value for Walter", () => {
    const titus = buildOpenWebuiProvisioningSpec(TITUS_OPEN_WEBUI, identity);
    const walter = buildOpenWebuiProvisioningSpec(WALTER_OPEN_WEBUI, identity);
    const titusValues = new Set(titus.resourceBindings.map((binding) => binding[2]));
    expect(
      walter.resourceBindings.filter((binding) => titusValues.has(binding[2])),
    ).toEqual([]);
    expect(walter.secretBoundary).not.toEqual(titus.secretBoundary);
  });
});
