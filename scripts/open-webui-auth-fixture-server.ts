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
<html><body>
  <h1>${title}</h1>
  <button id="platform-logout">Platform logout</button>
  <button id="rollback">Disable assignment</button>
  <iframe id="workspace" title="Titus workspace" src="http://127.0.0.1:${WORKSPACE_PORT}/workspace"></iframe>
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
