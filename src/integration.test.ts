import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { assemblePrompt } from "./assemble.js";
import { detectEnv, buildTemplateVars } from "./env.js";
import { getPreset } from "./presets.js";
import { PRESET_NAMES } from "./types.js";
import type { ModeConfig } from "./types.js";

const PROMPTS_DIR = join(import.meta.dir, "..", "prompts");

describe("full assembly integration", () => {
  test("none mode produces valid prompt with real env", () => {
    const env = detectEnv();
    const vars = buildTemplateVars(env);
    const result = assemblePrompt({
      mode: { axes: null, modifiers: { readonly: false, contextPacing: false } },
      templateVars: vars,
      promptsDir: PROMPTS_DIR,
    });

    // No unreplaced vars
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);

    // Contains actual CWD
    expect(result).toContain(process.cwd());

    // Contains all major sections
    expect(result).toContain("# System");
    expect(result).toContain("# Doing tasks");
    expect(result).toContain("# Executing actions with care");
    expect(result).toContain("# Using your tools");
    expect(result).toContain("# Tone and style");
    expect(result).toContain("# Session-specific guidance");
    expect(result).toContain("# Environment");
  });

  test("none mode with readonly includes readonly modifier", () => {
    const env = detectEnv();
    const vars = buildTemplateVars(env);
    const result = assemblePrompt({
      mode: { axes: null, modifiers: { readonly: true, contextPacing: false } },
      templateVars: vars,
      promptsDir: PROMPTS_DIR,
    });

    expect(result).toContain("# Read-only mode");
  });
});

describe("preset assembly integration", () => {
  const env = detectEnv();
  const vars = buildTemplateVars(env);

  for (const presetName of PRESET_NAMES) {
    test(`${presetName} preset assembles without errors`, () => {
      const preset = getPreset(presetName);
      const mode: ModeConfig = {
        axes: preset.axes,
        modifiers: { readonly: preset.readonly, contextPacing: false },
      };
      const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
    });
  }

  test("create contains architect quality content", () => {
    const preset = getPreset("create");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly, contextPacing: false } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("# Quality: Architect");
    expect(result).toContain("# Agency: Autonomous");
    expect(result).toContain("# Scope: Unrestricted");
    expect(result).not.toContain("# Quality: Minimal");
    expect(result).not.toContain("# Quality: Pragmatic");
  });

  test("safe contains minimal quality and cautious actions", () => {
    const preset = getPreset("safe");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly, contextPacing: false } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("# Quality: Minimal");
    expect(result).toContain("# Agency: Collaborative");
    expect(result).toContain("# Scope: Narrow");
    expect(result).toContain("# Executing actions with care");
    expect(result).toContain("measure twice, cut once");
  });

  test("create uses autonomous actions, not cautious", () => {
    const preset = getPreset("create");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly, contextPacing: false } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("act freely without confirmation");
    expect(result).not.toContain("measure twice, cut once");
  });

  test("explore includes readonly modifier", () => {
    const preset = getPreset("explore");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly, contextPacing: false } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("Read-only mode");
    expect(result).toContain("Do NOT create, edit, move, or delete any files");
  });

  test("none mode has no axis headers", () => {
    const preset = getPreset("none");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly, contextPacing: false } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).not.toContain("# Agency:");
    expect(result).not.toContain("# Quality:");
    expect(result).not.toContain("# Scope:");
  });

  test("presets exclude context pacing by default, include when opted in", () => {
    const preset = getPreset("create");
    const without: ModeConfig = { axes: preset.axes, modifiers: { readonly: false, contextPacing: false } };
    expect(assemblePrompt({ mode: without, templateVars: vars, promptsDir: PROMPTS_DIR })).not.toContain("# Context and pacing");

    const withPacing: ModeConfig = { axes: preset.axes, modifiers: { readonly: false, contextPacing: true } };
    expect(assemblePrompt({ mode: withPacing, templateVars: vars, promptsDir: PROMPTS_DIR })).toContain("# Context and pacing");
  });

  test("axis override on preset works", () => {
    const preset = getPreset("create");
    // Override quality from architect to pragmatic
    const mode: ModeConfig = {
      axes: { ...preset.axes!, quality: "pragmatic" },
      modifiers: { readonly: false, contextPacing: false },
    };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("# Quality: Pragmatic");
    expect(result).not.toContain("# Quality: Architect");
    // Agency and scope should still be from create
    expect(result).toContain("# Agency: Autonomous");
    expect(result).toContain("# Scope: Unrestricted");
  });
});
