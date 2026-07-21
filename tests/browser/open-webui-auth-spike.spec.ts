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

  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Chat" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Titus" })).toBeVisible();
  await expect(page.getByText("Timeless Tech Solutions")).toBeVisible();
  await expect(page.getByText(/Matrix room and approved email channel/)).toBeVisible();

  const frame = await page.locator("#workspace").boundingBox();
  expect(frame?.width).toBeGreaterThan(1100);
  expect(frame?.height).toBeGreaterThan(500);
});

test("mobile shell keeps navigation, identity, fallback, and workspace usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${approvedParent}/dashboard/chat?agent=titus`);

  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Chat" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Titus" })).toBeVisible();
  await expect(page.getByText(/Matrix room and approved email channel/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const frame = await page.locator("#workspace").boundingBox();
  expect(frame?.width).toBeGreaterThan(280);
  expect(frame?.height).toBeGreaterThan(360);
});
