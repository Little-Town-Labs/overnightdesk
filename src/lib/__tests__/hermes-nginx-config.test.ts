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
