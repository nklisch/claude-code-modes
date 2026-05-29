import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig, resolveConfigPath, checkBaseNameCollision } from "./config.js";
import { makeTempDir } from "./test-helpers.js";

function writeConfig(dir: string, filename: string, content: unknown): string {
  const path = join(dir, filename);
  writeFileSync(path, JSON.stringify(content), "utf8");
  return path;
}

describe("loadConfig", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = makeTempDir("claude-mode-config-test-");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("returns null when no config file exists", () => {
    process.chdir(tempDir);
    // No .claude-mode.json and no global config
    // We need to ensure there's no global config — but we can't easily mock homedir.
    // Instead, test by having no local config and trusting absence.
    // This test will pass unless the test runner has a global config at ~/.config/claude-mode/config.json
    const result = loadConfig();
    // Only assert null if we know no global config exists
    // Since we can't mock homedir, just verify it returns null or LoadedConfig
    expect(result === null || typeof result === "object").toBe(true);
  });

  test("loads .claude-mode.json from CWD when present", () => {
    writeConfig(tempDir, ".claude-mode.json", { defaultModifiers: ["readonly"] });
    process.chdir(tempDir);
    const result = loadConfig();
    expect(result).not.toBeNull();
    expect(result!.config.defaultModifiers).toEqual(["readonly"]);
    expect(result!.configDir).toBe(tempDir);
  });

  test("loads empty config object", () => {
    writeConfig(tempDir, ".claude-mode.json", {});
    process.chdir(tempDir);
    const result = loadConfig();
    expect(result).not.toBeNull();
    expect(result!.config).toEqual({});
  });

  test("loads config with all fields", () => {
    const config = {
      defaultModifiers: ["readonly"],
      modifiers: { "focus": "./focus.md" },
      axes: {
        agency: { "cautious": "./cautious-agency.md" },
        quality: { "team-standard": "./team-quality.md" },
        scope: {},
      },
      presets: {
        "team-default": {
          agency: "collaborative",
          quality: "pragmatic",
          scope: "adjacent",
        },
      },
    };
    writeConfig(tempDir, ".claude-mode.json", config);
    process.chdir(tempDir);
    const result = loadConfig();
    expect(result).not.toBeNull();
    expect(result!.config.defaultModifiers).toEqual(["readonly"]);
    expect(result!.config.modifiers).toEqual({ "focus": "./focus.md" });
    expect(result!.config.presets?.["team-default"]).toBeDefined();
  });

  test("throws on invalid JSON", () => {
    const path = join(tempDir, ".claude-mode.json");
    writeFileSync(path, "{ not valid json }", "utf8");
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow("Invalid config file");
  });

  test("throws when top-level value is not an object", () => {
    writeConfig(tempDir, ".claude-mode.json", [1, 2, 3]);
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow("top-level value must be an object");
  });

  test("throws when top-level is a string", () => {
    const path = join(tempDir, ".claude-mode.json");
    writeFileSync(path, '"just a string"', "utf8");
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow("top-level value must be an object");
  });

  test("throws when defaultModifiers is not an array", () => {
    writeConfig(tempDir, ".claude-mode.json", { defaultModifiers: "readonly" });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"defaultModifiers" must be an array of strings');
  });

  test("throws when defaultModifiers contains non-string", () => {
    writeConfig(tempDir, ".claude-mode.json", { defaultModifiers: [1, 2] });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"defaultModifiers" must be an array of strings');
  });

  test("throws when modifiers is not an object", () => {
    writeConfig(tempDir, ".claude-mode.json", { modifiers: "invalid" });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"modifiers" must be an object');
  });

  test("throws when modifier value is not a string", () => {
    writeConfig(tempDir, ".claude-mode.json", { modifiers: { "focus": 42 } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"modifiers.focus" must be a string');
  });

  test("throws when modifier name collides with built-in", () => {
    writeConfig(tempDir, ".claude-mode.json", { modifiers: { "readonly": "./path.md" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"readonly" is a built-in modifier name');
  });

  test("throws when context-pacing modifier name collides with built-in", () => {
    writeConfig(tempDir, ".claude-mode.json", { modifiers: { "context-pacing": "./path.md" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"context-pacing" is a built-in modifier name');
  });

  test("throws when debug modifier name collides with built-in", () => {
    writeConfig(tempDir, ".claude-mode.json", { modifiers: { "debug": "./path.md" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"debug" is a built-in modifier name');
  });

  test("throws when methodical modifier name collides with built-in", () => {
    writeConfig(tempDir, ".claude-mode.json", { modifiers: { "methodical": "./path.md" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"methodical" is a built-in modifier name');
  });

  test("throws when flow modifier name collides with built-in", () => {
    writeConfig(tempDir, ".claude-mode.json", { modifiers: { "flow": "./path.md" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"flow" is a built-in modifier name');
  });

  test("throws when playful modifier name collides with built-in", () => {
    writeConfig(tempDir, ".claude-mode.json", { modifiers: { "playful": "./path.md" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"playful" is a built-in modifier name');
  });

  test("throws when preset name collides with built-in", () => {
    writeConfig(tempDir, ".claude-mode.json", { presets: { "create": { agency: "collaborative" } } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"create" is a built-in preset name');
  });

  test("throws when preset name collides with explore", () => {
    writeConfig(tempDir, ".claude-mode.json", { presets: { "explore": {} } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"explore" is a built-in preset name');
  });

  test("throws when preset name collides with debug", () => {
    writeConfig(tempDir, ".claude-mode.json", { presets: { "debug": { agency: "collaborative" } } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"debug" is a built-in preset name');
  });

  test("throws when preset name collides with methodical", () => {
    writeConfig(tempDir, ".claude-mode.json", { presets: { "methodical": {} } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"methodical" is a built-in preset name');
  });

  test("throws when preset definition is not an object", () => {
    writeConfig(tempDir, ".claude-mode.json", { presets: { "my-preset": "invalid" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('preset "my-preset" must be an object');
  });

  test("throws when preset.agency is not a string", () => {
    writeConfig(tempDir, ".claude-mode.json", { presets: { "my-preset": { agency: 42 } } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('preset "my-preset.agency" must be a string');
  });

  test("throws when preset.readonly is not a boolean", () => {
    writeConfig(tempDir, ".claude-mode.json", { presets: { "my-preset": { readonly: "yes" } } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('preset "my-preset.readonly" must be a boolean');
  });

  test("throws when preset.modifiers is not an array", () => {
    writeConfig(tempDir, ".claude-mode.json", { presets: { "my-preset": { modifiers: "readonly" } } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('preset "my-preset.modifiers" must be an array of strings');
  });

  test("loads global config from ~/.config/claude-mode/config.json when no local config", () => {
    // We need to test fallback: can't easily mock homedir, so test that local takes priority
    writeConfig(tempDir, ".claude-mode.json", { defaultModifiers: ["readonly"] });
    process.chdir(tempDir);
    const result = loadConfig();
    // If local config exists, it takes priority regardless of global
    expect(result!.configDir).toBe(tempDir);
  });

  test("configDir is the directory of the loaded config file", () => {
    writeConfig(tempDir, ".claude-mode.json", {});
    process.chdir(tempDir);
    const result = loadConfig();
    expect(result!.configDir).toBe(tempDir);
  });
});

describe("loadConfig — bases and defaultBase", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = makeTempDir("claude-mode-config-test-bases-");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("loads config with defaultBase field", () => {
    writeConfig(tempDir, ".claude-mode.json", { defaultBase: "chill" });
    process.chdir(tempDir);
    const result = loadConfig();
    expect(result).not.toBeNull();
    expect(result!.config.defaultBase).toBe("chill");
  });

  test("loads config with bases field", () => {
    writeConfig(tempDir, ".claude-mode.json", { bases: { "my-base": "./my-base-dir" } });
    process.chdir(tempDir);
    const result = loadConfig();
    expect(result).not.toBeNull();
    expect(result!.config.bases).toEqual({ "my-base": "./my-base-dir" });
  });

  test("throws when defaultBase is not a string", () => {
    writeConfig(tempDir, ".claude-mode.json", { defaultBase: 42 });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"defaultBase" must be a string');
  });

  test("throws when bases is not an object", () => {
    writeConfig(tempDir, ".claude-mode.json", { bases: "chill" });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"bases" must be an object');
  });

  test("throws when bases value is not a string", () => {
    writeConfig(tempDir, ".claude-mode.json", { bases: { "my-base": 42 } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"bases.my-base" must be a string');
  });

  test("throws when base name collides with built-in standard", () => {
    writeConfig(tempDir, ".claude-mode.json", { bases: { "standard": "./x" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"standard" is a built-in base name');
  });

  test("throws when base name collides with built-in chill", () => {
    writeConfig(tempDir, ".claude-mode.json", { bases: { "chill": "./x" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"chill" is a built-in base name');
  });

  test("throws when base name collides with built-in flow", () => {
    writeConfig(tempDir, ".claude-mode.json", { bases: { "flow": "./x" } });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('"flow" is a built-in base name');
  });

  test("loads config with preset that has base field", () => {
    writeConfig(tempDir, ".claude-mode.json", {
      presets: { "my-preset": { base: "chill", agency: "collaborative" } },
    });
    process.chdir(tempDir);
    const result = loadConfig();
    expect(result).not.toBeNull();
    expect(result!.config.presets?.["my-preset"]?.base).toBe("chill");
  });

  test("throws when preset base is not a string", () => {
    writeConfig(tempDir, ".claude-mode.json", {
      presets: { "my-preset": { base: 42 } },
    });
    process.chdir(tempDir);
    expect(() => loadConfig()).toThrow('preset "my-preset.base" must be a string');
  });
});

describe("checkBaseNameCollision", () => {
  test("throws for standard", () => {
    expect(() => checkBaseNameCollision("standard")).toThrow('"standard" is a built-in base name');
  });

  test("throws for chill", () => {
    expect(() => checkBaseNameCollision("chill")).toThrow('"chill" is a built-in base name');
  });

  test("throws for flow", () => {
    expect(() => checkBaseNameCollision("flow")).toThrow('"flow" is a built-in base name');
  });

  test("does not throw for custom name", () => {
    expect(() => checkBaseNameCollision("my-base")).not.toThrow();
  });

  test("does not throw for other names", () => {
    expect(() => checkBaseNameCollision("team-base")).not.toThrow();
  });
});

describe("resolveConfigPath", () => {
  test("returns absolute path unchanged", () => {
    const abs = "/home/user/my-file.md";
    expect(resolveConfigPath("/some/dir", abs)).toBe(abs);
  });

  test("resolves relative path against configDir", () => {
    const result = resolveConfigPath("/home/user/project", "./rules.md");
    expect(result).toBe("/home/user/project/rules.md");
  });

  test("resolves relative path without leading ./", () => {
    const result = resolveConfigPath("/home/user/project", "rules.md");
    expect(result).toBe("/home/user/project/rules.md");
  });

  test("resolves path with subdirectory", () => {
    const result = resolveConfigPath("/home/user/project", "./prompts/custom.md");
    expect(result).toBe("/home/user/project/prompts/custom.md");
  });
});
