import { describe, test, expect } from "bun:test";
import { createCliRunner } from "./test-helpers.js";
import { join } from "node:path";
import { PRESET_NAMES } from "./types.js";

const { run, runExpectFail } = createCliRunner(
  `bun run ${join(import.meta.dir, "cli.ts")}`,
  10000,
);

describe("cli.ts --help", () => {
  test("prints usage", () => {
    const output = run("--help");
    expect(output).toContain("Usage: claude-mode");
    expect(output).toContain("Presets:");
    expect(output).toContain("create");
    expect(output).toContain("explore");
  });

  test("-h prints usage", () => {
    const output = run("-h");
    expect(output).toContain("Usage: claude-mode");
  });

  test("no args prints usage", () => {
    const output = run("");
    expect(output).toContain("Usage: claude-mode");
  });
});

describe("cli.ts --print for all presets", () => {
  // Spec: all presets produce valid prompts via --print
  for (const preset of PRESET_NAMES) {
    test(`${preset} --print produces valid prompt with no unreplaced vars`, () => {
      const output = run(`${preset} --print`);
      expect(output.length).toBeGreaterThan(0);
      expect(output).toContain("Claude Code");
      expect(output).not.toMatch(/\{\{[A-Z_]+\}\}/);
    });
  }

  test("create --print contains correct axis headers", () => {
    const output = run("create --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Architect");
    expect(output).toContain("# Scope: Unrestricted");
  });

  test("none --print has no axis headers", () => {
    const output = run("none --print");
    expect(output).not.toContain("# Agency:");
    expect(output).not.toContain("# Quality:");
    expect(output).not.toContain("# Scope:");
  });
});

describe("cli.ts subcommands", () => {
  test("config show runs without error", () => {
    expect(() => run("config show")).not.toThrow();
  });

  test("inspect runs without error", () => {
    const output = run("inspect");
    expect(output).toContain("Fragment");
  });
});

describe("cli.ts error cases", () => {
  test("--system-prompt is rejected", () => {
    const output = runExpectFail("--system-prompt 'something'");
    expect(output).toContain("Cannot use --system-prompt");
  });

  test("--system-prompt-file is rejected", () => {
    const output = runExpectFail("--system-prompt-file /tmp/foo.md");
    expect(output).toContain("Cannot use --system-prompt");
  });

  test("invalid axis value produces descriptive error", () => {
    const output = runExpectFail("--agency invalid-value");
    expect(output).toContain("Unknown --agency value");
  });

  test("unknown preset name produces descriptive error", () => {
    const output = runExpectFail("nonexistent-preset");
    expect(output).toContain("Unknown preset");
  });
});
