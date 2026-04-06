import { describe, test, expect } from "bun:test";
import { resolveConfig } from "./resolve.js";
import type { ParsedArgs } from "./args.js";
import type { LoadedConfig } from "./config.js";

const baseParsed: ParsedArgs = {
  preset: null,
  overrides: {},
  modifiers: { readonly: false, print: false, contextPacing: false },
  customModifiers: [],
  forwarded: {},
  passthroughArgs: [],
};

describe("resolveConfig", () => {
  test("preset with no overrides returns preset axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create" }, null);
    expect(config.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
  });

  test("preset with partial override merges", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "create",
      overrides: { quality: "pragmatic" },
    }, null);
    expect(config.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "unrestricted" });
  });

  test("no preset uses defaults", () => {
    const config = resolveConfig(baseParsed, null);
    expect(config.axes).toEqual({ agency: "collaborative", quality: "pragmatic", scope: "adjacent" });
  });

  test("no preset with partial overrides fills from defaults", () => {
    const config = resolveConfig({ ...baseParsed, overrides: { agency: "autonomous" } }, null);
    expect(config.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "adjacent" });
  });

  test("none preset returns null axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "none" }, null);
    expect(config.axes).toBeNull();
  });

  test("explore preset returns readonly true", () => {
    const config = resolveConfig({ ...baseParsed, preset: "explore" }, null);
    expect(config.modifiers.readonly).toBe(true);
  });

  test("--readonly flag on any preset", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "create",
      modifiers: { readonly: true, print: false, contextPacing: false },
    }, null);
    expect(config.modifiers.readonly).toBe(true);
  });

  test("explore without --readonly is still readonly", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "explore",
      modifiers: { readonly: false, print: false, contextPacing: false },
    }, null);
    expect(config.modifiers.readonly).toBe(true);
  });

  test("resolved ModeConfig.modifiers.custom is empty array by default", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create" }, null);
    expect(config.modifiers.custom).toEqual([]);
  });

  test("unknown preset throws descriptive error", () => {
    expect(() => resolveConfig({ ...baseParsed, preset: "nonexistent" }, null)).toThrow(
      'Unknown preset: "nonexistent"'
    );
  });

  test("unknown axis value throws descriptive error", () => {
    expect(() =>
      resolveConfig({ ...baseParsed, overrides: { agency: "invalid" } }, null)
    ).toThrow('Unknown --agency value: "invalid"');
  });

  test("file path axis value resolves to absolute path", () => {
    const config = resolveConfig({
      ...baseParsed,
      overrides: { agency: "/absolute/custom-agency.md" },
    }, null);
    expect(config.axes?.agency).toBe("/absolute/custom-agency.md");
  });

  test("relative file path axis value resolves to absolute path", () => {
    const config = resolveConfig({
      ...baseParsed,
      overrides: { agency: "./custom-agency.md" },
    }, null);
    expect(config.axes?.agency).toMatch(/^\/.*custom-agency\.md$/);
  });

  test("custom modifier file path resolves to absolute path", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["/absolute/my-rules.md"],
    }, null);
    expect(config.modifiers.custom).toEqual(["/absolute/my-rules.md"]);
  });

  test("multiple custom modifiers are collected in order", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["/path/a.md", "/path/b.md"],
    }, null);
    expect(config.modifiers.custom).toEqual(["/path/a.md", "/path/b.md"]);
  });

  test("duplicate custom modifier paths are deduplicated", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["/path/a.md", "/path/a.md"],
    }, null);
    expect(config.modifiers.custom).toEqual(["/path/a.md"]);
  });

  test("built-in modifier via --modifier sets readonly flag", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["readonly"],
    }, null);
    expect(config.modifiers.readonly).toBe(true);
    expect(config.modifiers.custom).toEqual([]);
  });

  test("built-in modifier via --modifier sets context-pacing flag", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["context-pacing"],
    }, null);
    expect(config.modifiers.contextPacing).toBe(true);
    expect(config.modifiers.custom).toEqual([]);
  });

  test("unknown modifier without path-like characters throws", () => {
    expect(() =>
      resolveConfig({ ...baseParsed, customModifiers: ["unknown-modifier"] }, null)
    ).toThrow('Unknown modifier: "unknown-modifier"');
  });
});

