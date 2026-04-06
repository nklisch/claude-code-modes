import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runInspectCommand } from "./inspect.js";
import { makeTempDir, PROJECT_ROOT } from "./test-helpers.js";

const PROMPTS_DIR = join(PROJECT_ROOT, "prompts");

function captureStdout(fn: () => void): string {
  let captured = "";
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    captured += chunk;
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = origWrite;
  }
  return captured;
}

describe("inspect — provenance", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir("inspect-test-");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("built-in preset shows all built-in provenance", () => {
    const output = captureStdout(() => runInspectCommand(["create"], PROMPTS_DIR));
    expect(output).toContain("=== Fragments ===");
    // All base fragments should be built-in
    expect(output).toContain("built-in         base/intro.md");
    expect(output).toContain("built-in         base/system.md");
    expect(output).toContain("built-in         axis/agency/autonomous.md");
    expect(output).toContain("built-in         base/env.md");
    // No config-defined or cli-path
    expect(output).not.toContain("config-defined");
    expect(output).not.toContain("cli-path");
  });

  test("config-defined axis value shows config-defined provenance", () => {
    const customDir = join(tempDir, "prompts");
    mkdirSync(customDir, { recursive: true });
    const customFile = join(customDir, "team-quality.md");
    writeFileSync(customFile, "# Team quality rules\n");

    writeFileSync(
      join(tempDir, ".claude-mode.json"),
      JSON.stringify({
        axes: { quality: { "team-standard": "./prompts/team-quality.md" } },
      }),
    );

    const output = captureStdout(() =>
      runInspectCommand(["create", "--quality", "team-standard"], PROMPTS_DIR),
    );
    expect(output).toMatch(/config-defined\s+.*team-quality\.md/);
  });

  test("CLI --modifier file path shows cli-path provenance", () => {
    const modFile = join(tempDir, "my-rules.md");
    writeFileSync(modFile, "# My rules\n");

    const output = captureStdout(() =>
      runInspectCommand(["create", "--modifier", modFile], PROMPTS_DIR),
    );
    expect(output).toMatch(/cli-path\s+.*my-rules\.md/);
  });

  test("mixed provenance in one run", () => {
    const customDir = join(tempDir, "prompts");
    mkdirSync(customDir, { recursive: true });
    const configMod = join(customDir, "config-mod.md");
    writeFileSync(configMod, "# Config modifier\n");
    const cliMod = join(tempDir, "cli-mod.md");
    writeFileSync(cliMod, "# CLI modifier\n");

    writeFileSync(
      join(tempDir, ".claude-mode.json"),
      JSON.stringify({
        modifiers: { "team-rules": "./prompts/config-mod.md" },
        defaultModifiers: ["team-rules"],
      }),
    );

    const output = captureStdout(() =>
      runInspectCommand(["create", "--modifier", cliMod], PROMPTS_DIR),
    );
    // Verify each provenance label is on the correct fragment
    expect(output).toMatch(/built-in\s+base\/intro\.md/);
    expect(output).toMatch(/config-defined\s+.*config-mod\.md/);
    expect(output).toMatch(/cli-path\s+.*cli-mod\.md/);
  });
});

describe("inspect — warnings", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir("inspect-test-");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("warns on path outside project directory", () => {
    const outsideFile = join(tempDir, "..", "outside.md");
    writeFileSync(outsideFile, "# Outside\n");

    try {
      const output = captureStdout(() =>
        runInspectCommand(["create", "--modifier", outsideFile], PROMPTS_DIR),
      );
      expect(output).toContain("resolves outside project directory");
    } finally {
      rmSync(outsideFile, { force: true });
    }
  });

  test("warns on non-.md extension", () => {
    const txtFile = join(tempDir, "rules.txt");
    writeFileSync(txtFile, "some rules\n");

    const output = captureStdout(() =>
      runInspectCommand(["create", "--modifier", txtFile], PROMPTS_DIR),
    );
    expect(output).toContain("non-.md extension");
  });

  test("warns on missing file", () => {
    const missingFile = join(tempDir, "nonexistent.md");

    const output = captureStdout(() =>
      runInspectCommand(["create", "--modifier", missingFile], PROMPTS_DIR),
    );
    expect(output).toContain("file not found");
  });

  test("warns on suspicious path", () => {
    const sshFile = join(tempDir, ".ssh", "config.md");
    mkdirSync(join(tempDir, ".ssh"), { recursive: true });
    writeFileSync(sshFile, "# ssh\n");

    const output = captureStdout(() =>
      runInspectCommand(["create", "--modifier", sshFile], PROMPTS_DIR),
    );
    expect(output).toContain("potentially sensitive path");
  });

  test("no warnings shows (none) and no banner", () => {
    const output = captureStdout(() => runInspectCommand(["create"], PROMPTS_DIR));
    expect(output).toContain("=== Warnings ===");
    expect(output).toContain("(none)");
    expect(output).not.toContain("!! ");
  });

  test("warnings show banner at top of output", () => {
    const missingFile = join(tempDir, "nonexistent.md");

    const output = captureStdout(() =>
      runInspectCommand(["create", "--modifier", missingFile], PROMPTS_DIR),
    );
    // Banner should be the first line
    expect(output.startsWith("!! ")).toBe(true);
    expect(output).toContain("warning");
    expect(output).toContain("review before running");
  });

  test("warnings section appears before fragments section", () => {
    const missingFile = join(tempDir, "nonexistent.md");

    const output = captureStdout(() =>
      runInspectCommand(["create", "--modifier", missingFile], PROMPTS_DIR),
    );
    const warningsIdx = output.indexOf("=== Warnings ===");
    const fragmentsIdx = output.indexOf("=== Fragments ===");
    expect(warningsIdx).toBeLessThan(fragmentsIdx);
  });

  test("multiple warnings on same fragment all appear with correct banner count", () => {
    // A file outside project, non-.md, missing, and suspicious (.ssh)
    const badFile = join(tempDir, "..", ".ssh", "keys.txt");

    const output = captureStdout(() =>
      runInspectCommand(["create", "--modifier", badFile], PROMPTS_DIR),
    );
    // Should have at least 3 warnings: outside-project, non-md, missing-file, suspicious-path
    expect(output).toContain("resolves outside project directory");
    expect(output).toContain("non-.md extension");
    expect(output).toContain("file not found");
    expect(output).toContain("potentially sensitive path");
    // Banner count should reflect all individual warnings
    expect(output).toMatch(/!! 4 warnings found/);
  });
});

