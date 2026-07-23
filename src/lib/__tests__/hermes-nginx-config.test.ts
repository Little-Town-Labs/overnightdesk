import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Walter Hermes Nginx authentication proxy", () => {
  it("sends the tenant verification subrequest with Vercel TLS SNI and the canonical Host", () => {
    const config = readFileSync(
      join(process.cwd(), "infra/nginx/walter-hermes.conf"),
      "utf8"
    );
    const authVerify = config.match(
      /location = \/auth-verify \{([\s\S]*?)\n    \}/
    )?.[1];

    expect(authVerify).toBeDefined();
    expect(authVerify).toContain("resolver 127.0.0.11 ipv6=off valid=30s;");
    expect(authVerify).toContain('set $verify_host "www.overnightdesk.com";');
    expect(authVerify).toContain(
      "proxy_pass https://$verify_host/api/auth/verify-tenant;"
    );
    expect(authVerify).toContain("proxy_ssl_server_name on;");
    expect(authVerify).toContain("proxy_ssl_name www.overnightdesk.com;");
    expect(authVerify).toContain("proxy_set_header Host www.overnightdesk.com;");
  });
});

describe("Titus Hermes Nginx authentication proxy", () => {
  const configPath = join(process.cwd(), "infra/nginx/titus-hermes.conf");

  it("protects every upstream path with the canonical bodyless verifier", () => {
    const config = readFileSync(configPath, "utf8");
    const authVerify = config.match(
      /location = \/auth-verify \{([\s\S]*?)\n    \}/,
    )?.[1];
    const upstream = config.match(/location \/ \{([\s\S]*?)\n    \}/)?.[1];

    expect(config).toContain("server_name titus-dashboard.overnightdesk.com;");
    expect(config).toContain("proxy_pass http://hermes-titus:9119;");
    expect(authVerify).toBeDefined();
    expect(authVerify).toContain("internal;");
    expect(authVerify).toContain("proxy_pass_request_body off;");
    expect(authVerify).toContain('proxy_set_header Content-Length "";');
    expect(authVerify).toContain("proxy_set_header Cookie $http_cookie;");
    expect(authVerify).toContain("proxy_set_header X-Original-Host $host;");
    expect(upstream).toContain("auth_request /auth-verify;");
    expect(config).not.toMatch(/location = \/api\/status/);
    expect(config).not.toMatch(/location \/(api|auth|ws|v1)\//);
  });

  it("uses exact Vercel TLS SNI and forwards callback and WebSocket headers", () => {
    const config = readFileSync(configPath, "utf8");

    expect(config).toContain("resolver 127.0.0.11 ipv6=off valid=30s;");
    expect(config).toContain('set $verify_host "www.overnightdesk.com";');
    expect(config).toContain(
      "proxy_pass https://$verify_host/api/auth/verify-tenant;",
    );
    expect(config).toContain("proxy_ssl_server_name on;");
    expect(config).toContain("proxy_ssl_name www.overnightdesk.com;");
    expect(config).toContain("proxy_set_header Host www.overnightdesk.com;");
    expect(config).toContain("proxy_set_header X-Forwarded-Host $host;");
    expect(config).toContain("proxy_set_header X-Forwarded-Proto $scheme;");
    expect(config).toContain("proxy_set_header Upgrade $http_upgrade;");
    expect(config).toContain('proxy_set_header Connection "upgrade";');
  });

  it("keeps certificate bootstrap separate from the disabled HTTPS candidate", () => {
    const http = readFileSync(
      join(process.cwd(), "infra/nginx/titus-hermes-http.conf"),
      "utf8",
    );

    expect(http).toContain("listen 80;");
    expect(http).toContain("server_name titus-dashboard.overnightdesk.com;");
    expect(http).toContain("location /.well-known/acme-challenge/");
    expect(http).not.toContain("proxy_pass http://hermes-titus:9119");
  });
});
