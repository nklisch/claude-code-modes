import { describe, test, expect, afterAll } from "bun:test";
import { join } from "node:path";
import {
  readFragment,
  substituteTemplateVars,
  getFragmentOrder,
  assemblePrompt,
  writeTempPrompt,
} from "./assemble.js";
import { existsSync, unlinkSync, rmdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { ModeConfig, TemplateVars } from "./types.js";
import { makeTempDir } from "./test-helpers.js";

const PROMPTS_DIR = join(import.meta.dir, "..", "prompts");

const TEST_VARS: TemplateVars = {
  CWD: "/test/project",
  IS_GIT: "true",
  PLATFORM: "linux",
  SHELL: "bash",
  OS_VERSION: "Linux 6.0",
  MODEL_NAME: "Claude Opus 4.6",
  MODEL_ID: "claude-opus-4-6",
  KNOWLEDGE_CUTOFF: "May 2025",
  GIT_STATUS: "Current branch: main\n\nStatus:\n(clean)",
  WORKTREE_NOTICE: "",
};

describe("readFragment", () => {
  test("reads existing fragment", () => {
    const content = readFragment(PROMPTS_DIR, "base/intro.md");
    expect(content).not.toBeNull();
    expect(content).toContain("Claude Code");
  });

  test("returns null for non-existent fragment", () => {
    const content = readFragment(PROMPTS_DIR, "base/nonexistent.md");
    expect(content).toBeNull();
  });
});

describe("substituteTemplateVars", () => {
  test("replaces all template variables", () => {
    const result = substituteTemplateVars("Dir: {{CWD}}, Shell: {{SHELL}}", TEST_VARS);
    expect(result).toBe("Dir: /test/project, Shell: bash");
  });

  test("replaces multiple occurrences of same variable", () => {
    const result = substituteTemplateVars("{{CWD}} and {{CWD}}", TEST_VARS);
    expect(result).toBe("/test/project and /test/project");
  });

  test("throws on unreplaced variables", () => {
    expect(() => substituteTemplateVars("{{UNKNOWN_VAR}}", TEST_VARS)).toThrow(
      "Unreplaced template variables"
    );
  });

  test("does not throw when all variables are replaced", () => {
    expect(() =>
      substituteTemplateVars("{{CWD}} {{PLATFORM}}", TEST_VARS)
    ).not.toThrow();
  });
});

describe("getFragmentOrder", () => {
  const noneMode: ModeConfig = {
    base: "standard",
    axes: null,
    modifiers: [],
  };

  const autonomousMode: ModeConfig = {
    base: "standard",
    axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
    modifiers: [],
  };

  const collaborativeMode: ModeConfig = {
    base: "standard",
    axes: { agency: "collaborative", quality: "pragmatic", scope: "adjacent" },
    modifiers: [],
  };

  test("none mode has no axis fragments", () => {
    const order = getFragmentOrder(noneMode, PROMPTS_DIR);
    expect(order.some((p) => p.startsWith("axis/"))).toBe(false);
  });

  test("none mode includes all base fragments", () => {
    const order = getFragmentOrder(noneMode, PROMPTS_DIR);
    expect(order).toContain("base/intro.md");
    expect(order).toContain("base/system.md");
    expect(order).toContain("base/doing-tasks.md");
    expect(order).toContain("base/tools.md");
    expect(order).toContain("base/tone.md");
    expect(order).toContain("base/session-guidance.md");
    expect(order).toContain("base/env.md");
  });

  test("none mode uses merged actions fragment", () => {
    const order = getFragmentOrder(noneMode, PROMPTS_DIR);
    expect(order).toContain("base/actions.md");
    expect(order).not.toContain("base/actions-cautious.md");
    expect(order).not.toContain("base/actions-autonomous.md");
  });

  test("autonomous mode uses merged actions fragment", () => {
    const order = getFragmentOrder(autonomousMode, PROMPTS_DIR);
    expect(order).toContain("base/actions.md");
    expect(order).not.toContain("base/actions-autonomous.md");
    expect(order).not.toContain("base/actions-cautious.md");
  });

  test("collaborative mode uses merged actions fragment", () => {
    const order = getFragmentOrder(collaborativeMode, PROMPTS_DIR);
    expect(order).toContain("base/actions.md");
  });

  test("includes axis fragments when axes are set", () => {
    const order = getFragmentOrder(autonomousMode, PROMPTS_DIR);
    expect(order).toContain("axis/agency/autonomous.md");
    expect(order).toContain("axis/quality/architect.md");
    expect(order).toContain("axis/scope/unrestricted.md");
  });

  test("excludes context-pacing by default", () => {
    expect(getFragmentOrder(noneMode, PROMPTS_DIR)).not.toContain("modifiers/context-pacing.md");
    expect(getFragmentOrder(autonomousMode, PROMPTS_DIR)).not.toContain("modifiers/context-pacing.md");
  });

  test("includes context-pacing when in modifiers list", () => {
    const withContextPacing: ModeConfig = { base: "standard", axes: null, modifiers: ["modifiers/context-pacing.md"] };
    expect(getFragmentOrder(withContextPacing, PROMPTS_DIR)).toContain("modifiers/context-pacing.md");
  });

  test("includes readonly only when in modifiers list", () => {
    const readonlyMode: ModeConfig = { base: "standard", axes: null, modifiers: ["modifiers/readonly.md"] };
    expect(getFragmentOrder(readonlyMode, PROMPTS_DIR)).toContain("modifiers/readonly.md");
    expect(getFragmentOrder(noneMode, PROMPTS_DIR)).not.toContain("modifiers/readonly.md");
  });

  test("env.md is always last", () => {
    const order = getFragmentOrder(noneMode, PROMPTS_DIR);
    expect(order[order.length - 1]).toBe("base/env.md");
  });

  test("axis fragments appear before actions and tools in manifest order", () => {
    const order = getFragmentOrder(autonomousMode, PROMPTS_DIR);
    const agencyIdx = order.indexOf("axis/agency/autonomous.md");
    const actionsIdx = order.indexOf("base/actions.md");
    expect(agencyIdx).toBeGreaterThan(-1);
    expect(actionsIdx).toBeGreaterThan(-1);
    expect(agencyIdx).toBeLessThan(actionsIdx);
  });
});

describe("getFragmentOrder — chill base", () => {
  const chillNone: ModeConfig = {
    base: "chill",
    axes: null,
    modifiers: [],
  };

  const chillAuto: ModeConfig = {
    base: "chill",
    axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
    modifiers: [],
  };

  test("chill base produces correct fragment paths", () => {
    const order = getFragmentOrder(chillNone, PROMPTS_DIR);
    expect(order).toContain("chill/core.md");
    expect(order).toContain("chill/actions.md");
    expect(order).toContain("chill/tools.md");
    expect(order).toContain("chill/env.md");
  });

  test("chill base env.md is last", () => {
    const order = getFragmentOrder(chillNone, PROMPTS_DIR);
    expect(order[order.length - 1]).toBe("chill/env.md");
  });

  test("chill base with axes includes axis fragments", () => {
    const order = getFragmentOrder(chillAuto, PROMPTS_DIR);
    expect(order).toContain("axis/agency/autonomous.md");
    expect(order).toContain("axis/quality/architect.md");
    expect(order).toContain("axis/scope/unrestricted.md");
  });

  test("chill none mode has no axis fragments", () => {
    const order = getFragmentOrder(chillNone, PROMPTS_DIR);
    expect(order.some((p) => p.startsWith("axis/"))).toBe(false);
  });

  test("chill base includes modifiers in correct position", () => {
    const withMods: ModeConfig = {
      base: "chill",
      axes: null,
      modifiers: ["modifiers/context-pacing.md", "modifiers/readonly.md"],
    };
    const order = getFragmentOrder(withMods, PROMPTS_DIR);
    expect(order).toContain("modifiers/context-pacing.md");
    expect(order).toContain("modifiers/readonly.md");
    const contextIdx = order.indexOf("modifiers/context-pacing.md");
    const envIdx = order.indexOf("chill/env.md");
    expect(contextIdx).toBeLessThan(envIdx);
  });
});

describe("getFragmentOrder — manifest validation", () => {
  test("missing manifest for custom base throws", () => {
    const mode: ModeConfig = {
      base: "/nonexistent/base-dir",
      axes: null,
      modifiers: [],
    };
    expect(() => getFragmentOrder(mode, PROMPTS_DIR)).toThrow("does not contain a base.json manifest");
  });
});

describe("assemblePrompt", () => {
  test("assembles none mode without errors", () => {
    const result = assemblePrompt({
      mode: { base: "standard", axes: null, modifiers: [] },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result.length).toBeGreaterThan(0);
  });

  test("assembled prompt has no unreplaced template variables", () => {
    const result = assemblePrompt({
      mode: { base: "standard", axes: null, modifiers: [] },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("assembled prompt contains key sections", () => {
    const result = assemblePrompt({
      mode: { base: "standard", axes: null, modifiers: [] },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result).toContain("Claude Code");
    expect(result).toContain("# System");
    expect(result).toContain("# Doing tasks");
    expect(result).toContain("# Using your tools");
    expect(result).toContain("# Tone and style");
    expect(result).toContain("# Environment");
  });

  test("assembles preset mode without errors", () => {
    const result = assemblePrompt({
      mode: {
        base: "standard",
        axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
        modifiers: [],
      },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(result).toContain("# Agency: Autonomous");
    expect(result).toContain("# Quality: Architect");
    expect(result).toContain("# Scope: Unrestricted");
  });

  test("chill base assembles without errors", () => {
    const result = assemblePrompt({
      mode: {
        base: "chill",
        axes: { agency: "collaborative", quality: "pragmatic", scope: "adjacent" },
        modifiers: [],
      },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("chill base contains no ALL-CAPS emphasis words", () => {
    const result = assemblePrompt({
      mode: {
        base: "chill",
        axes: null,
        modifiers: [],
      },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result).not.toMatch(/\bIMPORTANT\b/);
    expect(result).not.toMatch(/\bCRITICAL\b/);
    expect(result).not.toMatch(/\bMUST\b/);
    expect(result).not.toMatch(/\bNEVER\b/);
  });

  test("debug preset assembles without errors and includes investigation content", () => {
    const result = assemblePrompt({
      mode: {
        base: "chill",
        axes: { agency: "collaborative", quality: "pragmatic", scope: "narrow" },
        modifiers: ["modifiers/debug.md"],
      },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(result).toContain("Investigation mode");
  });

  test("methodical preset assembles without errors and includes methodical content", () => {
    const result = assemblePrompt({
      mode: {
        base: "chill",
        axes: { agency: "surgical", quality: "architect", scope: "narrow" },
        modifiers: ["modifiers/methodical.md"],
      },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(result).toContain("Methodical mode");
  });

  test("debug modifier content has no ALL-CAPS emphasis", () => {
    const result = assemblePrompt({
      mode: { base: "chill", axes: null, modifiers: ["modifiers/debug.md"] },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result).not.toMatch(/\bIMPORTANT\b/);
    expect(result).not.toMatch(/\bCRITICAL\b/);
    expect(result).not.toMatch(/\bMUST\b/);
    expect(result).not.toMatch(/\bNEVER\b/);
  });

  test("methodical modifier content has no ALL-CAPS emphasis", () => {
    const result = assemblePrompt({
      mode: { base: "chill", axes: null, modifiers: ["modifiers/methodical.md"] },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result).not.toMatch(/\bIMPORTANT\b/);
    expect(result).not.toMatch(/\bCRITICAL\b/);
    expect(result).not.toMatch(/\bMUST\b/);
    expect(result).not.toMatch(/\bNEVER\b/);
  });
});

describe("assemblePrompt custom prompts", () => {
  let tempDir: string;

  afterAll(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  test("custom modifier content appears in output", () => {
    tempDir = makeTempDir("assemble-custom-");
    const customPath = join(tempDir, "custom-modifier.md");
    writeFileSync(customPath, "# Custom Test Rule\nDo this thing.", "utf8");

    const mode: ModeConfig = {
      base: "standard",
      axes: null,
      modifiers: [customPath],
    };
    const result = assemblePrompt({ mode, templateVars: TEST_VARS, promptsDir: PROMPTS_DIR });
    expect(result).toContain("# Custom Test Rule");
    expect(result).toContain("Do this thing.");
  });

  test("custom axis file content appears in output", () => {
    tempDir = makeTempDir("assemble-custom-axis-");
    const customPath = join(tempDir, "team-quality.md");
    writeFileSync(customPath, "# Quality: Team Standard\nOur team quality rules.", "utf8");

    const mode: ModeConfig = {
      base: "standard",
      axes: { agency: "collaborative", quality: customPath, scope: "adjacent" },
      modifiers: [],
    };
    const result = assemblePrompt({ mode, templateVars: TEST_VARS, promptsDir: PROMPTS_DIR });
    expect(result).toContain("Team Standard");
    expect(result).not.toContain("# Quality: Architect");
    expect(result).not.toContain("# Quality: Pragmatic");
    expect(result).not.toContain("# Quality: Minimal");
  });

  test("missing custom modifier throws with clear error", () => {
    const mode: ModeConfig = {
      base: "standard",
      axes: null,
      modifiers: ["/nonexistent/path.md"],
    };
    expect(() =>
      assemblePrompt({ mode, templateVars: TEST_VARS, promptsDir: PROMPTS_DIR })
    ).toThrow("Missing prompt fragment");
  });

  test("missing custom axis file throws with clear error", () => {
    const mode: ModeConfig = {
      base: "standard",
      axes: { agency: "collaborative", quality: "/nonexistent/quality.md", scope: "adjacent" },
      modifiers: [],
    };
    expect(() =>
      assemblePrompt({ mode, templateVars: TEST_VARS, promptsDir: PROMPTS_DIR })
    ).toThrow("Missing prompt fragment");
  });
});

describe("getFragmentOrder custom prompts", () => {
  test("modifiers appear in list order, before env", () => {
    const mode: ModeConfig = {
      base: "standard",
      axes: null,
      modifiers: ["modifiers/context-pacing.md", "modifiers/readonly.md", "/tmp/custom.md"],
    };
    const order = getFragmentOrder(mode, PROMPTS_DIR);
    const contextPacingIdx = order.indexOf("modifiers/context-pacing.md");
    const readonlyIdx = order.indexOf("modifiers/readonly.md");
    const customIdx = order.indexOf("/tmp/custom.md");
    const envIdx = order.indexOf("base/env.md");

    expect(contextPacingIdx).toBeGreaterThan(-1);
    expect(readonlyIdx).toBeGreaterThan(-1);
    expect(customIdx).toBeGreaterThan(-1);
    expect(envIdx).toBeGreaterThan(-1);
    expect(contextPacingIdx).toBeLessThan(readonlyIdx);
    expect(readonlyIdx).toBeLessThan(customIdx);
    expect(customIdx).toBeLessThan(envIdx);
  });

  test("custom agency path produces absolute path in fragment list", () => {
    const mode: ModeConfig = {
      base: "standard",
      axes: { agency: "/tmp/custom-agency.md", quality: "pragmatic", scope: "adjacent" },
      modifiers: [],
    };
    const order = getFragmentOrder(mode, PROMPTS_DIR);
    expect(order).toContain("/tmp/custom-agency.md");
    expect(order).toContain("base/actions.md");
  });
});

describe("assemblePrompt embedded prompts", () => {
  test("assemblePrompt works with non-existent promptsDir for none mode", () => {
    const result = assemblePrompt({
      mode: { base: "standard", axes: null, modifiers: [] },
      templateVars: TEST_VARS,
      promptsDir: "/nonexistent/path",
    });
    expect(result).toContain("Claude Code");
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("assemblePrompt works with non-existent promptsDir for preset with axes", () => {
    // Spec: built-in fragments resolve from embedded map, not disk
    const result = assemblePrompt({
      mode: {
        base: "standard",
        axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
        modifiers: [],
      },
      templateVars: TEST_VARS,
      promptsDir: "/nonexistent/path",
    });
    expect(result).toContain("# Agency: Autonomous");
    expect(result).toContain("# Quality: Architect");
    expect(result).toContain("# Scope: Unrestricted");
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("assemblePrompt with modifiers works from embedded map", () => {
    // Spec: readonly and context-pacing modifiers are built-in, should embed
    const result = assemblePrompt({
      mode: {
        base: "standard",
        axes: null,
        modifiers: ["modifiers/readonly.md", "modifiers/context-pacing.md"],
      },
      templateVars: TEST_VARS,
      promptsDir: "/nonexistent/path",
    });
    expect(result).toContain("# Read-only mode");
    expect(result).toContain("# Context and pacing");
  });

  test("assemblePrompt with debug modifier works from embedded map", () => {
    const result = assemblePrompt({
      mode: {
        base: "chill",
        axes: null,
        modifiers: ["modifiers/debug.md"],
      },
      templateVars: TEST_VARS,
      promptsDir: "/nonexistent/path",
    });
    expect(result).toContain("Investigation mode");
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("assemblePrompt with methodical modifier works from embedded map", () => {
    const result = assemblePrompt({
      mode: {
        base: "chill",
        axes: null,
        modifiers: ["modifiers/methodical.md"],
      },
      templateVars: TEST_VARS,
      promptsDir: "/nonexistent/path",
    });
    expect(result).toContain("Methodical mode");
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("chill base assemblePrompt works with non-existent promptsDir", () => {
    const result = assemblePrompt({
      mode: {
        base: "chill",
        axes: null,
        modifiers: [],
      },
      templateVars: TEST_VARS,
      promptsDir: "/nonexistent/path",
    });
    expect(result).toContain("Claude Code");
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});

describe("readFragment embedded prompts behavior", () => {
  test("returns embedded content for built-in fragment", () => {
    // Spec: readFragment checks embedded map first for relative paths
    const content = readFragment("/nonexistent/path", "base/intro.md");
    expect(content).not.toBeNull();
    expect(content).toContain("Claude Code");
  });

  test("returns null for unknown relative path not in embedded map or disk", () => {
    const content = readFragment("/nonexistent/path", "base/nonexistent.md");
    expect(content).toBeNull();
  });

  test("reads absolute path from disk, not embedded map", () => {
    // Spec: custom fragments (absolute paths) always read from disk
    const content = readFragment(PROMPTS_DIR, "/nonexistent/absolute/path.md");
    // Should be null since file doesn't exist on disk — NOT checking embedded
    expect(content).toBeNull();
  });
});

describe("writeTempPrompt", () => {
  test("writes file to temp directory", () => {
    const content = "test prompt content";
    const path = writeTempPrompt(content);
    expect(existsSync(path)).toBe(true);

    // Cleanup
    unlinkSync(path);
    rmdirSync(dirname(path));
  });

  test("file contains correct content", async () => {
    const content = "test prompt content";
    const path = writeTempPrompt(content);
    const read = await Bun.file(path).text();

    // Cleanup
    unlinkSync(path);
    rmdirSync(dirname(path));

    expect(read).toBe(content);
  });
});