describe("resolveConfig with LoadedConfig", () => {
  const configDir = "/tmp/test-config";

  test("config-defined preset resolves correctly", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "my-preset": {
            agency: "autonomous",
            quality: "minimal",
            scope: "narrow",
          },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "my-preset" }, loadedConfig);
    expect(config.axes).toEqual({ agency: "autonomous", quality: "minimal", scope: "narrow" });
  });

  test("config-defined preset with defaults for missing axes", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "minimal-preset": {},
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "minimal-preset" }, loadedConfig);
    expect(config.axes).toEqual({ agency: "collaborative", quality: "pragmatic", scope: "adjacent" });
  });

  test("config-defined preset with readonly flag", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "readonly-preset": { readonly: true },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "readonly-preset" }, loadedConfig);
    expect(config.modifiers.readonly).toBe(true);
  });

  test("config-defined preset with contextPacing flag", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "pacing-preset": { contextPacing: true },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "pacing-preset" }, loadedConfig);
    expect(config.modifiers.contextPacing).toBe(true);
  });

  test("config-defined axis name resolves to absolute path", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        axes: {
          agency: { "cautious": "./cautious-agency.md" },
        },
      },
    };
    const config = resolveConfig({
      ...baseParsed,
      overrides: { agency: "cautious" },
    }, loadedConfig);
    expect(config.axes?.agency).toBe(`${configDir}/cautious-agency.md`);
  });

  test("config-defined modifier name resolves to absolute path", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        modifiers: { "focus": "./focus-rules.md" },
      },
    };
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["focus"],
    }, loadedConfig);
    expect(config.modifiers.custom).toEqual([`${configDir}/focus-rules.md`]);
  });

  test("defaultModifiers from config are always applied", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        defaultModifiers: ["/path/default.md"],
      },
    };
    const config = resolveConfig(baseParsed, loadedConfig);
    expect(config.modifiers.custom).toContain("/path/default.md");
  });

  test("defaultModifiers can set readonly flag", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        defaultModifiers: ["readonly"],
      },
    };
    const config = resolveConfig(baseParsed, loadedConfig);
    expect(config.modifiers.readonly).toBe(true);
  });

  test("defaultModifiers come before CLI modifiers", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        defaultModifiers: ["/path/default.md"],
      },
    };
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["/path/cli.md"],
    }, loadedConfig);
    expect(config.modifiers.custom).toEqual(["/path/default.md", "/path/cli.md"]);
  });

  test("preset modifiers come before CLI modifiers", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "my-preset": {
            modifiers: ["/path/preset.md"],
          },
        },
      },
    };
    const config = resolveConfig({
      ...baseParsed,
      preset: "my-preset",
      customModifiers: ["/path/cli.md"],
    }, loadedConfig);
    expect(config.modifiers.custom[0]).toBe("/path/preset.md");
    expect(config.modifiers.custom[1]).toBe("/path/cli.md");
  });

  test("unknown preset with config lists config presets in error", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: { "my-preset": {} },
      },
    };
    expect(() =>
      resolveConfig({ ...baseParsed, preset: "nonexistent" }, loadedConfig)
    ).toThrow("Config presets: my-preset");
  });

  test("CLI override applies on top of config preset", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "my-preset": {
            agency: "collaborative",
            quality: "pragmatic",
            scope: "adjacent",
          },
        },
      },
    };
    const config = resolveConfig({
      ...baseParsed,
      preset: "my-preset",
      overrides: { quality: "minimal" },
    }, loadedConfig);
    expect(config.axes?.quality).toBe("minimal");
    expect(config.axes?.agency).toBe("collaborative");
  });

  test("custom preset with mixed built-in and custom axis values", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        axes: {
          quality: { "team-standard": "./team-q.md" },
        },
        presets: {
          "team": {
            agency: "autonomous",
            quality: "team-standard",
            scope: "narrow",
          },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "team" }, loadedConfig);
    expect(config.axes?.agency).toBe("autonomous");
    expect(config.axes?.quality).toMatch(/team-q\.md$/);
    expect(config.axes?.scope).toBe("narrow");
  });

  test("custom preset with custom modifier names", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        modifiers: { "focus": "./focus-rules.md" },
        presets: {
          "team": {
            agency: "collaborative",
            modifiers: ["focus", "readonly"],
          },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "team" }, loadedConfig);
    expect(config.modifiers.readonly).toBe(true);
    expect(config.modifiers.custom.some((p) => p.endsWith("focus-rules.md"))).toBe(true);
  });

  test("defaultModifiers with unknown name throws descriptive error", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        defaultModifiers: ["nonexistent-name"],
      },
    };
    expect(() => resolveConfig(baseParsed, loadedConfig)).toThrow("Unknown modifier");
  });

  test("CLI override wins over custom preset axis value", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        axes: {
          quality: { "team-standard": "./team-q.md" },
        },
        presets: {
          "team": {
            agency: "collaborative",
            quality: "team-standard",
            scope: "narrow",
          },
        },
      },
    };
    const config = resolveConfig({
      ...baseParsed,
      preset: "team",
      overrides: { quality: "pragmatic" },
    }, loadedConfig);
    expect(config.axes?.quality).toBe("pragmatic");
  });
});
