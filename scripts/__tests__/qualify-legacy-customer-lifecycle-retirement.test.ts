import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = path.join(
  process.cwd(),
  "scripts/qualify-legacy-customer-lifecycle-retirement.sh",
);

function runQualificationFixture(setup: (root: string) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), "legacy-lifecycle-qualification-"));
  mkdirSync(path.join(root, "src/lib"), { recursive: true });
  mkdirSync(path.join(root, "src/app"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), "{}\n");
  writeFileSync(path.join(root, "package-lock.json"), "{}\n");
  writeFileSync(path.join(root, ".env.example"), "\n");
  writeFileSync(path.join(root, "src/lib/provisioner.ts"), "\n");
  cpSync(
    path.join(process.cwd(), "src/lib/middleware-utils.ts"),
    path.join(root, "src/lib/middleware-utils.ts"),
  );

  try {
    setup(root);
    return spawnSync("bash", [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, LEGACY_LIFECYCLE_REPO_ROOT: root },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("legacy lifecycle qualification scanner", () => {
  it("treats a JavaScript route under a retired directory as active source", () => {
    const result = runQualificationFixture((root) => {
      const routeDirectory = path.join(root, "src/app/api/wizard");
      mkdirSync(routeDirectory, { recursive: true });
      writeFileSync(path.join(routeDirectory, "route.js"), "export {};\n");
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("FAIL [retired-path]");
  });

  it("scans middleware code outside the explicit retired-route registry", () => {
    const result = runQualificationFixture((root) => {
      writeFileSync(
        path.join(root, "src/lib/middleware-utils.ts"),
        `${readFileSync(
          path.join(process.cwd(), "src/lib/middleware-utils.ts"),
          "utf8",
        )}\nconst activeLifecycleReference = "/api/wizard/complete";\n`,
      );
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("FAIL [retired-route-reference]");
  });
});
