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

  test("--model forwarded to claude and reflected in the prompt", () => {
    const output = run("create --model claude-sonnet-5");
    expect(output).toContain("--model claude-sonnet-5");
  });

  test("--model picks the lean reminder wording for the session model", () => {
    const opus48 = run("create --print --model 'claude-opus-4-8[1m]'");
    const opus5 = run("create --print --model claude-opus-5");
    expect(opus48).toContain("`<system-reminder>` tags in messages and tool results are injected by the harness");
    expect(opus5).toContain("via mid-conversation system turns");
  });

  test("leaves session details to Claude Code's own environment attachments", () => {
    const output = run("create --print --model claude-opus-5");
    expect(output).toContain("# Environment");
    expect(output).not.toContain("Primary working directory");
    expect(output).not.toContain("You are powered by the model");
  });

  test("--system-prompt rejected", () => {
    const errOutput = runExpectFail("create --system-prompt foo");
    expect(errOutput).toContain("Cannot use --system-prompt");
  });

  test("invalid agency rejected", () => {
    const errOutput = runExpectFail("--agency invalid");
    expect(errOutput).toContain("Unknown --agency value");
  });

  test("all presets produce valid commands", () => {
    for (const preset of ["create", "extend", "safe", "refactor", "explore", "none", "debug", "methodical", "director", "partner", "muse"]) {
      const output = run(preset);
      expect(output).toMatch(/^claude --system-prompt-file /);
    }
  });

  test("debug --print contains investigation mode content", () => {
    const output = run("debug --print");
    expect(output).toContain("Investigation mode");
    expect(output).not.toMatch(/^claude /);
  });

  test("methodical --print contains methodical mode content", () => {
    const output = run("methodical --print");
    expect(output).toContain("Methodical mode");
    expect(output).not.toMatch(/^claude /);
  });

  test("debug --print has no unreplaced template variables", () => {
    const output = run("debug --print");
    expect(output).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("debug --base standard --print uses standard base", () => {
    const withStandard = run("debug --base standard --print");
    const withChill = run("debug --print");
    // Standard base has different content than chill base
    expect(withStandard).not.toBe(withChill);
  });

  test("--help shows debug and methodical presets", () => {
    const output = run("--help");
    expect(output).toContain("debug");
    expect(output).toContain("methodical");
  });

  test("muse --print contains muse content on chill base", () => {
    const output = run("muse --print");
    expect(output).toContain("# Muse");
    expect(output).toContain("Their request is the muse");
    expect(output).not.toMatch(/^claude /);
    expect(output).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("create --modifier muse --print includes muse content on standard base", () => {
    const output = run("create --modifier muse --print");
    expect(output).toContain("# Muse");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).not.toMatch(/^claude /);
  });

  test("--help shows muse preset", () => {
    const output = run("--help");
    expect(output).toContain("muse");
    expect(output).toContain("maximalist creative");
  });

  test("--help shows --base flag", () => {
    const output = run("--help");
    expect(output).toContain("--base");
    expect(output).toContain("standard, chill");
  });

  test("--base chill --print produces valid prompt output", () => {
    const output = run("create --base chill --print");
    expect(output).toContain("Claude Code");
    expect(output).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(output).not.toMatch(/^claude /);
  });

  test("--base auto picks lean for a lean-capable model", () => {
    const output = run("create --base auto --model claude-opus-5 --print");
    expect(output).toContain("# Harness");
    expect(output).not.toContain("# Doing tasks");
  });

  test("--base auto picks standard for a model without the capability", () => {
    const output = run("create --base auto --model claude-sonnet-5 --print");
    expect(output).toContain("# Doing tasks");
    expect(output).not.toContain("# Harness");
  });

  test("no --base behaves like --base auto", () => {
    const withAuto = run("create --base auto --model claude-sonnet-5 --print");
    const withoutBase = run("create --model claude-sonnet-5 --print");
    expect(withoutBase).toBe(withAuto);
  });

  test("auto adds the prompt-bundle sections only for a bundle-capable model", () => {
    const opus5 = run("create --model claude-opus-5 --print");
    const opus48 = run("create --model claude-opus-4-8 --print");
    expect(opus5).toContain("# Delivering work");
    expect(opus5).toContain("# Corrections");
    expect(opus48).not.toContain("# Delivering work");
  });

  test("auto adds only the sections each model's bundle carries", () => {
    const fable51 = run("create --model claude-fable-5-1 --print");
    const opus55 = run("create --model claude-opus-5-5 --print");
    expect(fable51).toContain("# Delivering work");
    expect(fable51).not.toContain("# Corrections");
    expect(fable51).not.toContain("# Tool restraint");
    expect(opus55).toContain("# Harness");
    expect(opus55).not.toContain("# Delivering work");
  });

  test("an explicit --base lean skips the prompt-bundle sections", () => {
    const output = run("create --base lean --model claude-opus-5 --print");
    expect(output).toContain("# Harness");
    expect(output).not.toContain("# Delivering work");
  });

  test("--base invalid-name produces descriptive error", () => {
    const errOutput = runExpectFail("create --base nonexistent-base");
    expect(errOutput).toContain("Unknown --base value");
  });

  test("create --style declaudified --print includes style content after axes", () => {
    const output = run("create --style declaudified --print");
    expect(output).toContain("# Style: Declaudified");
    expect(output).toContain("Lead with the answer.");
    const scopeIdx = output.indexOf("# Scope: Unrestricted");
    const styleIdx = output.indexOf("# Style: Declaudified");
    expect(scopeIdx).toBeGreaterThan(-1);
    expect(styleIdx).toBeGreaterThan(scopeIdx);
  });

  test("straight style includes direct, self-contained communication rules", () => {
    const output = run("create --style straight --print");
    expect(output).toContain("# Style: Straight");
    expect(output).toContain("Do not sugarcoat.");
    expect(output).toContain("Your prose is the shared record.");
  });

  test("straight preset selects the straight base and style", () => {
    const output = run("straight --print");
    expect(output).toContain("Your job is to help the user reach the correct result");
    expect(output).toContain("# Style: Straight");
    expect(output).toContain("# Quality: Pragmatic");
  });

  test("declaudified style also keeps responses self-contained", () => {
    const output = run("create --style declaudified --print");
    expect(output).toContain("Your prose is the shared record.");
  });

  test("no style content without --style", () => {
    const output = run("create --print");
    expect(output).not.toContain("# Style: Declaudified");
    expect(output).not.toContain("# Style: Straight");
  });

  test("none --style declaudified --print includes style without axes", () => {
    const output = run("none --style declaudified --print");
    expect(output).toContain("# Style: Declaudified");
    expect(output).not.toContain("# Agency:");
  });

  test("--style invalid-name produces descriptive error", () => {
    const errOutput = runExpectFail("create --style nonexistent-style");
    expect(errOutput).toContain("Unknown --style value");
  });

  test("--help shows --style flag", () => {
    const output = run("--help");
    expect(output).toContain("--style");
    expect(output).toContain("declaudified, straight");
  });
});

describe("routing isolation: inspect vs normal --print", () => {
  const { run } = createCliRunner(
    `bun run ${join(import.meta.dir, "build-prompt.ts")}`,
    10000,
  );

  test("inspect create --print produces verbose inspect output", () => {
    const output = run("inspect create --print");
    // Should have inspect structure
    expect(output).toContain("=== Fragments ===");
    expect(output).toContain("--- #1");
    expect(output).toContain("[built-in]");
    // Should NOT produce a claude command (guards against missing process.exit after inspect)
    expect(output).not.toMatch(/^claude /);
    expect(output).not.toContain("--system-prompt-file");
  });

  test("create --print produces assembled prompt, not inspect output", () => {
    const output = run("create --print");
    // Should contain assembled prompt content
    expect(output).toContain("Claude Code");
    // Should NOT have inspect structure
    expect(output).not.toContain("=== Fragments ===");
    expect(output).not.toContain("--- #1");
  });

  test("inspect create (no --print) produces tabular manifest", () => {
    const output = run("inspect create");
    expect(output).toContain("=== Fragments ===");
    expect(output).toContain("Provenance       Path");
    // Should NOT have verbose separators
    expect(output).not.toContain("--- #1");
    // Should NOT produce a claude command (guards against missing process.exit after inspect)
    expect(output).not.toContain("--system-prompt-file");
  });
});
