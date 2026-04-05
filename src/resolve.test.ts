import { describe, test, expect } from "bun:test";
import { resolveConfig } from "./resolve.js";
import type { ParsedArgs } from "./args.js";

const baseParsed: ParsedArgs = {
  preset: null,
  overrides: {},
  modifiers: { readonly: false, print: false, contextPacing: false },
  forwarded: {},
  passthroughArgs: [],
};

describe("resolveConfig", () => {
  test("preset with no overrides returns preset axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create" });
    expect(config.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
  });

  test("preset with partial override merges", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "create",
      overrides: { quality: "pragmatic" },
    });
    expect(config.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "unrestricted" });
  });

  test("no preset uses defaults", () => {
    const config = resolveConfig(baseParsed);
    expect(config.axes).toEqual({ agency: "collaborative", quality: "pragmatic", scope: "adjacent" });
  });

  test("no preset with partial overrides fills from defaults", () => {
    const config = resolveConfig({ ...baseParsed, overrides: { agency: "autonomous" } });
    expect(config.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "adjacent" });
  });

  test("none preset returns null axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "none" });
    expect(config.axes).toBeNull();
  });

  test("explore preset returns readonly true", () => {
    const config = resolveConfig({ ...baseParsed, preset: "explore" });
    expect(config.modifiers.readonly).toBe(true);
  });

  test("--readonly flag on any preset", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "create",
      modifiers: { readonly: true, print: false, contextPacing: false },
    });
    expect(config.modifiers.readonly).toBe(true);
  });

  test("explore without --readonly is still readonly", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "explore",
      modifiers: { readonly: false, print: false, contextPacing: false },
    });
    expect(config.modifiers.readonly).toBe(true);
  });
});
