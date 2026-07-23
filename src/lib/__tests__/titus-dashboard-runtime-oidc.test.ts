import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(repo, relativePath), "utf8");
}

describe("Titus native dashboard OIDC runtime staging", () => {
  const config = source("tenants/hermes-titus/config/config.yaml");
  const loader = source("tenants/hermes-titus/runtime/load-phase-env.sh");
  const prepareVolume = source(
    "tenants/hermes-titus/runtime/prepare-volume.sh",
  );
  const startup = source("tenants/hermes-titus/runtime/start-with-secrets.sh");
  const deploy = source("tenants/hermes-titus/scripts/deploy-aegis.sh");

  it("keeps the repository config value-free and injects the exact staged client", () => {
    expect(config).toContain('client_id: "__TITUS_DASHBOARD_OIDC_CLIENT_ID__"');
    expect(config).not.toContain("overnightdesk-hermes-titus-dashboard-v1");
    expect(startup).toContain(
      "self_hosted['client_id'] = os.environ['TITUS_DASHBOARD_OIDC_CLIENT_ID']",
    );
  });

  it("loads one protected bounded client ID into the runtime environment", () => {
    expect(loader).toContain(
      "/opt/hermes-titus/secrets/dashboard-oidc-client-id",
    );
    expect(loader).toContain("TITUS_DASHBOARD_OIDC_CLIENT_ID");
    expect(loader).toContain("[A-Za-z0-9_-]");
  });

  it("stages the client through a protected file without printing it", () => {
    expect(deploy).toContain("TITUS_DASHBOARD_OIDC_CLIENT_FILE");
    expect(deploy).toContain("dashboard-oidc-client-id");
    expect(deploy).toMatch(/install .* -m 0400/);
    expect(deploy).not.toMatch(
      /(?:echo|printf).*\$TITUS_DASHBOARD_OIDC_CLIENT_ID/,
    );
  });

  it("qualifies the configured client against the exact process environment", () => {
    expect(deploy).toContain(
      'config["dashboard"]["oauth"]["self_hosted"]["client_id"] == pid1_env["TITUS_DASHBOARD_OIDC_CLIENT_ID"]',
    );
  });

  it("makes loopback rollback survive the systemd volume preparation gate", () => {
    const rollback = deploy.slice(
      deploy.indexOf("rollback_runtime()"),
      deploy.indexOf("\n}\n\ncase", deploy.indexOf("rollback_runtime()")),
    );
    expect(prepareVolume).toContain(
      "/opt/hermes-titus/rollback-loopback-dashboard",
    );
    expect(prepareVolume).toContain(
      'test -e "$rollback_marker" || test -L "$rollback_marker"',
    );
    expect(prepareVolume).toContain("launcher=start-all.loopback.sh");
    expect(prepareVolume).toContain(
      '--env TITUS_DASHBOARD_LAUNCHER="$launcher"',
    );
    expect(rollback).toMatch(
      /install[\s\S]*rollback-loopback-dashboard[\s\S]*systemctl stop hermes-titus\.service[\s\S]*systemctl start hermes-titus\.service/,
    );
    expect(deploy).toMatch(
      /rm -f \/opt\/hermes-titus\/rollback-loopback-dashboard/,
    );
    expect(deploy).toContain(
      "hermes dashboard --host 127.0.0.1 --port 9119 --no-open",
    );
  });
});
