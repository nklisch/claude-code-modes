import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import {
  readFragment,
  substituteTemplateVars,
  getFragmentOrder,
  assemblePrompt,
  writeTempPrompt,
} from "./assemble.js";
import { existsSync, unlinkSync, rmdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ModeConfig, TemplateVars } from "./types.js";

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
    axes: null,
    modifiers: { readonly: false, contextPacing: false, custom: [] },
  };

  const autonomousMode: ModeConfig = {
    axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
    modifiers: { readonly: false, contextPacing: false, custom: [] },
  };

  const collaborativeMode: ModeConfig = {
    axes: { agency: "collaborative", quality: "pragmatic", scope: "adjacent" },
    modifiers: { readonly: false, contextPacing: false, custom: [] },
  };

  test("none mode has no axis fragments", () => {
    const order = getFragmentOrder(noneMode);
    expect(order.some((p) => p.startsWith("axis/"))).toBe(false);
  });

  test("none mode includes all base fragments", () => {
    const order = getFragmentOrder(noneMode);
    expect(order).toContain("base/intro.md");
    expect(order).toContain("base/system.md");
    expect(order).toContain("base/doing-tasks.md");
    expect(order).toContain("base/tools.md");
    expect(order).toContain("base/tone.md");
    expect(order).toContain("base/session-guidance.md");
    expect(order).toContain("base/env.md");
  });

  test("none mode uses cautious actions", () => {
    const order = getFragmentOrder(noneMode);
    expect(order).toContain("base/actions-cautious.md");
    expect(order).not.toContain("base/actions-autonomous.md");
  });

  test("autonomous mode uses autonomous actions", () => {
    const order = getFragmentOrder(autonomousMode);
    expect(order).toContain("base/actions-autonomous.md");
    expect(order).not.toContain("base/actions-cautious.md");
  });

  test("collaborative mode uses cautious actions", () => {
    const order = getFragmentOrder(collaborativeMode);
    expect(order).toContain("base/actions-cautious.md");
  });

  test("includes axis fragments when axes are set", () => {
    const order = getFragmentOrder(autonomousMode);
    expect(order).toContain("axis/agency/autonomous.md");
    expect(order).toContain("axis/quality/architect.md");
    expect(order).toContain("axis/scope/unrestricted.md");
  });

  test("excludes context-pacing by default", () => {
    expect(getFragmentOrder(noneMode)).not.toContain("modifiers/context-pacing.md");
    expect(getFragmentOrder(autonomousMode)).not.toContain("modifiers/context-pacing.md");
  });

  test("includes context-pacing when enabled", () => {
    const withContextPacing: ModeConfig = { axes: null, modifiers: { readonly: false, contextPacing: true, custom: [] } };
    expect(getFragmentOrder(withContextPacing)).toContain("modifiers/context-pacing.md");
  });

  test("includes readonly only when flagged", () => {
    const readonlyMode: ModeConfig = { axes: null, modifiers: { readonly: true, contextPacing: false, custom: [] } };
    expect(getFragmentOrder(readonlyMode)).toContain("modifiers/readonly.md");
    expect(getFragmentOrder(noneMode)).not.toContain("modifiers/readonly.md");
  });

  test("env.md is always last", () => {
    const order = getFragmentOrder(noneMode);
    expect(order[order.length - 1]).toBe("base/env.md");
  });
});

describe("assemblePrompt", () => {
  test("assembles none mode without errors", () => {
    const result = assemblePrompt({
      mode: { axes: null, modifiers: { readonly: false, contextPacing: false, custom: [] } },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result.length).toBeGreaterThan(0);
  });

  test("assembled prompt has no unreplaced template variables", () => {
    const result = assemblePrompt({
      mode: { axes: null, modifiers: { readonly: false, contextPacing: false, custom: [] } },
      templateVars: TEST_VARS,
      promptsDir: PROMPTS_DIR,
    });
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("assembled prompt contains key sections", () => {
    const result = assemblePrompt({
      mode: { axes: null, modifiers: { readonly: false, contextPacing: false, custom: [] } },
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
        axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
        modifiers: { readonly: false, contextPacing: false, custom: [] },
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
