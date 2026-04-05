import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runConfigCommand } from "./config-cli.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "config-cli-test-"));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("config show", () => {
  let tempDir: string;
  let configPath: string;
  let originalCwd: string;
  let captured: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    configPath = join(tempDir, ".claude-mode.json");
    originalCwd = process.cwd();
    process.chdir(tempDir);
    // Capture stdout
    captured = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as typeof process.stdout.write;
    (process.stdout as any)._origWrite = origWrite;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    process.stdout.write = (process.stdout as any)._origWrite;
  });

  test("prints 'No config file found.' when no file", () => {
    runConfigCommand(["show"]);
    expect(captured).toContain("No config file found.");
  });

  test("prints JSON when file exists", () => {
    writeFileSync(configPath, JSON.stringify({ defaultModifiers: ["readonly"] }, null, 2) + "\n", "utf8");
    runConfigCommand(["show"]);
    expect(captured).toContain('"defaultModifiers"');
    expect(captured).toContain('"readonly"');
  });
});

describe("config init", () => {
  let tempDir: string;
  let configPath: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    configPath = join(tempDir, ".claude-mode.json");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("creates scaffold file with empty collections", () => {
    runConfigCommand(["init"]);
    expect(existsSync(configPath)).toBe(true);
    const data = readJson(configPath) as any;
    expect(data.defaultModifiers).toEqual([]);
    expect(data.modifiers).toEqual({});
    expect(data.axes).toEqual({});
    expect(data.presets).toEqual({});
  });

  test("throws if file already exists", () => {
    writeFileSync(configPath, "{}", "utf8");
    expect(() => runConfigCommand(["init"])).toThrow("already exists");
  });
});

describe("config add-default / remove-default", () => {
  let tempDir: string;
  let configPath: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    configPath = join(tempDir, ".claude-mode.json");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("add-default creates file and appends value", () => {
    runConfigCommand(["add-default", "context-pacing"]);
    const data = readJson(configPath) as any;
    expect(data.defaultModifiers).toEqual(["context-pacing"]);
  });

  test("add-default deduplicates: no-op if already present", () => {
    runConfigCommand(["add-default", "readonly"]);
    runConfigCommand(["add-default", "readonly"]);
    const data = readJson(configPath) as any;
    expect(data.defaultModifiers).toEqual(["readonly"]);
  });

  test("add-default appends multiple distinct values", () => {
    runConfigCommand(["add-default", "readonly"]);
    runConfigCommand(["add-default", "context-pacing"]);
    const data = readJson(configPath) as any;
    expect(data.defaultModifiers).toEqual(["readonly", "context-pacing"]);
  });

  test("remove-default removes an existing value", () => {
    runConfigCommand(["add-default", "readonly"]);
    runConfigCommand(["add-default", "context-pacing"]);
    runConfigCommand(["remove-default", "readonly"]);
    const data = readJson(configPath) as any;
    expect(data.defaultModifiers).toEqual(["context-pacing"]);
  });

  test("remove-default throws if value not found", () => {
    expect(() => runConfigCommand(["remove-default", "missing"])).toThrow(
      '"missing" not found in defaultModifiers'
    );
  });

  test("add-default throws if no value provided", () => {
    expect(() => runConfigCommand(["add-default"])).toThrow("add-default requires");
  });
});

