import { describe, test, expect } from "bun:test";
import { resolveConfig as resolveWithModel } from "./resolve.js";
import type { ParsedArgs } from "./args.js";
import type { LoadedConfig } from "./config.js";
import type { ModelInfo } from "./types.js";

// Carries no prompt capabilities, so `auto` lands on the standard base
const PLAIN_MODEL: ModelInfo = { name: "Sonnet 5", id: "claude-sonnet-5", cutoff: "January 2026" };
const LEAN_MODEL: ModelInfo = {
  name: "Opus 4.8",
  id: "claude-opus-4-8",
  cutoff: "January 2026",
  capabilities: ["lean-prompt"],
};
const BUNDLE_MODEL: ModelInfo = {
  name: "Opus 5",
  id: "claude-opus-5",
  cutoff: "May 2026",
  capabilities: ["lean-prompt", "mid-conv-system"],
  promptBundle: ["delivering-work", "corrections", "tool-restraint"],
};
const PARTIAL_BUNDLE_MODEL: ModelInfo = {
  name: "Fable 5.1",
  id: "claude-fable-5-1",
  cutoff: "June 2026",
  capabilities: ["lean-prompt", "mid-conv-system"],
  promptBundle: ["delivering-work"],
};

// Most cases don't care about the model; default to one that keeps the standard base
function resolveConfig(
  parsed: ParsedArgs,
  loadedConfig: LoadedConfig | null = null,
  model: ModelInfo = PLAIN_MODEL,
) {
  return resolveWithModel(parsed, loadedConfig, model);
}

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

  // flow preset tests — depth-but-bounded counterpoint to muse
  test("flow preset resolves to autonomous/architect/adjacent axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "flow" }, null);
    expect(config.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "adjacent" });
  });

  test("flow preset resolves base to flow", () => {
    const config = resolveConfig({ ...baseParsed, preset: "flow" }, null);
    expect(config.base).toBe("flow");
  });

  test("flow preset includes modifiers/flow.md", () => {
    const config = resolveConfig({ ...baseParsed, preset: "flow" }, null);
    expect(config.modifiers).toContain("modifiers/flow.md");
  });

  test("flow --base standard overrides preset base but keeps flow modifier", () => {
    const config = resolveConfig({ ...baseParsed, preset: "flow", base: "standard" }, null);
    expect(config.base).toBe("standard");
    expect(config.modifiers).toContain("modifiers/flow.md");
  });

  test("flow --scope unrestricted overrides preset scope", () => {
    const config = resolveConfig({ ...baseParsed, preset: "flow", overrides: { scope: "unrestricted" } }, null);
    expect(config.axes?.scope).toBe("unrestricted");
    expect(config.modifiers).toContain("modifiers/flow.md");
  });

  test("flow --modifier playful stacks with flow's built-in modifier", () => {
    const config = resolveConfig({ ...baseParsed, preset: "flow", customModifiers: ["playful"] }, null);
    expect(config.modifiers).toContain("modifiers/flow.md");
    expect(config.modifiers).toContain("modifiers/playful.md");
  });

  test("flow modifier deduplicates if specified twice (preset + --modifier)", () => {
    const config = resolveConfig({ ...baseParsed, preset: "flow", customModifiers: ["flow"] }, null);
    const flowOccurrences = config.modifiers.filter((m) => m === "modifiers/flow.md").length;
    expect(flowOccurrences).toBe(1);
  });

  // tinker preset tests — flow + playful, loose prototyping mode
  test("tinker preset resolves to autonomous/pragmatic/unrestricted axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "tinker" }, null);
    expect(config.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "unrestricted" });
  });

  test("tinker preset resolves base to flow", () => {
    const config = resolveConfig({ ...baseParsed, preset: "tinker" }, null);
    expect(config.base).toBe("flow");
  });

  test("tinker preset includes both flow and playful modifiers", () => {
    const config = resolveConfig({ ...baseParsed, preset: "tinker" }, null);
    expect(config.modifiers).toContain("modifiers/flow.md");
    expect(config.modifiers).toContain("modifiers/playful.md");
  });

  test("tinker --quality architect overrides preset quality but keeps both modifiers", () => {
    const config = resolveConfig({ ...baseParsed, preset: "tinker", overrides: { quality: "architect" } }, null);
    expect(config.axes?.quality).toBe("architect");
    expect(config.modifiers).toContain("modifiers/flow.md");
    expect(config.modifiers).toContain("modifiers/playful.md");
  });

  // spark preset tests — muse + playful, maximum expression
  test("spark preset resolves to autonomous/architect/unrestricted axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "spark" }, null);
    expect(config.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
  });

  test("spark preset resolves base to chill", () => {
    const config = resolveConfig({ ...baseParsed, preset: "spark" }, null);
    expect(config.base).toBe("chill");
  });

  test("spark preset includes both muse and playful modifiers", () => {
    const config = resolveConfig({ ...baseParsed, preset: "spark" }, null);
    expect(config.modifiers).toContain("modifiers/muse.md");
    expect(config.modifiers).toContain("modifiers/playful.md");
  });

  test("spark --base standard overrides preset base but keeps both modifiers", () => {
    const config = resolveConfig({ ...baseParsed, preset: "spark", base: "standard" }, null);
    expect(config.base).toBe("standard");
    expect(config.modifiers).toContain("modifiers/muse.md");
    expect(config.modifiers).toContain("modifiers/playful.md");
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

describe("resolveConfig — style resolution", () => {
  const configDir = "/tmp/test-config";

  test("no --style, no config resolves to null", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create" }, null);
    expect(config.style).toBeNull();
  });

  test("built-in styles resolve by name", () => {
    const declaudified = resolveConfig({ ...baseParsed, style: "declaudified", preset: "create" }, null);
    const straight = resolveConfig({ ...baseParsed, style: "straight", preset: "create" }, null);
    expect(declaudified.style).toBe("declaudified");
    expect(straight.style).toBe("straight");
  });

  test("--style with file path resolves to absolute path", () => {
    const config = resolveConfig({ ...baseParsed, style: "/absolute/my-style.md" }, null);
    expect(config.style).toBe("/absolute/my-style.md");
  });

  test("--style with relative path resolves to absolute path", () => {
    const config = resolveConfig({ ...baseParsed, style: "./my-style.md" }, null);
    expect(config.style).toMatch(/^\/.*my-style\.md$/);
  });

  test("config-defined style name resolves to absolute path", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: { styles: { "team": "./team-style.md" } },
    };
    const config = resolveConfig({ ...baseParsed, style: "team" }, loadedConfig);
    expect(config.style).toBe(`${configDir}/team-style.md`);
  });

  test("config defaultStyle used when no CLI --style", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: { defaultStyle: "declaudified" },
    };
    const config = resolveConfig({ ...baseParsed, preset: "create" }, loadedConfig);
    expect(config.style).toBe("declaudified");
  });

  test("CLI --style overrides config defaultStyle", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: { defaultStyle: "declaudified", styles: { "team": "./team-style.md" } },
    };
    const config = resolveConfig({ ...baseParsed, style: "team", preset: "create" }, loadedConfig);
    expect(config.style).toBe(`${configDir}/team-style.md`);
  });

  test("unknown style name throws descriptive error listing built-in names", () => {
    expect(() =>
      resolveConfig({ ...baseParsed, style: "nonexistent-style" }, null)
    ).toThrow('Unknown --style value: "nonexistent-style"');
  });

  test("unknown style error mentions built-in names", () => {
    expect(() =>
      resolveConfig({ ...baseParsed, style: "nonexistent-style" }, null)
    ).toThrow("declaudified, straight");
  });

  test("none preset resolves style to null by default", () => {
    const config = resolveConfig({ ...baseParsed, preset: "none" }, null);
    expect(config.style).toBeNull();
  });

  test("none preset honors explicit --style", () => {
    const config = resolveConfig({ ...baseParsed, style: "declaudified", preset: "none" }, null);
    expect(config.style).toBe("declaudified");
  });

  test("none preset honors config defaultStyle", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: { defaultStyle: "declaudified" },
    };
    const config = resolveConfig({ ...baseParsed, preset: "none" }, loadedConfig);
    expect(config.style).toBe("declaudified");
  });

  test("config-defined preset style field is used when no CLI --style", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        styles: { "team": "./team-style.md" },
        presets: {
          "team-preset": {
            agency: "collaborative",
            style: "team",
          },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "team-preset" }, loadedConfig);
    expect(config.style).toBe(`${configDir}/team-style.md`);
  });

  test("CLI --style overrides config preset style field", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        presets: {
          "team-preset": { style: "declaudified" },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, style: "/cli/style.md", preset: "team-preset" }, loadedConfig);
    expect(config.style).toBe("/cli/style.md");
  });

  test("config defaultStyle overrides preset style field", () => {
    const loadedConfig: LoadedConfig = {
      configDir,
      config: {
        defaultStyle: "declaudified",
        styles: { "team": "./team-style.md" },
        presets: {
          "team-preset": { style: "team" },
        },
      },
    };
    const config = resolveConfig({ ...baseParsed, preset: "team-preset" }, loadedConfig);
    expect(config.style).toBe("declaudified");
  });
});

