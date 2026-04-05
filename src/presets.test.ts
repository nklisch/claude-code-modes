import { describe, test, expect } from "bun:test";
import { getPreset, isPresetName } from "./presets.js";
import { PRESET_NAMES } from "./types.js";

describe("getPreset", () => {
  test("create has autonomous/architect/unrestricted", () => {
    const p = getPreset("create");
    expect(p.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
    expect(p.readonly).toBe(false);
  });

  test("extend has autonomous/pragmatic/adjacent", () => {
    const p = getPreset("extend");
    expect(p.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "adjacent" });
    expect(p.readonly).toBe(false);
  });

  test("safe has collaborative/minimal/narrow", () => {
    const p = getPreset("safe");
    expect(p.axes).toEqual({ agency: "collaborative", quality: "minimal", scope: "narrow" });
    expect(p.readonly).toBe(false);
  });

  test("refactor has autonomous/pragmatic/unrestricted", () => {
    const p = getPreset("refactor");
    expect(p.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "unrestricted" });
    expect(p.readonly).toBe(false);
  });

  test("explore has collaborative/architect/narrow and readonly", () => {
    const p = getPreset("explore");
    expect(p.axes).toEqual({ agency: "collaborative", quality: "architect", scope: "narrow" });
    expect(p.readonly).toBe(true);
  });

  test("none has null axes and no readonly", () => {
    const p = getPreset("none");
    expect(p.axes).toBeNull();
    expect(p.readonly).toBe(false);
  });

  test("all PRESET_NAMES have definitions", () => {
    for (const name of PRESET_NAMES) {
      expect(getPreset(name)).toBeDefined();
    }
  });
});

describe("isPresetName", () => {
  test("returns true for valid preset names", () => {
    expect(isPresetName("create")).toBe(true);
    expect(isPresetName("extend")).toBe(true);
    expect(isPresetName("safe")).toBe(true);
    expect(isPresetName("refactor")).toBe(true);
    expect(isPresetName("explore")).toBe(true);
    expect(isPresetName("none")).toBe(true);
  });

  test("returns false for invalid names", () => {
    expect(isPresetName("invalid")).toBe(false);
    expect(isPresetName("")).toBe(false);
    expect(isPresetName("CREATE")).toBe(false);
  });
});
