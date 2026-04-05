import { describe, test, expect } from "bun:test";
import { join } from "node:path";
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
