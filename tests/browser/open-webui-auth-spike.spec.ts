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
