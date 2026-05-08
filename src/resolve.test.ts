import { describe, test, expect } from "bun:test";
import { resolveConfig } from "./resolve.js";
import type { ParsedArgs } from "./args.js";
import type { LoadedConfig } from "./config.js";

const baseParsed: ParsedArgs = {
  base: undefined,
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

  test("explore preset includes readonly modifier", () => {
    const config = resolveConfig({ ...baseParsed, preset: "explore" }, null);
    expect(config.modifiers).toContain("modifiers/readonly.md");
  });

  test("--readonly flag on any preset adds readonly modifier", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "create",
      modifiers: { readonly: true, print: false, contextPacing: false },
    }, null);
    expect(config.modifiers).toContain("modifiers/readonly.md");
  });

  test("explore without --readonly still has readonly modifier", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "explore",
      modifiers: { readonly: false, print: false, contextPacing: false },
    }, null);
    expect(config.modifiers).toContain("modifiers/readonly.md");
  });

  test("ModeConfig.modifiers is empty array by default", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create" }, null);
    expect(config.modifiers).toEqual([]);
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

  test("custom modifier file path resolves to absolute path in modifiers list", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["/absolute/my-rules.md"],
    }, null);
    expect(config.modifiers).toContain("/absolute/my-rules.md");
  });

  test("multiple custom modifiers are collected in order", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["/path/a.md", "/path/b.md"],
    }, null);
    expect(config.modifiers).toEqual(["/path/a.md", "/path/b.md"]);
  });

  test("duplicate custom modifier paths are deduplicated", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["/path/a.md", "/path/a.md"],
    }, null);
    expect(config.modifiers).toEqual(["/path/a.md"]);
  });

  test("built-in modifier 'readonly' via --modifier adds readonly fragment path", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["readonly"],
    }, null);
    expect(config.modifiers).toContain("modifiers/readonly.md");
    expect(config.modifiers.filter((p) => p.startsWith("/")).length).toBe(0);
  });

  test("built-in modifier 'context-pacing' via --modifier adds context-pacing fragment path", () => {
    const config = resolveConfig({
      ...baseParsed,
      customModifiers: ["context-pacing"],
    }, null);
    expect(config.modifiers).toContain("modifiers/context-pacing.md");
  });

  test("--readonly and --modifier readonly both add the same path (deduplicated)", () => {
    const config = resolveConfig({
      ...baseParsed,
      modifiers: { readonly: true, print: false, contextPacing: false },
      customModifiers: ["readonly"],
    }, null);
    expect(config.modifiers.filter((p) => p === "modifiers/readonly.md").length).toBe(1);
  });

  test("unknown modifier without path-like characters throws", () => {
    expect(() =>
      resolveConfig({ ...baseParsed, customModifiers: ["unknown-modifier"] }, null)
    ).toThrow('Unknown modifier: "unknown-modifier"');
  });

  // debug preset tests
  test("debug preset resolves to collaborative/pragmatic/narrow axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "debug" }, null);
    expect(config.axes).toEqual({ agency: "collaborative", quality: "pragmatic", scope: "narrow" });
  });

  test("debug preset resolves base to chill", () => {
    const config = resolveConfig({ ...baseParsed, preset: "debug" }, null);
    expect(config.base).toBe("chill");
  });

  test("debug preset includes modifiers/debug.md", () => {
    const config = resolveConfig({ ...baseParsed, preset: "debug" }, null);
    expect(config.modifiers).toContain("modifiers/debug.md");
  });

  test("debug --base standard overrides preset base", () => {
    const config = resolveConfig({ ...baseParsed, preset: "debug", base: "standard" }, null);
    expect(config.base).toBe("standard");
  });

  test("debug --agency autonomous overrides preset agency", () => {
    const config = resolveConfig({ ...baseParsed, preset: "debug", overrides: { agency: "autonomous" } }, null);
    expect(config.axes?.agency).toBe("autonomous");
  });

  test("config defaultBase standard overrides debug preset base", () => {
    const loadedConfig: LoadedConfig = {
      configDir: "/tmp/test",
      config: { defaultBase: "standard" },
    };
    const config = resolveConfig({ ...baseParsed, preset: "debug" }, loadedConfig);
    expect(config.base).toBe("standard");
  });

  // methodical preset tests
  test("methodical preset resolves to surgical/architect/narrow axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "methodical" }, null);
    expect(config.axes).toEqual({ agency: "surgical", quality: "architect", scope: "narrow" });
  });

  test("methodical preset resolves base to chill", () => {
    const config = resolveConfig({ ...baseParsed, preset: "methodical" }, null);
    expect(config.base).toBe("chill");
  });

  test("methodical preset includes modifiers/methodical.md", () => {
    const config = resolveConfig({ ...baseParsed, preset: "methodical" }, null);
    expect(config.modifiers).toContain("modifiers/methodical.md");
  });

  test("create --modifier debug adds debug modifier", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create", customModifiers: ["debug"] }, null);
    expect(config.modifiers).toContain("modifiers/debug.md");
  });

  test("create --modifier methodical adds methodical modifier", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create", customModifiers: ["methodical"] }, null);
    expect(config.modifiers).toContain("modifiers/methodical.md");
  });

  // muse preset tests
  test("muse preset resolves to autonomous/architect/unrestricted axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "muse" }, null);
    expect(config.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
  });

  test("muse preset resolves base to chill", () => {
    const config = resolveConfig({ ...baseParsed, preset: "muse" }, null);
    expect(config.base).toBe("chill");
  });

  test("muse preset includes modifiers/muse.md", () => {
    const config = resolveConfig({ ...baseParsed, preset: "muse" }, null);
    expect(config.modifiers).toContain("modifiers/muse.md");
  });

  test("muse --base standard overrides preset base but keeps muse modifier", () => {
    const config = resolveConfig({ ...baseParsed, preset: "muse", base: "standard" }, null);
    expect(config.base).toBe("standard");
    expect(config.modifiers).toContain("modifiers/muse.md");
  });

  test("muse --agency collaborative overrides preset agency", () => {
    const config = resolveConfig({ ...baseParsed, preset: "muse", overrides: { agency: "collaborative" } }, null);
    expect(config.axes?.agency).toBe("collaborative");
    expect(config.modifiers).toContain("modifiers/muse.md");
  });

  test("config defaultBase standard overrides muse preset base", () => {
    const loadedConfig: LoadedConfig = {
      configDir: "/tmp/test",
      config: { defaultBase: "standard" },
    };
    const config = resolveConfig({ ...baseParsed, preset: "muse" }, loadedConfig);
    expect(config.base).toBe("standard");
  });

  test("create --modifier muse adds muse modifier on standard base", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create", customModifiers: ["muse"] }, null);
    expect(config.base).toBe("standard");
    expect(config.modifiers).toContain("modifiers/muse.md");
  });

  test("partner --modifier muse stacks with partner's built-in modifiers", () => {
    const config = resolveConfig({ ...baseParsed, preset: "partner", customModifiers: ["muse"] }, null);
    expect(config.modifiers).toContain("modifiers/speak-plain.md");
    expect(config.modifiers).toContain("modifiers/tdd.md");
    expect(config.modifiers).toContain("modifiers/muse.md");
  });

  test("muse modifier deduplicates if specified twice (preset + --modifier)", () => {
    const config = resolveConfig({ ...baseParsed, preset: "muse", customModifiers: ["muse"] }, null);
    const museOccurrences = config.modifiers.filter((m) => m === "modifiers/muse.md").length;
    expect(museOccurrences).toBe(1);
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

  test("config-defined preset with readonly flag adds readonly modifier", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "readonly-preset": { readonly: true },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "readonly-preset" }, loadedConfig);
    expect(config.modifiers).toContain("modifiers/readonly.md");
  });

  test("config-defined preset with contextPacing flag adds context-pacing modifier", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "pacing-preset": { contextPacing: true },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "pacing-preset" }, loadedConfig);
    expect(config.modifiers).toContain("modifiers/context-pacing.md");
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
    expect(config.modifiers).toContain(`${configDir}/focus-rules.md`);
  });

  test("defaultModifiers from config are always applied", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        defaultModifiers: ["/path/default.md"],
      },
    };
    const config = resolveConfig(baseParsed, loadedConfig);
    expect(config.modifiers).toContain("/path/default.md");
  });

  test("defaultModifiers can include readonly modifier", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        defaultModifiers: ["readonly"],
      },
    };
    const config = resolveConfig(baseParsed, loadedConfig);
    expect(config.modifiers).toContain("modifiers/readonly.md");
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
    const defaultIdx = config.modifiers.indexOf("/path/default.md");
    const cliIdx = config.modifiers.indexOf("/path/cli.md");
    expect(defaultIdx).toBeGreaterThan(-1);
    expect(cliIdx).toBeGreaterThan(-1);
    expect(defaultIdx).toBeLessThan(cliIdx);
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
    const presetIdx = config.modifiers.indexOf("/path/preset.md");
    const cliIdx = config.modifiers.indexOf("/path/cli.md");
    expect(presetIdx).toBeGreaterThan(-1);
    expect(cliIdx).toBeGreaterThan(-1);
    expect(presetIdx).toBeLessThan(cliIdx);
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
    expect(config.modifiers).toContain("modifiers/readonly.md");
    expect(config.modifiers.some((p) => p.endsWith("focus-rules.md"))).toBe(true);
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

