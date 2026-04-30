import { describe, test, expect, spyOn } from "bun:test";
import { detectEnv, buildTemplateVars } from "./env.js";
import type { EnvInfo } from "./types.js";

describe("detectEnv", () => {
  test("returns cwd matching process.cwd()", () => {
    const env = detectEnv();
    expect(env.cwd).toBe(process.cwd());
  });

  test("returns boolean isGit", () => {
    const env = detectEnv();
    expect(typeof env.isGit).toBe("boolean");
  });

  test("returns non-empty platform", () => {
    const env = detectEnv();
    expect(env.platform.length).toBeGreaterThan(0);
    expect(["linux", "darwin", "windows_nt"]).toContain(env.platform);
  });

  test("returns non-empty shell", () => {
    const env = detectEnv();
    expect(env.shell.length).toBeGreaterThan(0);
  });

  test("returns non-empty osVersion", () => {
    const env = detectEnv();
    expect(env.osVersion.length).toBeGreaterThan(0);
  });

  test("returns git info when in a git repo", () => {
    const env = detectEnv();
    if (env.isGit) {
      expect(env.gitBranch).not.toBeNull();
    }
  });

  // Regression: on Windows, `2>/dev/null` is interpreted by cmd.exe as a path
  // redirection and prints "The system cannot find the path specified." to
  // stderr for every invocation. detectEnv must not write anything to stderr
  // when run outside a git repo or when shell utilities (uname) are missing.
  test("does not leak stderr from failing subprocesses", () => {
    const writeSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      detectEnv();
      const calls = writeSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(calls).not.toContain("The system cannot find the path specified");
      expect(calls).not.toContain("not a git repository");
    } finally {
      writeSpy.mockRestore();
    }
  });
});

describe("buildTemplateVars", () => {
  const mockEnv: EnvInfo = {
    cwd: "/home/user/project",
    isGit: true,
    gitBranch: "main",
    gitStatus: "M src/index.ts",
    gitLog: "abc123 Initial commit",
    platform: "linux",
    shell: "bash",
    osVersion: "Linux 6.19.2",
  };

  test("converts isGit boolean to string", () => {
    const vars = buildTemplateVars(mockEnv);
    expect(vars.IS_GIT).toBe("true");
  });

  test("formats git status block with branch and status", () => {
    const vars = buildTemplateVars(mockEnv);
    expect(vars.GIT_STATUS).toContain("Current branch: main");
    expect(vars.GIT_STATUS).toContain("M src/index.ts");
  });

  test("returns empty GIT_STATUS when not a git repo", () => {
    const vars = buildTemplateVars({ ...mockEnv, isGit: false });
    expect(vars.GIT_STATUS).toBe("");
  });

  test("includes hardcoded model info", () => {
    const vars = buildTemplateVars(mockEnv);
    expect(vars.MODEL_NAME.length).toBeGreaterThan(0);
    expect(vars.MODEL_ID.length).toBeGreaterThan(0);
    expect(vars.KNOWLEDGE_CUTOFF.length).toBeGreaterThan(0);
  });
});
