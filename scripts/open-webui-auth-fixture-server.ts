import { createServer, type ServerResponse } from "node:http";

const APPROVED_PARENT_PORT = 4173;
const WORKSPACE_PORT = 4174;
const UNAPPROVED_PARENT_PORT = 4175;

let platformSessionActive = true;
let assignmentEnabled = true;

function html(response: ServerResponse, body: string, status = 200): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function parentPage(title: string): string {
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
    @media (max-width: 480px) {
      body { padding: 12px; }
      #workspace { height: calc(100dvh - 250px); min-height: 400px; }
      .controls { flex-wrap: wrap; }
    }
  </style>
</head><body>
  <div class="shell">
    <h1 class="brand">OvernightDesk</h1>
    <nav aria-label="Dashboard">
      <a href="/dashboard">Overview</a>
      <a href="/dashboard/settings">Settings</a>
    </nav>
    <header class="identity">
      <span class="mark" aria-hidden="true">T</span>
      <div><h2>Titus</h2><p>Timeless Tech Solutions</p></div>
    </header>
    <iframe id="workspace" title="Titus workspace" src="http://127.0.0.1:${WORKSPACE_PORT}/workspace"></iframe>
    <p class="fallback">Your existing Titus Matrix room and approved email channel remain available and independent of Open Chat.</p>
    <div class="controls">
      <button id="platform-logout">Platform logout</button>
      <button id="rollback">Disable assignment</button>
    </div>
  </div>
  <script>
    const reload = () => {
      const frame = document.querySelector('#workspace');
      frame.src = frame.src;
    };
    document.querySelector('#platform-logout').onclick = async () => {
      await fetch('/control/platform-logout', { method: 'POST' });
      reload();
    };
    document.querySelector('#rollback').onclick = async () => {
      await fetch('/control/rollback', { method: 'POST' });
      reload();
    };
  </script>
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
  if (!assignmentEnabled || !platformSessionActive) {
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
    platformSessionActive = false;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/control/rollback" && request.method === "POST") {
    assignmentEnabled = false;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/control/reset" && request.method === "POST") {
    platformSessionActive = true;
    assignmentEnabled = true;
    response.writeHead(204).end();
    return;
  }
  html(response, parentPage("Approved OvernightDesk shell"));
});

const workspace = createServer((request, response) => {
  if (request.url === "/health") return html(response, "ok");
  if (request.url === "/oauth/oidc/login") {
    if (!platformSessionActive || !assignmentEnabled) {
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