describe("config add-modifier / remove-modifier", () => {
  let tempDir: string;
  let configPath: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    configPath = join(tempDir, ".claude-mode.json");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("add-modifier registers a named modifier", () => {
    runConfigCommand(["add-modifier", "rust-style", "./prompts/rust.md"]);
    const data = readJson(configPath) as any;
    expect(data.modifiers["rust-style"]).toBe("./prompts/rust.md");
  });

  test("add-modifier rejects built-in name 'readonly'", () => {
    expect(() =>
      runConfigCommand(["add-modifier", "readonly", "./path.md"])
    ).toThrow("built-in modifier name");
  });

  test("add-modifier rejects built-in name 'context-pacing'", () => {
    expect(() =>
      runConfigCommand(["add-modifier", "context-pacing", "./path.md"])
    ).toThrow("built-in modifier name");
  });

  test("remove-modifier unregisters an existing modifier", () => {
    runConfigCommand(["add-modifier", "rust-style", "./prompts/rust.md"]);
    runConfigCommand(["remove-modifier", "rust-style"]);
    const data = readJson(configPath) as any;
    expect(data.modifiers["rust-style"]).toBeUndefined();
  });

  test("remove-modifier throws if not found", () => {
    expect(() => runConfigCommand(["remove-modifier", "nonexistent"])).toThrow(
      'Modifier "nonexistent" not found'
    );
  });

  test("add-modifier throws if missing args", () => {
    expect(() => runConfigCommand(["add-modifier", "only-name"])).toThrow(
      "add-modifier requires"
    );
  });
});

describe("config add-axis / remove-axis", () => {
  let tempDir: string;
  let configPath: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    configPath = join(tempDir, ".claude-mode.json");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("add-axis registers a custom quality value", () => {
    runConfigCommand(["add-axis", "quality", "team-standard", "./prompts/team-quality.md"]);
    const data = readJson(configPath) as any;
    expect(data.axes.quality["team-standard"]).toBe("./prompts/team-quality.md");
  });

  test("add-axis registers a custom agency value", () => {
    runConfigCommand(["add-axis", "agency", "cautious", "./cautious.md"]);
    const data = readJson(configPath) as any;
    expect(data.axes.agency["cautious"]).toBe("./cautious.md");
  });

  test("add-axis registers a custom scope value", () => {
    runConfigCommand(["add-axis", "scope", "focused", "./focused.md"]);
    const data = readJson(configPath) as any;
    expect(data.axes.scope["focused"]).toBe("./focused.md");
  });

  test("add-axis throws on invalid axis name", () => {
    expect(() =>
      runConfigCommand(["add-axis", "invalid-axis", "custom", "./path.md"])
    ).toThrow('Invalid axis "invalid-axis"');
  });

  test("add-axis rejects built-in agency value", () => {
    expect(() =>
      runConfigCommand(["add-axis", "agency", "autonomous", "./path.md"])
    ).toThrow("built-in agency value");
  });

  test("add-axis rejects built-in quality value", () => {
    expect(() =>
      runConfigCommand(["add-axis", "quality", "architect", "./path.md"])
    ).toThrow("built-in quality value");
  });

  test("add-axis rejects built-in scope value", () => {
    expect(() =>
      runConfigCommand(["add-axis", "scope", "narrow", "./path.md"])
    ).toThrow("built-in scope value");
  });

  test("remove-axis removes an existing axis value", () => {
    runConfigCommand(["add-axis", "quality", "team-standard", "./team.md"]);
    runConfigCommand(["remove-axis", "quality", "team-standard"]);
    const data = readJson(configPath) as any;
    expect(data.axes.quality?.["team-standard"]).toBeUndefined();
  });

  test("remove-axis throws if not found", () => {
    expect(() =>
      runConfigCommand(["remove-axis", "quality", "nonexistent"])
    ).toThrow('quality value "nonexistent" not found');
  });

  test("remove-axis throws on invalid axis", () => {
    expect(() =>
      runConfigCommand(["remove-axis", "badaxis", "name"])
    ).toThrow('Invalid axis "badaxis"');
  });

  test("add-axis throws if missing args", () => {
    expect(() => runConfigCommand(["add-axis", "quality", "name"])).toThrow(
      "add-axis requires"
    );
  });
});