describe("resolveConfig — base resolution", () => {
  const configDir = "/tmp/test-config";

  test("no --base, no config defaults to standard", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create" }, null);
    expect(config.base).toBe("standard");
  });

  test("--base chill resolves to chill", () => {
    const config = resolveConfig({ ...baseParsed, base: "chill", preset: "create" }, null);
    expect(config.base).toBe("chill");
  });

  test("--base standard resolves to standard", () => {
    const config = resolveConfig({ ...baseParsed, base: "standard", preset: "create" }, null);
    expect(config.base).toBe("standard");
  });

  test("--base with directory path resolves to absolute path", () => {
    const config = resolveConfig({ ...baseParsed, base: "./my-base/" }, null);
    expect(config.base).toMatch(/^\/.*my-base/);
  });

  test("--base with absolute path resolves as-is", () => {
    const config = resolveConfig({ ...baseParsed, base: "/absolute/my-base" }, null);
    expect(config.base).toBe("/absolute/my-base");
  });

  test("config defaultBase chill used when no CLI --base", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: { defaultBase: "chill" },
    };
    const config = resolveConfig({ ...baseParsed, preset: "create" }, loadedConfig);
    expect(config.base).toBe("chill");
  });

  test("CLI --base overrides config defaultBase", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: { defaultBase: "chill" },
    };
    const config = resolveConfig({ ...baseParsed, base: "standard", preset: "create" }, loadedConfig);
    expect(config.base).toBe("standard");
  });

  test("none preset resolves base correctly", () => {
    const config = resolveConfig({ ...baseParsed, preset: "none" }, null);
    expect(config.base).toBe("standard");
  });

  test("none preset with --base chill resolves to chill", () => {
    const config = resolveConfig({ ...baseParsed, base: "chill", preset: "none" }, null);
    expect(config.base).toBe("chill");
  });

  test("config-defined base name resolves to absolute directory path", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: { bases: { "my-base": "./my-base-dir" } },
    };
    const config = resolveConfig({ ...baseParsed, base: "my-base" }, loadedConfig);
    expect(config.base).toBe(`${configDir}/my-base-dir`);
  });

  test("unknown base name throws descriptive error listing built-in names", () => {
    expect(() =>
      resolveConfig({ ...baseParsed, base: "nonexistent-base" }, null)
    ).toThrow("Unknown --base value");
  });

  test("unknown base name error mentions built-in names", () => {
    expect(() =>
      resolveConfig({ ...baseParsed, base: "nonexistent-base" }, null)
    ).toThrow("standard, chill");
  });

  test("config-defined preset base field is used when no CLI --base", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "chill-preset": {
            base: "chill",
            agency: "collaborative",
            quality: "pragmatic",
            scope: "adjacent",
          },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "chill-preset" }, loadedConfig);
    expect(config.base).toBe("chill");
  });

  test("CLI --base overrides config preset base field", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "chill-preset": {
            base: "chill",
            agency: "collaborative",
          },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, base: "standard", preset: "chill-preset" }, loadedConfig);
    expect(config.base).toBe("standard");
  });

  test("built-in preset without a base field defaults to standard", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create" }, null);
    expect(config.base).toBe("standard");
  });

  test("debug preset uses chill base by default", () => {
    const config = resolveConfig({ ...baseParsed, preset: "debug" }, null);
    expect(config.base).toBe("chill");
  });

  test("methodical preset uses chill base by default", () => {
    const config = resolveConfig({ ...baseParsed, preset: "methodical" }, null);
    expect(config.base).toBe("chill");
  });

  test("config defaultBase overrides debug preset base", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: { defaultBase: "standard" },
    };
    const config = resolveConfig({ ...baseParsed, preset: "debug" }, loadedConfig);
    expect(config.base).toBe("standard");
  });

  test("CLI --base overrides debug preset base", () => {
    const config = resolveConfig({ ...baseParsed, preset: "debug", base: "standard" }, null);
    expect(config.base).toBe("standard");
  });
});
