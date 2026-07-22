import { expect, test } from "@playwright/test";

const approvedParent = "http://127.0.0.1:4173";
const unapprovedParent = "http://127.0.0.1:4175";

test.beforeEach(async ({ request }) => {
  await request.post(`${approvedParent}/control/reset`);
});

test("OIDC bootstrap, embedded reuse, workspace logout, and re-login", async ({
  page,
}) => {
  await page.goto(approvedParent);
  const workspace = page.frameLocator("#workspace");

  await workspace.getByRole("link", { name: "Continue with OvernightDesk" }).click();
  await expect(workspace.getByRole("heading", { name: "Titus workspace" })).toBeVisible();
  await page.reload();
  await expect(workspace.getByText("Embedded session active")).toBeVisible();

  await workspace.getByRole("link", { name: "Log out of workspace" }).click();
  await expect(
    workspace.getByRole("link", { name: "Continue with OvernightDesk" }),
  ).toBeVisible();
  await workspace.getByRole("link", { name: "Continue with OvernightDesk" }).click();
  await expect(workspace.getByRole("heading", { name: "Titus workspace" })).toBeVisible();
});

test("platform logout denies a retained Open WebUI session", async ({ page }) => {
  await page.goto(approvedParent);
  const workspace = page.frameLocator("#workspace");
  await workspace.getByRole("link", { name: "Continue with OvernightDesk" }).click();
  await page.getByRole("button", { name: "Platform logout" }).click();
  await expect(workspace.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("rollback closes the assignment without clearing the browser fixture", async ({
  page,
}) => {
  await page.goto(approvedParent);
  const workspace = page.frameLocator("#workspace");
  await workspace.getByRole("link", { name: "Continue with OvernightDesk" }).click();
  await page.getByRole("button", { name: "Disable assignment" }).click();
  await expect(workspace.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("an unapproved origin cannot frame the workspace", async ({ page }) => {
  await page.goto(unapprovedParent);
  const workspace = page.frameLocator("#workspace");
  await expect(workspace.getByRole("heading", { name: "Open WebUI sign in" })).toHaveCount(0);
});

test("desktop shell reaches a full-height workspace without a duplicate Open Chat tab", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${approvedParent}/dashboard/chat?agent=titus`);

  await expect(
    page.getByRole("link", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Chat", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Titus" })).toBeVisible();
  await expect(page.getByText("Timeless Tech Solutions")).toBeVisible();
  await expect(page.getByText(/Matrix room and approved email channel/)).toBeVisible();

  const frame = await page.locator("#workspace").boundingBox();
  expect(frame?.width).toBeGreaterThan(1100);
  expect(frame?.height).toBeGreaterThan(820);

  const fullSizeChat = page.getByRole("link", {
    name: "Open Chat in New Window",
  });
  await expect(fullSizeChat).toHaveAttribute("target", "_blank");
  await expect(fullSizeChat).toHaveAttribute("rel", "noopener noreferrer");
});

test("mobile shell keeps navigation, identity, fallback, and workspace usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${approvedParent}/dashboard/chat?agent=titus`);

  await expect(
    page.getByRole("link", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Chat", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Titus" })).toBeVisible();
  await expect(page.getByText(/Matrix room and approved email channel/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const frame = await page.locator("#workspace").boundingBox();
  expect(frame?.width).toBeGreaterThan(280);
  expect(frame?.height).toBeGreaterThan(650);
});

test("composable workspace keeps chat open and exposes a safe independent dashboard launch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${approvedParent}/dashboard/chat?agent=titus`);

  await expect(page.getByRole("navigation", { name: "Choose agent" })).toContainText(
    "Titus",
  );
  await expect(page.getByRole("navigation", { name: "Choose agent" })).toContainText(
    "Walter",
  );
  await expect(page.getByRole("region", { name: "Capabilities" })).toContainText(
    "Open Chat",
  );
  await expect(page.getByRole("region", { name: "Capabilities" })).toContainText(
    "Advanced Dashboard",
  );
  const dashboard = page.getByRole("link", { name: "Open Advanced Dashboard" });
  const fullSizeChat = page.getByRole("link", {
    name: "Open Chat in New Window",
  });
  await expect(fullSizeChat).toHaveAttribute("target", "_blank");
  await expect(fullSizeChat).toHaveAttribute("rel", "noopener noreferrer");
  await expect(dashboard).toHaveAttribute("target", "_blank");
  await expect(dashboard).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator("#workspace")).toBeVisible();
});

test("opening, closing, and reopening the dashboard preserves the active chat", async ({
  page,
}) => {
  await page.goto(`${approvedParent}/dashboard/chat?agent=titus`);
  const workspace = page.frameLocator("#workspace");
  await workspace.getByRole("link", { name: "Continue with OvernightDesk" }).click();
  await expect(workspace.getByText("Embedded session active")).toBeVisible();

  const dashboardLink = page.getByRole("link", {
    name: "Open Advanced Dashboard",
  });
  const firstDashboardPromise = page.waitForEvent("popup");
  await dashboardLink.click();
  const firstDashboard = await firstDashboardPromise;
  await expect(firstDashboard.getByRole("heading", { name: "Native runtime dashboard" })).toBeVisible();
  await firstDashboard.close();
  await expect(workspace.getByText("Embedded session active")).toBeVisible();

  const reopenedDashboardPromise = page.waitForEvent("popup");
  await dashboardLink.click();
  const reopenedDashboard = await reopenedDashboardPromise;
  await expect(reopenedDashboard.getByRole("heading", { name: "Native runtime dashboard" })).toBeVisible();
  await expect(workspace.getByText("Embedded session active")).toBeVisible();
  await reopenedDashboard.close();
});

test("dashboard-only and neither states stay explicit without a chat frame", async ({
  page,
}) => {
  await page.goto(`${approvedParent}/dashboard/chat?agent=walter`);

  await expect(page.getByRole("heading", { name: "Walter" })).toBeVisible();
  await expect(page.getByText("Open Chat is not deployed")).toBeVisible();
  await expect(page.locator("#workspace")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open Advanced Dashboard" }),
  ).toBeVisible();

  await page.goto(`${approvedParent}/dashboard/chat?agent=titus&surfaces=neither`);
  await expect(page.getByText("Open Chat is not deployed")).toBeVisible();
  await expect(page.locator("#workspace")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open Advanced Dashboard" }),
  ).toHaveCount(0);
});

test("a one-agent member receives no selector or capability for another agent", async ({
  page,
}) => {
  await page.goto(`${approvedParent}/dashboard/chat?agent=titus&member=single`);

  await expect(page.getByRole("navigation", { name: "Choose agent" })).toContainText(
    "Titus",
  );
  await expect(page.getByRole("navigation", { name: "Choose agent" })).not.toContainText(
    "Walter",
  );
  await expect(page.getByRole("link", { name: "Walter" })).toHaveCount(0);
});

test("invalid and unavailable workspace selection fails closed", async ({ page }) => {
  const invalid = await page.goto(`${approvedParent}/dashboard/chat?agent=unknown`);
  expect(invalid?.status()).toBe(404);
  await expect(page.locator("#workspace")).toHaveCount(0);

  await page.goto(`${approvedParent}/dashboard/chat?agent=titus&surfaces=unavailable`);
  await expect(page.getByRole("alert")).toContainText(
    "Agent workspace is temporarily unavailable",
  );
  await expect(page.locator("#workspace")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open Advanced Dashboard" }),
  ).toHaveCount(0);
});

for (const width of [320, 768, 1024, 1440]) {
  test(`${width}px composable workspace keeps keyboard actions usable without overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${approvedParent}/dashboard/chat?agent=titus`);

    const dashboard = page.getByRole("link", { name: "Open Advanced Dashboard" });
    await dashboard.focus();
    await expect(dashboard).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("expiry, revocation, and restoration deny both independent surfaces", async ({
  page,
  request,
}) => {
  await page.goto(`${approvedParent}/dashboard/chat?agent=titus`);
  const workspace = page.frameLocator("#workspace");
  await workspace.getByRole("link", { name: "Continue with OvernightDesk" }).click();

  await request.post(`${approvedParent}/control/session-expire`);
  await page.reload();
  await expect(workspace.getByRole("heading", { name: "Access denied" })).toBeVisible();
  expect((await request.get(`${approvedParent}/runtime-dashboard`)).status()).toBe(401);

  await request.post(`${approvedParent}/control/restore`);
  await page.reload();
  await expect(workspace.getByText("Embedded session active")).toBeVisible();
  expect((await request.get(`${approvedParent}/runtime-dashboard`)).status()).toBe(200);

  await request.post(`${approvedParent}/control/revoke`);
  await page.reload();
  await expect(workspace.getByRole("heading", { name: "Access denied" })).toBeVisible();
  expect((await request.get(`${approvedParent}/runtime-dashboard`)).status()).toBe(403);

  await request.post(`${approvedParent}/control/restore`);
  await page.reload();
  await expect(workspace.getByText("Embedded session active")).toBeVisible();
  expect((await request.get(`${approvedParent}/runtime-dashboard`)).status()).toBe(200);
});

test("desktop overview keeps the same Runtime and capability structure for Titus and Walter", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${approvedParent}/dashboard?agent=titus`);

  await expect(page.getByRole("heading", { name: "Titus" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Runtime" })).toContainText(
    "hermes-titus",
  );
  await expect(page.getByRole("region", { name: "Runtime" })).toContainText(
    "owner",
  );
  await expect(
    page.getByRole("listitem").filter({ hasText: "Open Chat" }),
  ).toContainText("Available");
  await expect(
    page.getByRole("listitem").filter({ hasText: "Advanced Dashboard" }),
  ).toContainText("Not deployed");

  await page.getByRole("link", { name: "Walter" }).click();
  await expect(page).toHaveURL(/\/dashboard\?agent=walter$/);
  await expect(page.getByRole("heading", { name: "Walter" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Runtime" })).toContainText(
    "hermes-walter",
  );
  await expect(page.getByRole("region", { name: "Runtime" })).toContainText(
    "owner",
  );
  await expect(
    page.getByRole("listitem").filter({ hasText: "Open Chat" }),
  ).toContainText("Not deployed");
  await expect(
    page.getByRole("listitem").filter({ hasText: "Advanced Dashboard" }),
  ).toContainText("Available");
});

test("mobile overview keeps selected-agent sections usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${approvedParent}/dashboard?agent=walter`);

  await expect(page.getByRole("heading", { name: "Walter" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Runtime" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Capabilities" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const width of [768, 1024]) {
  test(`${width}px overview supports keyboard agent selection without overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${approvedParent}/dashboard?agent=titus`);

    const walter = page.getByRole("link", { name: "Walter" });
    await walter.focus();
    await expect(walter).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/dashboard\?agent=walter$/);
    await expect(page.getByRole("heading", { name: "Walter" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Runtime" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Capabilities" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("settings separates global account controls from selected-agent context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${approvedParent}/dashboard/settings?agent=walter`);

  await expect(page.getByRole("heading", { name: "Account-wide settings" })).toBeVisible();
  await expect(page.getByText("owner@example.test")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Walter" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Runtime" })).toContainText("hermes-walter");
  await expect(page.getByRole("region", { name: "Agent configuration" })).toContainText("Read only");

  await page.getByRole("link", { name: "Titus" }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\?agent=titus$/);
  await expect(page.getByText("owner@example.test")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Titus" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Runtime" })).toContainText("hermes-titus");
});

test("mobile settings preserves scope and selected-agent hierarchy", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${approvedParent}/dashboard/settings?agent=titus`);

  await expect(page.getByRole("heading", { name: "Account-wide settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent settings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Runtime" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("admin keeps global Fleet and Metrics separate from selected-agent Configuration", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${approvedParent}/dashboard/admin/fleet`);

  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin sections" })).toContainText("Fleet");
  await expect(page.getByRole("navigation", { name: "Admin sections" })).toContainText("Metrics");
  await expect(page.getByRole("navigation", { name: "Admin sections" })).toContainText("Configuration");
  await expect(page.getByRole("heading", { name: "Fleet" })).toBeVisible();
  await expect(page.getByText("Global scope")).toBeVisible();

  await page.getByRole("link", { name: "Metrics" }).click();
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  await expect(page.getByText("Global scope")).toBeVisible();

  await page.getByRole("link", { name: "Configuration" }).click();
  await expect(page.getByRole("heading", { name: "Configuration", exact: true })).toBeVisible();
  await expect(page.getByText("Selected-agent scope")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Titus" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Runtime" })).toContainText("hermes-titus");
});

test("mobile admin configuration preserves navigation and selected-agent hierarchy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${approvedParent}/dashboard/admin/configuration?agent=walter`);

  await expect(page.getByRole("navigation", { name: "Admin sections" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Walter" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Runtime" })).toContainText("hermes-walter");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
