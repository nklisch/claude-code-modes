import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createCliRunner } from "./test-helpers.js";

const { run, runExpectFail } = createCliRunner(
  `bun run ${join(import.meta.dir, "build-prompt.ts")}`,
  10000,
);

describe("build-prompt CLI", () => {
  test("no args prints usage", () => {
    const output = run("");
    expect(output).toContain("Usage: claude-mode");
  });

  test("--help prints usage", () => {
    const output = run("--help");
    expect(output).toContain("Usage: claude-mode");
  });

  test("create outputs claude command with --system-prompt-file", () => {
    const output = run("create");
    expect(output).toMatch(/^claude --system-prompt-file /);
    // Extract temp file path and verify it exists
    const match = output.match(/--system-prompt-file ([^\s']+|'[^']+')/);
    expect(match).not.toBeNull();
    const tempFile = match![1].replace(/'/g, "");
    expect(existsSync(tempFile)).toBe(true);
  });

  test("--print outputs prompt content", () => {
    const output = run("create --print");
    expect(output).toContain("Claude Code");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Architect");
    expect(output).not.toMatch(/^claude /);
  });

  test("passthrough args appear in output", () => {
    const output = run("create -- --verbose --model sonnet");
    expect(output).toContain("--verbose");
    expect(output).toContain("--model");
    expect(output).toContain("sonnet");
  });

  test("--append-system-prompt forwarded", () => {
    const output = run("create --append-system-prompt 'extra rules'");
    expect(output).toContain("--append-system-prompt");
  });

  test("--system-prompt rejected", () => {
    const errOutput = runExpectFail("create --system-prompt foo");
    expect(errOutput).toContain("Cannot use --system-prompt");
  });

  test("invalid agency rejected", () => {
    const errOutput = runExpectFail("--agency invalid");
    expect(errOutput).toContain("Invalid --agency");
  });

  test("all presets produce valid commands", () => {
    for (const preset of ["create", "extend", "safe", "refactor", "explore", "none"]) {
      const output = run(preset);
      expect(output).toMatch(/^claude --system-prompt-file /);
    }
  });
});
