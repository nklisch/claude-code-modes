import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createCliRunner, makeTempDir } from "./test-helpers.js";
import { join } from "node:path";
import { writeFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { PRESET_NAMES } from "./types.js";

const CLI = `bun run ${join(import.meta.dir, "cli.ts")}`;

const { run, runExpectFail } = createCliRunner(CLI, 10000);

function runWithCwd(args: string, cwd: string): string {
  return execSync(`${CLI} ${args}`, {
    encoding: "utf8",
    timeout: 10000,
    cwd,
  }).trim();
}

function runWithCwdExpectFail(args: string, cwd: string): string {
  try {
    execSync(`${CLI} ${args}`, { encoding: "utf8", timeout: 10000, cwd });
    throw new Error("Expected command to fail");
  } catch (err: any) {
    return (err.stderr || err.message || "").toString();
  }
}

// ─── Help and Usage ──────────────────────────────────────────────────────────

describe("cli.ts help and usage", () => {
  test("--help prints usage with all sections", () => {
    const output = run("--help");
    expect(output).toContain("Usage: claude-mode");
    expect(output).toContain("Presets:");
    expect(output).toContain("Axis overrides:");
    expect(output).toContain("Modifiers:");
    expect(output).toContain("Forwarded to claude:");
    expect(output).toContain("Examples:");
  });

  test("--help shows debug and methodical presets", () => {
    const output = run("--help");
    expect(output).toContain("debug");
    expect(output).toContain("methodical");
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

// ─── Version ─────────────────────────────────────────────────────────────────

describe("cli.ts --version", () => {
  test("--version prints claude-mode version and exits 0", () => {
    const output = run("--version");
    expect(output).toMatch(/^claude-mode \d+\.\d+\.\d+/);
    // Must not look like Claude Code's own version line
    expect(output).not.toContain("Claude Code");
  });

  test("--version matches package.json version", async () => {
    const pkg = await import("../package.json", { with: { type: "json" } });
    const output = run("--version");
    expect(output).toBe(`claude-mode ${pkg.default.version}`);
  });

  test("--version combined with a preset errors out", () => {
    const err = runExpectFail("create --version");
    expect(err).toContain("--version cannot be combined with other arguments");
  });

  test("--version before a preset errors out", () => {
    const err = runExpectFail("--version create");
    expect(err).toContain("--version cannot be combined with other arguments");
  });

  test("--version with trailing passthrough errors out", () => {
    const err = runExpectFail("--version -- --help");
    expect(err).toContain("--version cannot be combined with other arguments");
  });

  test("--version with config subcommand errors out (not forwarded)", () => {
    const err = runExpectFail("config --version");
    expect(err).toContain("--version cannot be combined with other arguments");
  });

  test("passthrough --version after -- is preserved for claude", () => {
    // `claude-mode create -- --version` should not trigger the version
    // intercept. We confirm by inspecting the assembled prompt path: with
    // --print this would just print the prompt; instead we use the
    // build-prompt entry point which emits the command string to stdout.
    const buildPrompt = `bun run ${join(import.meta.dir, "build-prompt.ts")}`;
    const cmd = execSync(`${buildPrompt} create -- --version`, {
      encoding: "utf8",
      timeout: 10000,
      cwd: join(import.meta.dir, ".."),
    }).trim();
    expect(cmd).toStartWith("claude ");
    expect(cmd).toContain("--version");
  });
});

// ─── Preset Prompt Assembly ──────────────────────────────────────────────────

describe("cli.ts preset --print", () => {
  for (const preset of PRESET_NAMES) {
    test(`${preset} --print produces valid prompt (no unreplaced vars)`, () => {
      const output = run(`${preset} --print`);
      expect(output.length).toBeGreaterThan(0);
      expect(output).toContain("Claude Code");
      expect(output).not.toMatch(/\{\{[A-Z_]+\}\}/);
    });
  }

  test("create: autonomous / architect / unrestricted", () => {
    const output = run("create --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Architect");
    expect(output).toContain("# Scope: Unrestricted");
    expect(output).not.toContain("# Read-only mode");
  });

  test("extend: autonomous / pragmatic / adjacent", () => {
    const output = run("extend --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).toContain("# Scope: Adjacent");
  });

  test("safe: collaborative / minimal / narrow", () => {
    const output = run("safe --print");
    expect(output).toContain("# Agency: Collaborative");
    expect(output).toContain("# Quality: Minimal");
    expect(output).toContain("# Scope: Narrow");
  });

  test("refactor: autonomous / pragmatic / unrestricted", () => {
    const output = run("refactor --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).toContain("# Scope: Unrestricted");
  });

  test("explore: collaborative / architect / narrow + readonly", () => {
    const output = run("explore --print");
    expect(output).toContain("# Agency: Collaborative");
    expect(output).toContain("# Quality: Architect");
    expect(output).toContain("# Scope: Narrow");
    expect(output).toContain("# Read-only mode");
  });

  test("none: no axis headers", () => {
    const output = run("none --print");
    expect(output).not.toContain("# Agency:");
    expect(output).not.toContain("# Quality:");
    expect(output).not.toContain("# Scope:");
  });

  test("debug: collaborative / pragmatic / narrow + investigation mode", () => {
    const output = run("debug --print");
    expect(output).toContain("# Agency: Collaborative");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).toContain("# Scope: Narrow");
    expect(output).toContain("Investigation mode");
  });

  test("methodical: surgical / architect / narrow + methodical mode", () => {
    const output = run("methodical --print");
    expect(output).toContain("# Agency: Surgical");
    expect(output).toContain("# Quality: Architect");
    expect(output).toContain("# Scope: Narrow");
    expect(output).toContain("Methodical mode");
  });

  test("all presets include environment section with CWD", () => {
    for (const preset of PRESET_NAMES) {
      const output = run(`${preset} --print`);
      expect(output).toContain("# Environment");
    }
  });
});

// ─── Axis Overrides ──────────────────────────────────────────────────────────

describe("cli.ts axis overrides", () => {
  test("preset with single axis override", () => {
    const output = run("create --quality pragmatic --print");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).not.toContain("# Quality: Architect");
    expect(output).toContain("# Agency: Autonomous"); // unchanged
  });

  test("preset with multiple axis overrides", () => {
    const output = run("create --quality minimal --scope narrow --print");
    expect(output).toContain("# Quality: Minimal");
    expect(output).toContain("# Scope: Narrow");
    expect(output).toContain("# Agency: Autonomous"); // unchanged
  });

  test("standalone axes without preset uses defaults for unspecified", () => {
    // Spec: defaults are collaborative/pragmatic/adjacent
    const output = run("--agency autonomous --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Pragmatic"); // default
    expect(output).toContain("# Scope: Adjacent"); // default
  });

  test("all three axes without preset", () => {
    const output = run("--agency surgical --quality minimal --scope narrow --print");
    expect(output).toContain("# Agency: Surgical");
    expect(output).toContain("# Quality: Minimal");
    expect(output).toContain("# Scope: Narrow");
  });

  test("axis override with file path", () => {
    const tempDir = makeTempDir("cli-axis-path-");
    try {
      const qualityPath = join(tempDir, "team-quality.md");
      writeFileSync(qualityPath, "# Quality: Team Custom\nTeam quality content.", "utf8");
      const output = run(`create --quality ${qualityPath} --print`);
      expect(output).toContain("Team Custom");
      expect(output).not.toContain("# Quality: Architect");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── Modifiers ───────────────────────────────────────────────────────────────

describe("cli.ts modifiers", () => {
  test("--readonly adds readonly content", () => {
    const output = run("create --readonly --print");
    expect(output).toContain("# Read-only mode");
  });

  test("--context-pacing adds pacing content", () => {
    const output = run("create --context-pacing --print");
    expect(output).toContain("# Context and pacing");
  });

  test("context pacing excluded by default", () => {
    const output = run("create --print");
    expect(output).not.toContain("# Context and pacing");
  });

  test("--readonly and --context-pacing together", () => {
    const output = run("create --readonly --context-pacing --print");
    expect(output).toContain("# Read-only mode");
    expect(output).toContain("# Context and pacing");
  });

  test("--modifier with file path", () => {
    const tempDir = makeTempDir("cli-modifier-");
    try {
      const modPath = join(tempDir, "rules.md");
      writeFileSync(modPath, "# Custom Rules\nDo this.", "utf8");
      const output = run(`create --modifier ${modPath} --print`);
      expect(output).toContain("# Custom Rules");
      expect(output).toContain("Do this.");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("multiple --modifier flags compose in order", () => {
    const tempDir = makeTempDir("cli-multi-mod-");
    try {
      const first = join(tempDir, "first.md");
      const second = join(tempDir, "second.md");
      writeFileSync(first, "# First Rule\nFirst content.", "utf8");
      writeFileSync(second, "# Second Rule\nSecond content.", "utf8");
      const output = run(`create --modifier ${first} --modifier ${second} --print`);
      expect(output).toContain("First content.");
      expect(output).toContain("Second content.");
      expect(output.indexOf("First content.")).toBeLessThan(output.indexOf("Second content."));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── None Mode Edge Cases ────────────────────────────────────────────────────

describe("cli.ts none mode", () => {
  test("none with --readonly includes readonly", () => {
    const output = run("none --readonly --print");
    expect(output).toContain("# Read-only mode");
    expect(output).not.toContain("# Agency:");
  });

  test("none with --context-pacing includes pacing", () => {
    const output = run("none --context-pacing --print");
    expect(output).toContain("# Context and pacing");
  });

  test("none with custom modifier includes modifier content", () => {
    const tempDir = makeTempDir("cli-none-mod-");
    try {
      const modPath = join(tempDir, "team.md");
      writeFileSync(modPath, "# Team Directive\nTeam content here.", "utf8");
      const output = run(`none --modifier ${modPath} --print`);
      expect(output).toContain("# Team Directive");
      expect(output).not.toContain("# Agency:");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("none still includes base infrastructure sections", () => {
    const output = run("none --print");
    expect(output).toContain("Claude Code");
    expect(output).toContain("# System");
    expect(output).toContain("# Doing tasks");
    expect(output).toContain("# Using your tools");
    expect(output).toContain("# Tone and style");
    expect(output).toContain("# Environment");
  });
});

// ─── Subcommands ─────────────────────────────────────────────────────────────

describe("cli.ts subcommands", () => {
  test("config show runs without error", () => {
    expect(() => run("config show")).not.toThrow();
  });

  test("inspect runs and shows fragment list", () => {
    const output = run("inspect");
    expect(output).toContain("Fragment");
  });

  test("inspect with preset shows preset fragments", () => {
    const output = run("inspect create");
    expect(output).toContain("agency");
  });
});

// ─── Error Cases: Blocked Flags ──────────────────────────────────────────────

describe("cli.ts blocked flags", () => {
  test("--system-prompt rejected with descriptive error", () => {
    const output = runExpectFail("--system-prompt 'something'");
    expect(output).toContain("Cannot use --system-prompt");
    expect(output).toContain("--append-system-prompt");
  });

  test("--system-prompt-file rejected with descriptive error", () => {
    const output = runExpectFail("--system-prompt-file /tmp/foo.md");
    expect(output).toContain("Cannot use --system-prompt");
    expect(output).toContain("--append-system-prompt");
  });

  test("--system-prompt on a valid preset still rejected", () => {
    const output = runExpectFail("create --system-prompt 'test'");
    expect(output).toContain("Cannot use --system-prompt");
  });
});

// ─── Error Cases: Invalid Axis Values ────────────────────────────────────────

describe("cli.ts invalid axis values", () => {
  test("invalid --agency value", () => {
    const output = runExpectFail("--agency invalid-value --print");
    expect(output).toContain('Unknown --agency value: "invalid-value"');
    expect(output).toContain("autonomous, collaborative, surgical");
  });

  test("invalid --quality value", () => {
    const output = runExpectFail("--quality nonexistent --print");
    expect(output).toContain('Unknown --quality value: "nonexistent"');
    expect(output).toContain("architect, pragmatic, minimal");
  });

  test("invalid --scope value", () => {
    const output = runExpectFail("--scope wrong --print");
    expect(output).toContain('Unknown --scope value: "wrong"');
    expect(output).toContain("unrestricted, adjacent, narrow");
  });

  test("invalid axis on preset override", () => {
    const output = runExpectFail("create --agency bogus --print");
    expect(output).toContain('Unknown --agency value: "bogus"');
  });
});

// ─── Error Cases: Invalid Presets ────────────────────────────────────────────

describe("cli.ts invalid presets", () => {
  test("unknown preset name lists built-in presets", () => {
    const output = runExpectFail("nonexistent-preset --print");
    expect(output).toContain('Unknown preset: "nonexistent-preset"');
    expect(output).toContain("create, extend, safe, refactor, explore, none, debug, methodical");
  });

  test("typo in preset name shows helpful error", () => {
    const output = runExpectFail("craete --print");
    expect(output).toContain('Unknown preset: "craete"');
  });
});

// ─── Error Cases: Invalid Modifiers ──────────────────────────────────────────

describe("cli.ts invalid modifiers", () => {
  test("--modifier with nonexistent name (no config)", () => {
    const output = runExpectFail("create --modifier unknown-mod --print");
    expect(output).toContain('Unknown modifier: "unknown-mod"');
    expect(output).toContain("readonly, context-pacing");
  });

  test("--modifier with nonexistent file path", () => {
    const output = runExpectFail("create --modifier /nonexistent/rules.md --print");
    expect(output).toContain("Missing prompt fragment");
  });
});

// ─── Error Cases: Invalid Config ─────────────────────────────────────────────

describe("cli.ts config errors", () => {
  test("invalid JSON config file", () => {
    const tempDir = makeTempDir("cli-bad-json-");
    try {
      writeFileSync(join(tempDir, ".claude-mode.json"), "{ bad json", "utf8");
      const err = runWithCwdExpectFail("create --print", tempDir);
      expect(err).toContain("Invalid config file");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config referencing nonexistent defaultModifier", () => {
    const tempDir = makeTempDir("cli-bad-default-");
    try {
      writeFileSync(
        join(tempDir, ".claude-mode.json"),
        JSON.stringify({ defaultModifiers: ["nonexistent"] }),
        "utf8",
      );
      const err = runWithCwdExpectFail("create --print", tempDir);
      expect(err).toContain("Unknown modifier");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config preset referencing unknown axis value", () => {
    const tempDir = makeTempDir("cli-bad-preset-axis-");
    try {
      writeFileSync(
        join(tempDir, ".claude-mode.json"),
        JSON.stringify({
          presets: { broken: { agency: "nonexistent-value" } },
        }),
        "utf8",
      );
      const err = runWithCwdExpectFail("broken --print", tempDir);
      expect(err).toContain("Unknown --agency value");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── Config-Driven Workflows ─────────────────────────────────────────────────

describe("cli.ts config-driven workflows", () => {
  test("custom preset from config", () => {
    const tempDir = makeTempDir("cli-custom-preset-");
    try {
      writeFileSync(join(tempDir, "rules.md"), "# Team Rules\nAlways test.", "utf8");
      writeFileSync(
        join(tempDir, ".claude-mode.json"),
        JSON.stringify({
          modifiers: { "team-rules": "./rules.md" },
          presets: {
            team: {
              agency: "collaborative",
              quality: "architect",
              scope: "adjacent",
              modifiers: ["team-rules"],
            },
          },
        }),
        "utf8",
      );
      const output = runWithCwd("team --print", tempDir);
      expect(output).toContain("# Team Rules");
      expect(output).toContain("# Agency: Collaborative");
      expect(output).toContain("# Quality: Architect");
      expect(output).toContain("# Scope: Adjacent");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("defaultModifiers applied without --modifier flag", () => {
    const tempDir = makeTempDir("cli-defaults-");
    try {
      writeFileSync(join(tempDir, "default.md"), "# Default Rule\nAlways on.", "utf8");
      writeFileSync(
        join(tempDir, ".claude-mode.json"),
        JSON.stringify({
          defaultModifiers: ["default-rule"],
          modifiers: { "default-rule": "./default.md" },
        }),
        "utf8",
      );
      const output = runWithCwd("create --print", tempDir);
      expect(output).toContain("# Default Rule");
      expect(output).toContain("Always on.");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("custom axis value from config", () => {
    const tempDir = makeTempDir("cli-custom-axis-");
    try {
      writeFileSync(join(tempDir, "team-q.md"), "# Quality: Team\nTeam quality.", "utf8");
      writeFileSync(
        join(tempDir, ".claude-mode.json"),
        JSON.stringify({
          axes: { quality: { "team-standard": "./team-q.md" } },
        }),
        "utf8",
      );
      const output = runWithCwd("create --quality team-standard --print", tempDir);
      expect(output).toContain("# Quality: Team");
      expect(output).not.toContain("# Quality: Architect");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("--modifier resolves config-defined name", () => {
    const tempDir = makeTempDir("cli-mod-name-");
    try {
      writeFileSync(join(tempDir, "focus.md"), "# Focus\nStay focused.", "utf8");
      writeFileSync(
        join(tempDir, ".claude-mode.json"),
        JSON.stringify({ modifiers: { focus: "./focus.md" } }),
        "utf8",
      );
      const output = runWithCwd("create --modifier focus --print", tempDir);
      expect(output).toContain("# Focus");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("custom preset with axis override from CLI", () => {
    const tempDir = makeTempDir("cli-preset-override-");
    try {
      writeFileSync(
        join(tempDir, ".claude-mode.json"),
        JSON.stringify({
          presets: {
            team: { agency: "collaborative", quality: "architect", scope: "adjacent" },
          },
        }),
        "utf8",
      );
      const output = runWithCwd("team --quality minimal --print", tempDir);
      expect(output).toContain("# Quality: Minimal");
      expect(output).toContain("# Agency: Collaborative"); // from preset
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── Base Flag ───────────────────────────────────────────────────────────────

describe("cli.ts --base flag", () => {
  test("--help shows --base flag", () => {
    const output = run("--help");
    expect(output).toContain("--base");
    expect(output).toContain("standard, chill");
  });

  test("--base chill produces valid prompt output", () => {
    const output = run("create --base chill --print");
    expect(output).toContain("Claude Code");
    expect(output).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("--base chill with explore preset includes readonly", () => {
    const output = run("explore --base chill --print");
    expect(output).toContain("# Read-only mode");
  });

  test("--base chill with none has no axis headers", () => {
    const output = run("none --base chill --print");
    expect(output).not.toContain("# Agency:");
    expect(output).not.toContain("# Quality:");
    expect(output).not.toContain("# Scope:");
  });

  test("--base invalid produces error", () => {
    const output = runExpectFail("create --base nonexistent-base --print");
    expect(output).toContain("Unknown --base value");
  });
});

// ─── Config CLI Subcommand ───────────────────────────────────────────────────

describe("cli.ts config subcommand", () => {
  test("config init creates scaffold", () => {
    const tempDir = makeTempDir("cli-config-init-");
    try {
      runWithCwd("config init", tempDir);
      const output = runWithCwd("config show", tempDir);
      expect(output).toContain('"defaultModifiers"');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config init errors if file already exists", () => {
    const tempDir = makeTempDir("cli-config-dup-");
    try {
      runWithCwd("config init", tempDir);
      const err = runWithCwdExpectFail("config init", tempDir);
      expect(err).toContain("already exists");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-modifier rejects built-in name", () => {
    const tempDir = makeTempDir("cli-config-builtin-");
    try {
      const err = runWithCwdExpectFail("config add-modifier readonly ./path.md", tempDir);
      expect(err).toContain("built-in modifier name");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-axis rejects built-in value", () => {
    const tempDir = makeTempDir("cli-config-axis-builtin-");
    try {
      const err = runWithCwdExpectFail("config add-axis agency autonomous ./path.md", tempDir);
      expect(err).toContain("built-in agency value");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config add-preset rejects built-in preset name", () => {
    const tempDir = makeTempDir("cli-config-preset-builtin-");
    try {
      const err = runWithCwdExpectFail("config add-preset create", tempDir);
      expect(err).toContain("built-in preset name");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("config unknown subcommand exits with error", () => {
    const tempDir = makeTempDir("cli-config-unknown-");
    try {
      const err = runWithCwdExpectFail("config unknown-sub", tempDir);
      expect(err).toContain("Unknown config subcommand");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