describe("config add-preset / remove-preset", () => {
  let tempDir: string;
  let configPath: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    configPath = join(tempDir, ".claude-mode.json");
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("add-preset creates a preset with axis flags", () => {
    runConfigCommand([
      "add-preset", "team",
      "--agency", "collaborative",
      "--quality", "pragmatic",
      "--scope", "adjacent",
    ]);
    const data = readJson(configPath) as any;
    expect(data.presets.team.agency).toBe("collaborative");
    expect(data.presets.team.quality).toBe("pragmatic");
    expect(data.presets.team.scope).toBe("adjacent");
  });

  test("add-preset with --modifier flag", () => {
    runConfigCommand([
      "add-preset", "team",
      "--agency", "collaborative",
      "--modifier", "rust-style",
    ]);
    const data = readJson(configPath) as any;
    expect(data.presets.team.modifiers).toEqual(["rust-style"]);
  });

  test("add-preset with multiple --modifier flags", () => {
    runConfigCommand([
      "add-preset", "team",
      "--modifier", "rust-style",
      "--modifier", "no-todos",
    ]);
    const data = readJson(configPath) as any;
    expect(data.presets.team.modifiers).toEqual(["rust-style", "no-todos"]);
  });

  test("add-preset with --readonly flag", () => {
    runConfigCommand(["add-preset", "safe-team", "--readonly"]);
    const data = readJson(configPath) as any;
    expect(data.presets["safe-team"].readonly).toBe(true);
  });

  test("add-preset with --context-pacing flag", () => {
    runConfigCommand(["add-preset", "paced", "--context-pacing"]);
    const data = readJson(configPath) as any;
    expect(data.presets.paced.contextPacing).toBe(true);
  });

  test("add-preset creates minimal preset with no flags", () => {
    runConfigCommand(["add-preset", "empty-preset"]);
    const data = readJson(configPath) as any;
    expect(data.presets["empty-preset"]).toBeDefined();
  });

  test("add-preset rejects built-in preset name", () => {
    expect(() => runConfigCommand(["add-preset", "create"])).toThrow(
      "built-in preset name"
    );
  });

  test("add-preset rejects 'explore' (built-in)", () => {
    expect(() => runConfigCommand(["add-preset", "explore"])).toThrow(
      "built-in preset name"
    );
  });

  test("add-preset rejects 'none' (built-in)", () => {
    expect(() => runConfigCommand(["add-preset", "none"])).toThrow(
      "built-in preset name"
    );
  });

  test("remove-preset removes an existing preset", () => {
    runConfigCommand(["add-preset", "team", "--agency", "collaborative"]);
    runConfigCommand(["remove-preset", "team"]);
    const data = readJson(configPath) as any;
    expect(data.presets?.team).toBeUndefined();
  });

  test("remove-preset throws if not found", () => {
    expect(() => runConfigCommand(["remove-preset", "nonexistent"])).toThrow(
      'Preset "nonexistent" not found'
    );
  });

  test("add-preset throws if missing name", () => {
    expect(() => runConfigCommand(["add-preset"])).toThrow("add-preset requires");
  });
});

describe("config --global flag", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("--global targets ~/.config/claude-mode/config.json path (not CWD)", () => {
    // We can verify that --global does NOT create a file in CWD
    // Instead it would create in ~/.config/claude-mode — but we don't want to
    // pollute the real global config. We test by observing that show says
    // "No config file found." when no global config exists (environment-dependent),
    // OR that the local file is not touched.
    // Just verify no .claude-mode.json was created in CWD
    const localPath = join(tempDir, ".claude-mode.json");

    // show with --global won't create local file
    let captured = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as typeof process.stdout.write;
    try {
      runConfigCommand(["show", "--global"]);
    } finally {
      process.stdout.write = origWrite;
    }

    // Local file should NOT have been created
    expect(existsSync(localPath)).toBe(false);
    // Output is either JSON (if global config exists) or the "not found" message
    expect(
      captured.includes("No config file found.") || captured.includes("{")
    ).toBe(true);
  });
});

describe("config unknown subcommand", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("unknown subcommand throws with descriptive message", () => {
    expect(() => runConfigCommand(["unknown-cmd"])).toThrow(
      'Unknown config subcommand: "unknown-cmd"'
    );
  });
});