describe("resolveBase — model-driven selection", () => {
  test("defaults to lean for a model carrying the lean-prompt capability", () => {
    expect(resolveConfig(baseParsed, null, LEAN_MODEL).base).toBe("lean");
  });

  test("defaults to standard for a model without the capability", () => {
    expect(resolveConfig(baseParsed, null, PLAIN_MODEL).base).toBe("standard");
  });

  test("an explicit --base auto resolves the same way as no --base", () => {
    const auto = resolveConfig({ ...baseParsed, base: "auto" }, null, LEAN_MODEL);
    expect(auto.base).toBe(resolveConfig(baseParsed, null, LEAN_MODEL).base);
  });

  test("an explicit --base wins over model detection", () => {
    expect(resolveConfig({ ...baseParsed, base: "chill" }, null, LEAN_MODEL).base).toBe("chill");
  });

  test("config defaultBase wins over model detection", () => {
    const loadedConfig: LoadedConfig = { configDir: "/cfg", config: { defaultBase: "flow" } };
    expect(resolveConfig(baseParsed, loadedConfig, LEAN_MODEL).base).toBe("flow");
  });

  test("config defaultBase can opt back into model detection", () => {
    const loadedConfig: LoadedConfig = { configDir: "/cfg", config: { defaultBase: "auto" } };
    expect(resolveConfig(baseParsed, loadedConfig, LEAN_MODEL).base).toBe("lean");
  });

  test("none preset still gets a model-selected base", () => {
    expect(resolveConfig({ ...baseParsed, preset: "none" }, null, LEAN_MODEL).base).toBe("lean");
  });
});

