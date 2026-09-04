import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolvePracticeCodexHome,
  resolvePracticeCommand,
} from "./practice-command.mjs";

const repositoryRoot = path.resolve("/workspace/overnightdesk");

describe("resolvePracticeCodexHome", () => {
  it("requires an explicit credential directory", () => {
    expect(() => resolvePracticeCodexHome(undefined, repositoryRoot)).toThrowError(
      "EVE_PRACTICE_CODEX_HOME must be a dedicated absolute path outside the repository.",
    );
  });

  it("rejects a relative credential directory", () => {
    expect(() => resolvePracticeCodexHome("private/codex", repositoryRoot)).toThrowError(
      "EVE_PRACTICE_CODEX_HOME must be a dedicated absolute path outside the repository.",
    );
  });

  it("rejects a filesystem root as a credential directory", () => {
    expect(() =>
      resolvePracticeCodexHome(path.parse(repositoryRoot).root, repositoryRoot),
    ).toThrowError(
      "EVE_PRACTICE_CODEX_HOME must be a dedicated absolute path outside the repository.",
    );
  });

  it("rejects a credential directory inside the repository", () => {
    const insideRepository = path.join(repositoryRoot, ".codex-practice");

    expect(() => resolvePracticeCodexHome(insideRepository, repositoryRoot)).toThrowError(
      "EVE_PRACTICE_CODEX_HOME must be a dedicated absolute path outside the repository.",
    );
  });

  it("accepts an absolute credential directory outside the repository", () => {
    const outsideRepository = path.resolve("/private/overnightdesk-eve-practice-codex");

    expect(resolvePracticeCodexHome(outsideRepository, repositoryRoot)).toBe(outsideRepository);
  });

  it("does not confuse a sibling path prefix with repository containment", () => {
    const siblingPrefix = path.resolve("/workspace/overnightdesk-private/codex");

    expect(resolvePracticeCodexHome(siblingPrefix, repositoryRoot)).toBe(siblingPrefix);
  });

  it("rejects a normal Codex home supplied as a prohibited location", () => {
    const defaultCodexHome = path.resolve("/private/operator/.codex");

    expect(() =>
      resolvePracticeCodexHome(defaultCodexHome, repositoryRoot, [
        defaultCodexHome,
      ]),
    ).toThrowError(
      "EVE_PRACTICE_CODEX_HOME must be a dedicated absolute path outside the repository.",
    );
  });

  it("rejects an outside path that resolves through a symlink into the repository", () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "eve-practice-path-test-"),
    );
    const temporaryRepository = path.join(temporaryRoot, "repository");
    const credentialDirectory = path.join(temporaryRepository, "credentials");
    const outsideLink = path.join(temporaryRoot, "credential-link");

    fs.mkdirSync(credentialDirectory, { recursive: true });
    fs.symlinkSync(credentialDirectory, outsideLink, "dir");

    try {
      expect(() =>
        resolvePracticeCodexHome(outsideLink, temporaryRepository),
      ).toThrowError(
        "EVE_PRACTICE_CODEX_HOME must be a dedicated absolute path outside the repository.",
      );
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true });
    }
  });

  it("rejects a not-yet-created directory below a symlink into the repository", () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "eve-practice-parent-link-test-"),
    );
    const temporaryRepository = path.join(temporaryRoot, "repository");
    const outsideLink = path.join(temporaryRoot, "repository-link");

    fs.mkdirSync(temporaryRepository);
    fs.symlinkSync(temporaryRepository, outsideLink, "dir");

    try {
      expect(() =>
        resolvePracticeCodexHome(
          path.join(outsideLink, "new-credentials"),
          temporaryRepository,
        ),
      ).toThrowError(
        "EVE_PRACTICE_CODEX_HOME must be a dedicated absolute path outside the repository.",
      );
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true });
    }
  });
});

describe("resolvePracticeCommand", () => {
  it.each([
    ["auth:login", "codex", ["login"], false],
    ["auth:status", "codex", ["login", "status"], false],
    ["auth:logout", "codex", ["logout"], false],
  ] as const)(
    "allowlists %s",
    (name, executable, args, requiresAuthenticatedCodex) => {
      expect(resolvePracticeCommand(name, repositoryRoot)).toEqual({
        args,
        executable,
        requiresAuthenticatedCodex,
      });
    },
  );

  it("runs eve through the active Node.js runtime", () => {
    const command = resolvePracticeCommand("dev", repositoryRoot);

    expect(command.executable).toBe(process.execPath);
    expect(command.args.at(-1)).toBe("dev");
    expect(command.args.at(0)).toBe(
      path.join(repositoryRoot, "node_modules/eve/bin/eve.js"),
    );
    expect(command.requiresAuthenticatedCodex).toBe(true);
  });

  it("rejects commands outside the allowlist", () => {
    expect(() => resolvePracticeCommand("deploy", repositoryRoot)).toThrowError(
      "Unsupported practice command. Use auth:login, auth:status, auth:logout, or dev.",
    );
  });
});
