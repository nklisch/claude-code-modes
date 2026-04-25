import { describe, test, expect } from "bun:test";
import { formatVersion, VERSION } from "./version.js";
import type { BuildInfo } from "./build-info.js";

describe("formatVersion", () => {
  test("release build with no provenance produces just the version line", () => {
    const info: BuildInfo = { repo: null, branch: null, commit: null, dirty: false };
    const out = formatVersion(info);
    expect(out).toBe(`claude-mode ${VERSION}`);
    expect(out).not.toContain("\n");
  });

  test("full provenance, clean tree", () => {
    const info: BuildInfo = {
      repo: "https://github.com/sarah/claude-code-modes.git",
      branch: "feat/version-flag",
      commit: "90f6fe8",
      dirty: false,
    };
    const out = formatVersion(info);
    expect(out).toBe(
      `claude-mode ${VERSION}\n` +
      `  repo:   https://github.com/sarah/claude-code-modes.git\n` +
      `  branch: feat/version-flag\n` +
      `  commit: 90f6fe8`
    );
  });

  test("dirty working tree adds (dirty) suffix to commit line", () => {
    const info: BuildInfo = {
      repo: "https://github.com/sarah/claude-code-modes.git",
      branch: "feat/version-flag",
      commit: "90f6fe8",
      dirty: true,
    };
    const out = formatVersion(info);
    expect(out).toContain("commit: 90f6fe8 (dirty)");
  });

  test("detached HEAD (null branch) omits the branch line", () => {
    const info: BuildInfo = {
      repo: "https://github.com/sarah/claude-code-modes.git",
      branch: null,
      commit: "90f6fe8",
      dirty: false,
    };
    const out = formatVersion(info);
    expect(out).toContain("repo:");
    expect(out).not.toContain("branch:");
    expect(out).toContain("commit: 90f6fe8");
  });

  test("missing repo omits the repo line but keeps branch and commit", () => {
    const info: BuildInfo = {
      repo: null,
      branch: "feat/version-flag",
      commit: "90f6fe8",
      dirty: false,
    };
    const out = formatVersion(info);
    expect(out).not.toContain("repo:");
    expect(out).toContain("branch: feat/version-flag");
    expect(out).toContain("commit: 90f6fe8");
  });

  test("commit-only build (no repo, no branch) shows just the commit line under the version", () => {
    const info: BuildInfo = { repo: null, branch: null, commit: "90f6fe8", dirty: false };
    const out = formatVersion(info);
    expect(out).toBe(`claude-mode ${VERSION}\n  commit: 90f6fe8`);
  });

  test("first line is always exactly the version regardless of provenance", () => {
    const info: BuildInfo = {
      repo: "https://github.com/sarah/claude-code-modes.git",
      branch: "main",
      commit: "abc1234",
      dirty: false,
    };
    const out = formatVersion(info);
    expect(out.split("\n")[0]).toBe(`claude-mode ${VERSION}`);
  });
});

describe("VERSION", () => {
  test("matches semver shape", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
