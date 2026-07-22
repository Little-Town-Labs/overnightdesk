import { createServer, type ServerResponse } from "node:http";

const APPROVED_PARENT_PORT = 4173;
const WORKSPACE_PORT = 4174;
const UNAPPROVED_PARENT_PORT = 4175;

let platformAuthority: "active" | "expired" | "revoked" = "active";
let assignmentEnabled = true;

function html(response: ServerResponse, body: string, status = 200): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function parentPage(
  title: string,
  view: "admin" | "chat" | "overview" | "settings" = "chat",
  selectedKey: "titus" | "walter" = "titus",
  adminSection: "configuration" | "fleet" | "metrics" = "fleet",
  surfaces: "default" | "neither" | "unavailable" = "default",
  singleMember = false,
): string {
  const selected =
    selectedKey === "walter"
      ? {
          name: "Walter",
          mark: "W",
          useCase: "OvernightDesk platform operations",
          runtime: "hermes-walter",
          openChat: "Not deployed",
          dashboard: "Available",
        }
      : {
          name: "Titus",
          mark: "T",
          useCase: "Timeless Tech Solutions",
          runtime: "hermes-titus",
          openChat: "Available",
          dashboard: "Not deployed",
        };
  const agentSelector = (basePath: string) => `<nav class="selector" aria-label="Choose agent">
          <a href="${basePath}?agent=titus" aria-current="${selectedKey === "titus" ? "true" : "false"}">Titus</a>
          ${singleMember ? "" : `<a href="${basePath}?agent=walter" aria-current="${selectedKey === "walter" ? "true" : "false"}">Walter</a>`}
        </nav>`;
  const agentPanels = (basePath: string) => `${agentSelector(basePath)}
        <header class="identity card">
          <span class="mark" aria-hidden="true">${selected.mark}</span>
          <div><h2>${selected.name}</h2><p>${selected.useCase}</p></div>
        </header>
        <section class="card" aria-labelledby="runtime-heading">
          <h3 id="runtime-heading">Runtime</h3>
          <dl class="runtime-grid">
            <div><dt>Identity</dt><dd>${selected.runtime}</dd></div>
            <div><dt>State</dt><dd>Active</dd></div>
            <div><dt>Access</dt><dd>owner</dd></div>
          </dl>
        </section>
        <section class="card" aria-labelledby="capabilities-heading">
          <h3 id="capabilities-heading">Capabilities</h3>
          <ul class="capabilities">
            <li><span>Open Chat</span><span>${selected.openChat}</span></li>
            <li><span>Advanced Dashboard</span><span>${selected.dashboard}</span></li>
          </ul>
        </section>`;
  const chatAvailable = surfaces !== "neither" && selectedKey === "titus";
  const dashboardAvailable =
    surfaces !== "neither" &&
    (selectedKey === "walter" || selectedKey === "titus");
  const chatMain =
    surfaces === "unavailable"
      ? `<section class="card" role="alert"><h2>Agent workspace is temporarily unavailable</h2><p>No capability URLs are shown until access can be verified.</p></section>`
      : `${agentSelector("/dashboard/chat")}
        <header class="identity card">
          <span class="mark" aria-hidden="true">${selected.mark}</span>
          <div><h2>${selected.name}</h2><p>${selected.useCase}</p></div>
        </header>
        <section class="card" aria-labelledby="workspace-capabilities-heading">
          <h3 id="workspace-capabilities-heading">Capabilities</h3>
          <ul class="capabilities">
            <li><span>Open Chat</span><span>${chatAvailable ? "Available" : "Not deployed"}</span></li>
            <li><span>Advanced Dashboard</span><span>${dashboardAvailable ? "Available" : "Not deployed"}</span></li>
          </ul>
        </section>
        <nav class="workspace-actions" aria-label="${selected.name} workspace actions">
          <a href="/dashboard">Back to Overview</a>
          ${dashboardAvailable ? '<a href="/runtime-dashboard" target="_blank" rel="noopener noreferrer">Open Advanced Dashboard</a>' : ""}
        </nav>
        ${chatAvailable
          ? `<iframe id="workspace" title="${selected.name} workspace" src="http://127.0.0.1:${WORKSPACE_PORT}/workspace"></iframe>
        <p class="fallback">${selectedKey === "titus" ? "Your existing Titus Matrix room and approved email channel remain available and independent of Open Chat." : "Approved alternate channels remain available independently of Open Chat."}</p>
        <div class="controls">
          <button id="platform-logout">Platform logout</button>
          <button id="rollback">Disable assignment</button>
        </div>`
          : `<section class="card empty-surface" role="status"><h3>Open Chat is not deployed</h3><p>No Open Chat deployment is assigned to this runtime.</p></section>`}`;
  const main =
    view === "overview"
      ? agentPanels("/dashboard")
      : view === "settings"
        ? `<section class="scope">
            <span>Global scope</span>
            <h2>Account-wide settings</h2>
            <p>These controls do not change when you select an agent.</p>
            <div class="card"><h3>Profile</h3><p>Owner</p><p>owner@example.test</p></div>
          </section>
          <section class="scope">
            <span>Selected-agent scope</span>
            <h2>Agent settings</h2>
            ${agentPanels("/dashboard/settings")}
            <section class="card" aria-labelledby="configuration-heading">
              <h3 id="configuration-heading">Agent configuration</h3>
              <p>Existing values are never displayed.</p>
              <strong>Read only</strong>
            </section>
          </section>`
        : view === "admin"
          ? `<section class="scope">
              <span>Owner-only controls</span>
              <h2>Administration</h2>
              <p>Platform-wide operations and selected-agent configuration.</p>
              <nav aria-label="Admin sections" class="admin-nav">
                <a href="/dashboard/admin/fleet" aria-current="${adminSection === "fleet" ? "page" : "false"}">Fleet</a>
                <a href="/dashboard/admin/metrics" aria-current="${adminSection === "metrics" ? "page" : "false"}">Metrics</a>
                <a href="/dashboard/admin/configuration" aria-current="${adminSection === "configuration" ? "page" : "false"}">Configuration</a>
              </nav>
            </section>
            ${adminSection === "configuration"
              ? `<section class="scope"><span>Selected-agent scope</span><h2>Configuration</h2>${agentPanels("/dashboard/admin/configuration")}<section class="card" aria-labelledby="admin-configuration-heading"><h3 id="admin-configuration-heading">Agent configuration</h3><strong>Read only</strong></section></section>`
              : `<section class="scope"><span>Global scope</span><h2>${adminSection === "fleet" ? "Fleet" : "Metrics"}</h2><div class="card"><p>${adminSection === "fleet" ? "Health status and event history for all instances." : "Business metrics overview for the platform."}</p></div></section>`}
            `
      : chatMain;

  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #0e0d0b; color: #f5f0e8; font-family: system-ui, sans-serif; }
    body { padding: 24px; }
    .shell { width: 100%; max-width: 1600px; margin: 0 auto; }
    .brand { margin: 0 0 14px; font-size: 20px; }
    nav { display: flex; gap: 8px; margin-bottom: 14px; border-bottom: 1px solid #2a2520; }
    nav a { padding: 9px 12px; color: #9c9488; text-decoration: none; }
    nav a[aria-current="page"] { color: #f5f0e8; border-bottom: 2px solid #f59e0b; }
    .identity { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .mark { display: grid; width: 44px; height: 44px; place-items: center; border-radius: 10px; background: #161410; color: #f59e0b; font-weight: 800; }
    .identity h2, .identity p { margin: 0; }
    .identity p { margin-top: 2px; color: #9c9488; font-size: 14px; }
    #workspace { display: block; width: 100%; height: calc(100dvh - 235px); min-height: 500px; border: 1px solid #2a2520; border-radius: 12px; background: #161410; }
    .fallback { margin: 10px 0 0; padding: 9px 12px; border: 1px solid #2a2520; border-radius: 8px; color: #9c9488; font-size: 12px; }
    .controls { display: flex; gap: 8px; margin-top: 10px; }
    .controls button { border: 1px solid #2a2520; border-radius: 6px; background: #1e1b17; color: #f5f0e8; padding: 7px 10px; }
    .selector { display: flex; gap: 8px; margin-bottom: 12px; }
    .selector a { border: 1px solid #2a2520; border-radius: 999px; color: #9c9488; padding: 7px 12px; text-decoration: none; }
    .selector a[aria-current="true"] { border-color: #f59e0b; color: #f5f0e8; }
    .card { margin-bottom: 12px; border: 1px solid #2a2520; border-radius: 12px; background: #161410; padding: 18px; }
    .card h3 { margin: 0; color: #9c9488; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
    .runtime-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin: 16px 0 0; }
    .runtime-grid dt { color: #9c9488; font-size: 12px; }
    .runtime-grid dd { margin: 4px 0 0; overflow-wrap: anywhere; }
    .capabilities { margin: 12px 0 0; padding: 0; list-style: none; }
    .capabilities li { display: flex; justify-content: space-between; gap: 16px; border-top: 1px solid #2a2520; padding: 10px 0; }
    .capabilities li:first-child { border-top: 0; }
    .scope { margin-bottom: 32px; }
    .scope > span { color: #f59e0b; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
    .scope > h2 { margin: 4px 0; }
    .scope > p, .card > p { color: #9c9488; }
    .admin-nav { display: flex; gap: 8px; margin: 14px 0 0; border: 0; }
    .admin-nav a { border: 1px solid #2a2520; border-radius: 8px; }
    .admin-nav a[aria-current="page"] { border-color: #f59e0b; }
    .workspace-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; border: 0; }
    .workspace-actions a { border: 1px solid #2a2520; border-radius: 8px; color: #f5f0e8; padding: 9px 12px; }
    .workspace-actions a[target="_blank"] { border-color: #f59e0b; background: #f59e0b; color: #17120a; font-weight: 700; }
    .empty-surface { min-height: 260px; display: grid; place-content: center; text-align: center; }
    @media (max-width: 480px) {
      body { padding: 12px; }
      #workspace { height: calc(100dvh - 250px); min-height: 400px; }
      .controls { flex-wrap: wrap; }
      .runtime-grid { grid-template-columns: 1fr; gap: 12px; }
    }
  </style>
</head><body>
  <div class="shell">
    <h1 class="brand">OvernightDesk</h1>
    <nav aria-label="Dashboard">
      <a href="/dashboard"${view === "overview" ? ' aria-current="page"' : ""}>Overview</a>
      <a href="/dashboard/settings"${view === "settings" ? ' aria-current="page"' : ""}>Settings</a>
      <a href="/dashboard/admin"${view === "admin" ? ' aria-current="page"' : ""}>Admin</a>
    </nav>
    ${main}
  </div>
  ${view === "chat" ? `<script>
    const reload = () => {
      const frame = document.querySelector('#workspace');
      frame.src = frame.src;
    };
    document.querySelector('#platform-logout')?.addEventListener('click', async () => {
      await fetch('/control/platform-logout', { method: 'POST' });
      reload();
    });
    document.querySelector('#rollback')?.addEventListener('click', async () => {
      await fetch('/control/rollback', { method: 'POST' });
      reload();
    });
  </script>` : ""}
</body></html>`;
}

function workspaceHeaders(response: ServerResponse): void {
  response.setHeader(
    "Content-Security-Policy",
    `frame-ancestors http://127.0.0.1:${APPROVED_PARENT_PORT}`,
  );
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function hasWorkspaceSession(cookie = ""): boolean {
  return cookie.split(";").some((value) => value.trim() === "owui_session=active");
}

function serveWorkspace(response: ServerResponse, cookie?: string): void {
  workspaceHeaders(response);
  if (!assignmentEnabled || platformAuthority !== "active") {
    html(response, "<h2>Access denied</h2>", 403);
    return;
  }
  if (!hasWorkspaceSession(cookie)) {
    html(
      response,
      '<h2>Open WebUI sign in</h2><a id="oidc-login" href="/oauth/oidc/login">Continue with OvernightDesk</a>',
    );
    return;
  }
  html(
    response,
    '<h2>Titus workspace</h2><p>Embedded session active</p><a id="workspace-logout" href="/logout">Log out of workspace</a>',
  );
}

const approvedParent = createServer((request, response) => {
  if (request.url === "/health") return html(response, "ok");
  if (request.url === "/control/platform-logout" && request.method === "POST") {
    platformAuthority = "expired";
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/control/rollback" && request.method === "POST") {
    assignmentEnabled = false;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/control/reset" && request.method === "POST") {
    platformAuthority = "active";
    assignmentEnabled = true;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/control/session-expire" && request.method === "POST") {
    platformAuthority = "expired";
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/control/revoke" && request.method === "POST") {
    platformAuthority = "revoked";
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/control/restore" && request.method === "POST") {
    platformAuthority = "active";
    response.writeHead(204).end();
    return;
  }
  const requestUrl = new URL(
    request.url ?? "/",
    `http://127.0.0.1:${APPROVED_PARENT_PORT}`,
  );
  if (requestUrl.pathname === "/runtime-dashboard") {
    if (!assignmentEnabled || platformAuthority === "revoked") {
      return html(response, "<h2>Access denied</h2>", 403);
    }
    if (platformAuthority === "expired") {
      return html(response, "<h2>Authorization required</h2>", 401);
    }
    return html(response, "<h2>Native runtime dashboard</h2>");
  }
  if (requestUrl.pathname === "/dashboard/chat") {
    const requestedAgent = requestUrl.searchParams.get("agent");
    if (requestedAgent && requestedAgent !== "titus" && requestedAgent !== "walter") {
      return html(response, "<h2>Not found</h2>", 404);
    }
    const selectedKey = requestedAgent === "walter" ? "walter" : "titus";
    const requestedSurfaces = requestUrl.searchParams.get("surfaces");
    const surfaces =
      requestedSurfaces === "neither" || requestedSurfaces === "unavailable"
        ? requestedSurfaces
        : "default";
    return html(
      response,
      parentPage(
        "Approved OvernightDesk workspace",
        "chat",
        selectedKey,
        "fleet",
        surfaces,
        requestUrl.searchParams.get("member") === "single",
      ),
    );
  }
  if (requestUrl.pathname === "/dashboard") {
    const selectedKey =
      requestUrl.searchParams.get("agent") === "walter" ? "walter" : "titus";
    return html(
      response,
      parentPage("Approved OvernightDesk overview", "overview", selectedKey),
    );
  }
  if (requestUrl.pathname === "/dashboard/settings") {
    const selectedKey =
      requestUrl.searchParams.get("agent") === "walter" ? "walter" : "titus";
    return html(
      response,
      parentPage("Approved OvernightDesk settings", "settings", selectedKey),
    );
  }
  if (requestUrl.pathname.startsWith("/dashboard/admin")) {
    const selectedKey =
      requestUrl.searchParams.get("agent") === "walter" ? "walter" : "titus";
    const pathSection = requestUrl.pathname.split("/").at(-1);
    const adminSection =
      pathSection === "metrics" || pathSection === "configuration"
        ? pathSection
        : "fleet";
    return html(
      response,
      parentPage(
        "Approved OvernightDesk administration",
        "admin",
        selectedKey,
        adminSection,
      ),
    );
  }
  html(response, parentPage("Approved OvernightDesk shell"));
});

const workspace = createServer((request, response) => {
  if (request.url === "/health") return html(response, "ok");
  if (request.url === "/oauth/oidc/login") {
    if (platformAuthority !== "active" || !assignmentEnabled) {
      return serveWorkspace(response, request.headers.cookie);
    }
    response.writeHead(302, {
      Location: "/workspace",
      "Set-Cookie": "owui_session=active; HttpOnly; SameSite=Lax; Path=/",
    });
    response.end();
    return;
  }
  if (request.url === "/logout") {
    response.writeHead(302, {
      Location: "/workspace",
      "Set-Cookie": "owui_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/",
    });
    response.end();
    return;
  }
  serveWorkspace(response, request.headers.cookie);
});

const unapprovedParent = createServer((_request, response) => {
  html(response, parentPage("Unapproved shell"));
});

approvedParent.listen(APPROVED_PARENT_PORT, "127.0.0.1");
workspace.listen(WORKSPACE_PORT, "127.0.0.1");
unapprovedParent.listen(UNAPPROVED_PARENT_PORT, "127.0.0.1");