describe("resolveConfig — prompt-bundle modifiers", () => {
  test("a bundle-capable model adds the three bundle modifiers in upstream order", () => {
    const config = resolveConfig(baseParsed, null, BUNDLE_MODEL);
    expect(config.modifiers).toEqual([
      "modifiers/delivering-work.md",
      "modifiers/corrections.md",
      "modifiers/tool-restraint.md",
    ]);
  });

  test("a model's bundle adds only the modifiers it lists", () => {
    const config = resolveConfig(baseParsed, null, PARTIAL_BUNDLE_MODEL);
    expect(config.modifiers).toEqual(["modifiers/delivering-work.md"]);
  });

  test("a lean model without a bundle gets none of them", () => {
    expect(resolveConfig(baseParsed, null, LEAN_MODEL).modifiers).toEqual([]);
  });

  test("an explicit --base opts out of the bundle", () => {
    const config = resolveConfig({ ...baseParsed, base: "lean" }, null, BUNDLE_MODEL);
    expect(config.modifiers).toEqual([]);
  });

  test("bundle modifiers come before user modifiers", () => {
    const config = resolveConfig(
      { ...baseParsed, customModifiers: ["debug"] },
      null,
      BUNDLE_MODEL,
    );
    expect(config.modifiers[0]).toBe("modifiers/delivering-work.md");
    expect(config.modifiers.at(-1)).toBe("modifiers/debug.md");
  });

  test("none preset does not pull in bundle modifiers", () => {
    const config = resolveConfig({ ...baseParsed, preset: "none" }, null, BUNDLE_MODEL);
    expect(config.modifiers).toEqual([]);
  });
});
