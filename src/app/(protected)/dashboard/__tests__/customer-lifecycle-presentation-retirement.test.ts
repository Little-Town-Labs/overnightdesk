import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

describe("customer lifecycle presentation retirement", () => {
  it.each([
    "src/app/(protected)/dashboard/setup-wizard.tsx",
    "src/app/(protected)/dashboard/provisioning-progress.tsx",
    "src/app/(protected)/dashboard/onboarding-wizard.tsx",
  ])("removes %s", (relativePath) => {
    expect(existsSync(path.join(process.cwd(), relativePath))).toBe(false);
  });

  it("removes setup, provisioning, and onboarding controls from the dashboard", () => {
    const dashboardSource = readFileSync(
      path.join(process.cwd(), "src/app/(protected)/dashboard/page.tsx"),
      "utf8",
    );

    expect(dashboardSource).not.toMatch(
      /SetupWizard|ProvisioningProgress|OnboardingWizard/,
    );
    expect(dashboardSource).not.toMatch(
      /showOnboarding|isWizard|isProvisioning/,
    );
  });

  it("keeps non-running instance status read-only", () => {
    const dashboardSource = readFileSync(
      path.join(process.cwd(), "src/app/(protected)/dashboard/page.tsx"),
      "utf8",
    );

    expect(dashboardSource).toMatch(
      /\{inst && !isRunning && \([\s\S]*?<StatusBadge[\s\S]*?label: inst\.status[\s\S]*?\)\}/,
    );
    expect(dashboardSource).not.toMatch(
      /SetupWizard|ProvisioningProgress|OnboardingWizard/,
    );
  });

  it.each([
    [
      "Telegram",
      "src/app/(protected)/dashboard/bridges/telegram/telegram-wizard.tsx",
      "src/app/(protected)/dashboard/bridges/telegram/page.tsx",
      "TelegramWizard",
    ],
    [
      "Discord",
      "src/app/(protected)/dashboard/bridges/discord/discord-wizard.tsx",
      "src/app/(protected)/dashboard/bridges/discord/page.tsx",
      "DiscordWizard",
    ],
  ])("preserves the %s bridge configuration wizard", (_bridge, wizardPath, pagePath, exportName) => {
    expect(existsSync(path.join(process.cwd(), wizardPath))).toBe(true);

    const wizardSource = readFileSync(
      path.join(process.cwd(), wizardPath),
      "utf8",
    );
    const pageSource = readFileSync(path.join(process.cwd(), pagePath), "utf8");

    expect(wizardSource).toContain(`export function ${exportName}`);
    expect(pageSource).toContain(`import { ${exportName} }`);
    expect(pageSource).toContain(`<${exportName}`);
  });
});