describe("inspect — config source", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir("inspect-test-");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("no config shows 'No config file found.'", () => {
    const output = captureStdout(() => runInspectCommand(["create"], PROMPTS_DIR));
    expect(output).toContain("No config file found.");
  });

  test("project config shows project scope", () => {
    writeFileSync(join(tempDir, ".claude-mode.json"), "{}");

    const output = captureStdout(() => runInspectCommand(["create"], PROMPTS_DIR));
    expect(output).toContain(".claude-mode.json (project)");
    expect(output).toContain(tempDir);
  });
});

describe("inspect — none preset", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir("inspect-test-");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("none preset shows no axis fragments", () => {
    const output = captureStdout(() => runInspectCommand(["none"], PROMPTS_DIR));
    expect(output).toContain("base/intro.md");
    expect(output).toContain("base/env.md");
    expect(output).not.toContain("axis/");
  });
});

describe("inspect --print (verbose)", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir("inspect-test-");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("shows fragment content between separators", () => {
    const output = captureStdout(() => runInspectCommand(["create", "--print"], PROMPTS_DIR));
    expect(output).toContain("--- #1 [built-in] base/intro.md ---");
    // Verify content appears between separator and next separator (structural, not content-specific)
    const firstSep = output.indexOf("--- #1 [built-in]");
    const secondSep = output.indexOf("--- #2 [built-in]");
    expect(firstSep).toBeGreaterThan(-1);
    expect(secondSep).toBeGreaterThan(firstSep);
    // There should be substantial content between separators (not empty)
    const between = output.slice(firstSep, secondSep);
    expect(between.length).toBeGreaterThan(100);
  });

  test("shows raw template variables not substituted", () => {
    const output = captureStdout(() => runInspectCommand(["create", "--print"], PROMPTS_DIR));
    // The env.md fragment has {{CWD}} placeholder — should show raw, not substituted
    expect(output).toContain("{{CWD}}");
  });

  test("shows (file not found) for missing custom fragments", () => {
    const missingFile = join(tempDir, "missing.md");

    const output = captureStdout(() =>
      runInspectCommand(["create", "--print", "--modifier", missingFile], PROMPTS_DIR),
    );
    expect(output).toContain("(file not found)");
  });

  test("still shows Warnings and Template Variables sections", () => {
    const output = captureStdout(() => runInspectCommand(["create", "--print"], PROMPTS_DIR));
    expect(output).toContain("=== Warnings ===");
    expect(output).toContain("=== Template Variables ===");
  });

  test("without --print shows tabular format, not fragment content", () => {
    const output = captureStdout(() => runInspectCommand(["create"], PROMPTS_DIR));
    // Tabular format has the column header
    expect(output).toContain("Provenance       Path");
    // Should not have verbose separators
    expect(output).not.toContain("--- #1");
    // Should not contain raw fragment content
    expect(output).not.toContain("interactive agent");
  });
});

describe("inspect — template variables", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir("inspect-test-");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("shows template variables section", () => {
    const output = captureStdout(() => runInspectCommand(["create"], PROMPTS_DIR));
    expect(output).toContain("=== Template Variables ===");
    expect(output).toContain("CWD");
    expect(output).toContain("MODEL_NAME");
    expect(output).toContain("PLATFORM");
  });
});
