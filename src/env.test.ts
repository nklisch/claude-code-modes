import { describe, test, expect, spyOn } from "bun:test";
import { detectEnv, buildTemplateVars, resolveModel } from "./env.js";
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

describe("resolveModel", () => {
  test("resolves a full model id from the table", () => {
    expect(resolveModel("claude-opus-4-8")).toEqual({
      name: "Opus 4.8",
      id: "claude-opus-4-8",
      cutoff: "January 2026",
      capabilities: ["lean-prompt"],
    });
  });

  test("resolves aliases to the newest model of the family", () => {
    expect(resolveModel("opus").id).toBe("claude-opus-5-5");
    expect(resolveModel("sonnet").id).toBe("claude-sonnet-5-5");
    expect(resolveModel("haiku").id).toBe("claude-haiku-4-5");
    expect(resolveModel("fable").id).toBe("claude-fable-5-1");
    expect(resolveModel("opusplan").id).toBe("claude-opus-5-5");
  });

  test("carries the model's prompt bundle", () => {
    expect(resolveModel("claude-opus-5").promptBundle).toEqual(["delivering-work", "corrections", "tool-restraint"]);
    expect(resolveModel("claude-fable-5-1").promptBundle).toEqual(["delivering-work"]);
    expect(resolveModel("claude-opus-5-5").promptBundle).toBeUndefined();
  });

  test("dated variants of a point release match that release, not its major", () => {
    const model = resolveModel("claude-opus-5-5-20260601");
    expect(model.name).toBe("Opus 5.5");
    expect(model.promptBundle).toBeUndefined();
  });

  test("resolves dated model ids by prefix", () => {
    const model = resolveModel("claude-haiku-4-5-20251001");
    expect(model.name).toBe("Haiku 4.5");
    expect(model.id).toBe("claude-haiku-4-5-20251001");
    expect(model.cutoff).toBe("February 2025");
  });

  test("handles the [1m] suffix on ids and aliases", () => {
    expect(resolveModel("claude-opus-4-8[1m]")).toEqual({
      name: "Opus 4.8 (1M context)",
      id: "claude-opus-4-8[1m]",
      cutoff: "January 2026",
      capabilities: ["lean-prompt"],
    });
    expect(resolveModel("opus[1m]").id).toBe("claude-opus-5-5[1m]");
  });

  test("falls back to the default model for null, empty, and 'default'", () => {
    const fallback = resolveModel(null);
    expect(fallback.id).toBe("claude-fable-5-1");
    expect(resolveModel(undefined)).toEqual(fallback);
    expect(resolveModel("")).toEqual(fallback);
    expect(resolveModel("default")).toEqual(fallback);
  });

  test("surfaces unknown model ids as-is with the newest known cutoff", () => {
    const model = resolveModel("claude-newmodel-6");
    expect(model.name).toBe("claude-newmodel-6");
    expect(model.id).toBe("claude-newmodel-6");
    expect(model.cutoff).toBe("June 2026");
    expect(model.promptBundle).toBeUndefined();
  });
});

describe("buildTemplateVars", () => {
  const mockEnv: EnvInfo = {
    cwd: "/home/user/project",
    isGit: true,
    isWorktree: false,
    gitBranch: "main",
    gitStatus: "M src/index.ts",
    gitLog: "abc123 Initial commit",
    platform: "linux",
    shell: "bash",
    osVersion: "Linux 6.19.2",
    model: { name: "Opus 4.8", id: "claude-opus-4-8", cutoff: "January 2026" },
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

  test("uses the resolved model info from env", () => {
    const vars = buildTemplateVars(mockEnv);
    expect(vars.MODEL_NAME).toBe("Opus 4.8");
    expect(vars.MODEL_ID).toBe("claude-opus-4-8");
    expect(vars.KNOWLEDGE_CUTOFF).toBe("January 2026");
  });

  test("returns empty WORKTREE_NOTICE when not in a worktree", () => {
    const vars = buildTemplateVars(mockEnv);
    expect(vars.WORKTREE_NOTICE).toBe("");
  });

  test("emits worktree notice when in a worktree", () => {
    const vars = buildTemplateVars({ ...mockEnv, isWorktree: true });
    expect(vars.WORKTREE_NOTICE).toContain("git worktree");
    expect(vars.WORKTREE_NOTICE).toContain("Do NOT");
  });

  test("worktree notice includes shared stash-stack warning (v2.1.198)", () => {
    const vars = buildTemplateVars({ ...mockEnv, isWorktree: true });
    expect(vars.WORKTREE_NOTICE).toContain("stash stack is shared");
    expect(vars.WORKTREE_NOTICE).toContain("git stash apply <sha>");
  });

  test("describes reminders as system-reminder tags for a model without mid-conv-system", () => {
    const vars = buildTemplateVars(mockEnv);
    expect(vars.SYSTEM_REMINDER_NOTE).toContain("`<system-reminder>` tags");
  });

  test("describes reminders as mid-conversation system turns for a mid-conv-system model", () => {
    const model = { ...mockEnv.model, capabilities: ["lean-prompt", "mid-conv-system"] as const };
    const vars = buildTemplateVars({ ...mockEnv, model });
    expect(vars.SYSTEM_REMINDER_NOTE).toContain("mid-conversation system turns");
  });
});
