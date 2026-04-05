import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createCliRunner } from "./test-helpers.js";
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
