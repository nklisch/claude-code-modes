import { describe, test, expect } from "bun:test";
import { getPreset, isPresetName } from "./presets.js";
import { PRESET_NAMES } from "./types.js";

describe("getPreset", () => {
  test("create has autonomous/architect/unrestricted", () => {
    const p = getPreset("create");
    expect(p.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
    expect(p.readonly).toBe(false);
  });

  test("create has no base and empty modifiers", () => {
    const p = getPreset("create");
    expect(p.base).toBeUndefined();
    expect(p.modifiers).toEqual([]);
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

  test("debug has collaborative/pragmatic/narrow", () => {
    const p = getPreset("debug");
    expect(p.axes).toEqual({ agency: "collaborative", quality: "pragmatic", scope: "narrow" });
    expect(p.readonly).toBe(false);
  });

  test("debug has base chill and modifiers ['debug']", () => {
    const p = getPreset("debug");
    expect(p.base).toBe("chill");
    expect(p.modifiers).toEqual(["debug"]);
  });

  test("methodical has surgical/architect/narrow", () => {
    const p = getPreset("methodical");
    expect(p.axes).toEqual({ agency: "surgical", quality: "architect", scope: "narrow" });
    expect(p.readonly).toBe(false);
  });

  test("methodical has base chill and modifiers ['methodical']", () => {
    const p = getPreset("methodical");
    expect(p.base).toBe("chill");
    expect(p.modifiers).toEqual(["methodical"]);
  });

  test("partner has partner/pragmatic/adjacent", () => {
    const p = getPreset("partner");
    expect(p.axes).toEqual({ agency: "partner", quality: "pragmatic", scope: "adjacent" });
    expect(p.readonly).toBe(false);
  });

  test("partner has base chill and modifiers ['speak-plain', 'tdd']", () => {
    const p = getPreset("partner");
    expect(p.base).toBe("chill");
    expect(p.modifiers).toEqual(["speak-plain", "tdd"]);
  });

  test("muse has autonomous/architect/unrestricted", () => {
    const p = getPreset("muse");
    expect(p.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
    expect(p.readonly).toBe(false);
  });

  test("muse has base chill and modifiers ['muse']", () => {
    const p = getPreset("muse");
    expect(p.base).toBe("chill");
    expect(p.modifiers).toEqual(["muse"]);
  });

  test("all PRESET_NAMES have definitions", () => {
    for (const name of PRESET_NAMES) {
      expect(getPreset(name)).toBeDefined();
    }
  });

  test("all existing presets have a modifiers array", () => {
    for (const name of PRESET_NAMES) {
      const p = getPreset(name);
      expect(Array.isArray(p.modifiers)).toBe(true);
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
    expect(isPresetName("debug")).toBe(true);
    expect(isPresetName("methodical")).toBe(true);
    expect(isPresetName("director")).toBe(true);
    expect(isPresetName("partner")).toBe(true);
    expect(isPresetName("muse")).toBe(true);
  });

  test("returns false for invalid names", () => {
    expect(isPresetName("invalid")).toBe(false);
    expect(isPresetName("")).toBe(false);
    expect(isPresetName("CREATE")).toBe(false);
  });
});
