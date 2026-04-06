import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createCliRunner, makeTempDir } from "./test-helpers.js";
import { PRESET_NAMES } from "./types.js";

const { run, runExpectFail } = createCliRunner(
  join(import.meta.dir, "..", "claude-mode"),
);

describe("claude-mode e2e", () => {
  // Help and usage
  test("no args prints usage", () => {
    const output = run("");
    expect(output).toContain("Usage: claude-mode");
  });

  test("--help prints usage", () => {
    const output = run("--help");
    expect(output).toContain("Usage: claude-mode");
  });

  test("-h prints usage", () => {
    const output = run("-h");
    expect(output).toContain("Usage: claude-mode");
  });

  // --print mode for each preset
  test("create --print contains correct axis headers", () => {
    const output = run("create --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Architect");
    expect(output).toContain("# Scope: Unrestricted");
    expect(output).not.toContain("# Read-only mode");
  });

  test("extend --print contains correct axis headers", () => {
    const output = run("extend --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).toContain("# Scope: Adjacent");
  });

  test("safe --print contains correct axis headers", () => {
    const output = run("safe --print");
    expect(output).toContain("# Agency: Collaborative");
    expect(output).toContain("# Quality: Minimal");
    expect(output).toContain("# Scope: Narrow");
  });

  test("refactor --print contains correct axis headers", () => {
    const output = run("refactor --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).toContain("# Scope: Unrestricted");
  });

  test("explore --print contains readonly modifier", () => {
    const output = run("explore --print");
    expect(output).toContain("# Agency: Collaborative");
    expect(output).toContain("# Quality: Architect");
    expect(output).toContain("# Scope: Narrow");
    expect(output).toContain("# Read-only mode");
  });

  test("none --print has no axis headers", () => {
    const output = run("none --print");
    expect(output).not.toContain("# Agency:");
    expect(output).not.toContain("# Quality:");
    expect(output).not.toContain("# Scope:");
  });

  // Context pacing is opt-in
  test("context pacing excluded by default, included with flag", () => {
    const without = run("create --print");
    expect(without).not.toContain("# Context and pacing");

    const withPacing = run("create --context-pacing --print");
    expect(withPacing).toContain("# Context and pacing");
  });

  test("all presets include environment section", () => {
    for (const preset of PRESET_NAMES) {
      const output = run(`${preset} --print`);
      expect(output).toContain("# Environment");
      expect(output).toContain(process.cwd());
    }
  });

  // Axis override through bash script
  test("preset with axis override works", () => {
    const output = run("create --quality pragmatic --print");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).not.toContain("# Quality: Architect");
    expect(output).toContain("# Agency: Autonomous");
  });

  // --readonly modifier
  test("--readonly adds readonly content", () => {
    const output = run("create --readonly --print");
    expect(output).toContain("# Read-only mode");
  });

  // Error handling through bash script
  test("invalid agency error propagates", () => {
    const err = runExpectFail("--agency invalid");
    expect(err).toContain("Unknown --agency value");
  });

  test("--system-prompt error propagates", () => {
    const err = runExpectFail("create --system-prompt foo");
    expect(err).toContain("Cannot use --system-prompt");
  });

  // Normal mode (non-print) produces claude command
  test("normal mode outputs claude command", () => {
    const output = run("create");
    expect(output).toMatch(/^claude --system-prompt-file /);
  });

  // Passthrough args
  test("passthrough args via -- separator", () => {
    const output = run("create -- --verbose --model sonnet");
    expect(output).toContain("--verbose");
    expect(output).toContain("--model");
    expect(output).toContain("sonnet");
  });

  // No template variable leaks in any mode
  test("no unreplaced template variables in any preset", () => {
    for (const preset of PRESET_NAMES) {
      const output = run(`${preset} --print`);
      expect(output).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });
});

describe("custom prompts e2e", () => {
  let tempDir: string;
  let customModifierPath: string;
  let customQualityPath: string;

  beforeAll(() => {
    tempDir = makeTempDir("e2e-custom-prompts-");
    customModifierPath = join(tempDir, "my-rules.md");
    writeFileSync(customModifierPath, "# E2E Custom Modifier Test Content\nFollow these rules.", "utf8");
    customQualityPath = join(tempDir, "quality.md");
    writeFileSync(customQualityPath, "# Quality: E2E Custom Quality\nCustom quality standard.", "utf8");
  });

  afterAll(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  test("--modifier with file path includes content in --print output", () => {
    const output = run(`create --modifier ${customModifierPath} --print`);
    expect(output).toContain("# E2E Custom Modifier Test Content");
    expect(output).toContain("Follow these rules.");
  });

  test("--quality with file path includes content and replaces built-in quality", () => {
    const output = run(`create --quality ${customQualityPath} --print`);
    expect(output).toContain("E2E Custom Quality");
    expect(output).not.toContain("# Quality: Architect");
  });
});

describe("config-driven workflow e2e", () => {
  const SCRIPT = join(import.meta.dir, "build-prompt.ts");

  function runWithCwd(args: string, cwd: string): string {
    return execSync(`bun run ${SCRIPT} ${args}`, {
      encoding: "utf8",
      timeout: 15000,
      cwd,
    }).trim();
  }

  function runWithCwdExpectFail(args: string, cwd: string): string {
    try {
      execSync(`bun run ${SCRIPT} ${args}`, {
        encoding: "utf8",
        timeout: 15000,
        cwd,
      });
      throw new Error("Expected command to fail");
    } catch (err: any) {
      return (err.stderr || err.stdout || err.message || "").toString();
    }
  }

  test("custom preset from config produces correct output", () => {
    const tempDir = makeTempDir("e2e-custom-preset-");
    try {
      writeFileSync(join(tempDir, "team-rules.md"), "# Team Rules\nAlways write tests.", "utf8");
      writeFileSync(join(tempDir, ".claude-mode.json"), JSON.stringify({
        modifiers: { "team-rules": "./team-rules.md" },
        presets: {
          team: {
            agency: "collaborative",
            quality: "architect",
            scope: "adjacent",
            modifiers: ["team-rules"],
          },
        },
      }), "utf8");
      const output = runWithCwd("team --print", tempDir);
      expect(output).toContain("# Team Rules");
      expect(output).toContain("Always write tests.");
      expect(output).toContain("# Agency: Collaborative");
      expect(output).toContain("# Quality: Architect");
      expect(output).toContain("# Scope: Adjacent");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("defaultModifiers included in output without --modifier flag", () => {
    const tempDir = makeTempDir("e2e-default-modifiers-");
    try {
      writeFileSync(join(tempDir, "default-rule.md"), "# Default Rule\nThis is always on.", "utf8");
      writeFileSync(join(tempDir, ".claude-mode.json"), JSON.stringify({
        defaultModifiers: ["default-rule"],
        modifiers: { "default-rule": "./default-rule.md" },
      }), "utf8");
      const output = runWithCwd("create --print", tempDir);
      expect(output).toContain("# Default Rule");
      expect(output).toContain("This is always on.");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("custom preset with custom axis value", () => {
    const tempDir = makeTempDir("e2e-custom-axis-");
    try {
      writeFileSync(join(tempDir, "team-quality.md"), "# Quality: Team Standard\nOur quality rules.", "utf8");
      writeFileSync(join(tempDir, ".claude-mode.json"), JSON.stringify({
        axes: { quality: { "team-standard": "./team-quality.md" } },
        presets: {
          team: {
            agency: "autonomous",
            quality: "team-standard",
            scope: "unrestricted",
          },
        },
      }), "utf8");
      const output = runWithCwd("team --print", tempDir);
      expect(output).toContain("Team Standard");
      expect(output).toContain("Our quality rules.");
      expect(output).not.toContain("# Quality: Architect");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("multiple --modifier flags compose in order", () => {
    const tempDir = makeTempDir("e2e-multi-modifier-");
    try {
      const firstPath = join(tempDir, "first.md");
      const secondPath = join(tempDir, "second.md");
      writeFileSync(firstPath, "# First Modifier\nFirst content.", "utf8");
      writeFileSync(secondPath, "# Second Modifier\nSecond content.", "utf8");
      const output = run(`create --modifier ${firstPath} --modifier ${secondPath} --print`);
      expect(output).toContain("First content.");
      expect(output).toContain("Second content.");
      expect(output.indexOf("First content.")).toBeLessThan(output.indexOf("Second content."));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("--modifier resolves config-defined name", () => {
    const tempDir = makeTempDir("e2e-modifier-name-");
    try {
      writeFileSync(join(tempDir, "focus.md"), "# Focus Rules\nStay focused.", "utf8");
      writeFileSync(join(tempDir, ".claude-mode.json"), JSON.stringify({
        modifiers: { "focus-rules": "./focus.md" },
      }), "utf8");
      const output = runWithCwd("create --modifier focus-rules --print", tempDir);
      expect(output).toContain("# Focus Rules");
      expect(output).toContain("Stay focused.");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("--append-system-prompt appears in claude command", () => {
    const output = run("create --append-system-prompt 'Use TypeScript only'");
    expect(output).toContain("--append-system-prompt");
    expect(output).toContain("Use TypeScript only");
  });

  test("multi-step config then run", () => {
    const tempDir = makeTempDir("e2e-multistep-");
    try {
      const rulesPath = join(tempDir, "rules.md");
      writeFileSync(rulesPath, "# Team Rules E2E\nMulti-step test.", "utf8");
      runWithCwd("config init", tempDir);
      runWithCwd(`config add-modifier team-rules ${rulesPath}`, tempDir);
      runWithCwd("config add-default team-rules", tempDir);
      runWithCwd("config add-preset team --agency collaborative --quality architect", tempDir);
      const output = runWithCwd("team --print", tempDir);
      expect(output).toContain("# Team Rules E2E");
      expect(output).toContain("# Agency: Collaborative");
      expect(output).toContain("# Quality: Architect");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("failure mode e2e", () => {
  const SCRIPT = join(import.meta.dir, "build-prompt.ts");

  function runWithCwdExpectFail(args: string, cwd: string): string {
    try {
      execSync(`bun run ${SCRIPT} ${args}`, {
        encoding: "utf8",
        timeout: 15000,
        cwd,
      });
      throw new Error("Expected command to fail");
    } catch (err: any) {
      return (err.stderr || err.stdout || err.message || "").toString();
    }
  }

  test("unknown preset name produces helpful error", () => {
    const err = runExpectFail("typo-preset");
    expect(err).toContain("Unknown preset");
  });

  test("--modifier with nonexistent file produces error", () => {
    const err = runExpectFail("create --modifier /nonexistent/rules.md --print");
    expect(err.length).toBeGreaterThan(0);
  });

  test("invalid JSON config produces error", () => {
    const tempDir = makeTempDir("e2e-invalid-json-");
    try {
      writeFileSync(join(tempDir, ".claude-mode.json"), "{ bad json", "utf8");
      const err = runWithCwdExpectFail("create --print", tempDir);
      expect(err).toContain("Invalid config file");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config referencing nonexistent modifier in defaultModifiers", () => {
    const tempDir = makeTempDir("e2e-missing-mod-");
    try {
      writeFileSync(join(tempDir, ".claude-mode.json"), JSON.stringify({
        defaultModifiers: ["nonexistent-mod"],
      }), "utf8");
      const err = runWithCwdExpectFail("create --print", tempDir);
      expect(err).toContain("Unknown modifier");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("claude-mode config e2e", () => {
  const CLI = join(import.meta.dir, "..", "node_modules", ".bin", "bun");
  const SCRIPT = join(import.meta.dir, "build-prompt.ts");

  function runConfig(args: string, cwd: string): string {
    return execSync(`bun run ${SCRIPT} config ${args}`, {
      encoding: "utf8",
      timeout: 15000,
      cwd,
    }).trim();
  }

  function runConfigExpectFail(args: string, cwd: string): string {
    try {
      execSync(`bun run ${SCRIPT} config ${args}`, {
        encoding: "utf8",
        timeout: 15000,
        cwd,
      });
      throw new Error("Expected command to fail");
    } catch (err: any) {
      return (err.stderr || err.stdout || err.message || "").toString();
    }
  }

  test("config show returns 'No config file found.' when no config", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      const output = runConfig("show", tempDir);
      expect(output).toContain("No config file found.");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config init creates scaffold", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      runConfig("init", tempDir);
      expect(existsSync(join(tempDir, ".claude-mode.json"))).toBe(true);
      const output = runConfig("show", tempDir);
      expect(output).toContain('"defaultModifiers"');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config init errors if file already exists", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      runConfig("init", tempDir);
      const err = runConfigExpectFail("init", tempDir);
      expect(err).toContain("already exists");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-default / remove-default round-trip", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      runConfig("add-default context-pacing", tempDir);
      const afterAdd = runConfig("show", tempDir);
      expect(afterAdd).toContain("context-pacing");

      runConfig("remove-default context-pacing", tempDir);
      const afterRemove = runConfig("show", tempDir);
      // Value removed — defaultModifiers should be empty array
      const parsed = JSON.parse(afterRemove);
      expect(parsed.defaultModifiers).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-modifier / remove-modifier round-trip", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      runConfig("add-modifier rust-style ./prompts/rust.md", tempDir);
      const afterAdd = runConfig("show", tempDir);
      expect(afterAdd).toContain("rust-style");

      runConfig("remove-modifier rust-style", tempDir);
      const afterRemove = runConfig("show", tempDir);
      expect(afterRemove).not.toContain("rust-style");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-modifier rejects built-in name", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      const err = runConfigExpectFail("add-modifier readonly ./path.md", tempDir);
      expect(err).toContain("built-in modifier name");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-axis / remove-axis round-trip", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      runConfig("add-axis quality team-standard ./team.md", tempDir);
      const afterAdd = runConfig("show", tempDir);
      expect(afterAdd).toContain("team-standard");

      runConfig("remove-axis quality team-standard", tempDir);
      const afterRemove = runConfig("show", tempDir);
      expect(afterRemove).not.toContain("team-standard");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-axis rejects built-in value", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      const err = runConfigExpectFail("add-axis agency autonomous ./path.md", tempDir);
      expect(err).toContain("built-in agency value");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-preset / remove-preset round-trip", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      runConfig("add-preset team --agency collaborative --quality pragmatic", tempDir);
      const afterAdd = runConfig("show", tempDir);
      expect(afterAdd).toContain("team");
      expect(afterAdd).toContain("collaborative");

      runConfig("remove-preset team", tempDir);
      const afterRemove = runConfig("show", tempDir);
      const parsed = JSON.parse(afterRemove);
      expect(parsed.presets?.team).toBeUndefined();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-preset rejects built-in preset name", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      const err = runConfigExpectFail("add-preset create", tempDir);
      expect(err).toContain("built-in preset name");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config unknown subcommand exits with error", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-config-test-"));
    try {
      const err = runConfigExpectFail("unknown-sub", tempDir);
      expect(err).toContain("Unknown config subcommand");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
