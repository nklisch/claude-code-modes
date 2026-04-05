import { describe, test, expect } from "bun:test";
import { parseCliArgs } from "./args.js";

describe("parseCliArgs", () => {
  test("parses preset only", () => {
    const result = parseCliArgs(["create"]);
    expect(result.preset).toBe("create");
    expect(result.overrides).toEqual({});
    expect(result.passthroughArgs).toEqual([]);
  });

  test("parses preset with axis override", () => {
    const result = parseCliArgs(["create", "--agency", "collaborative"]);
    expect(result.preset).toBe("create");
    expect(result.overrides.agency).toBe("collaborative");
  });

  test("parses all axis overrides without preset", () => {
    const result = parseCliArgs(["--agency", "autonomous", "--quality", "architect", "--scope", "unrestricted"]);
    expect(result.preset).toBeNull();
    expect(result.overrides).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
  });

  test("captures passthrough args after --", () => {
    const result = parseCliArgs(["create", "--", "--verbose", "--model", "sonnet"]);
    expect(result.preset).toBe("create");
    expect(result.passthroughArgs).toEqual(["--verbose", "--model", "sonnet"]);
  });

  test("passes through unknown boolean flags", () => {
    const result = parseCliArgs(["create", "--verbose"]);
    expect(result.passthroughArgs).toContain("--verbose");
  });

  test("throws on --system-prompt", () => {
    expect(() => parseCliArgs(["create", "--system-prompt", "foo"])).toThrow("Cannot use --system-prompt");
  });

  test("throws on --system-prompt-file", () => {
    expect(() => parseCliArgs(["create", "--system-prompt-file", "foo.md"])).toThrow("Cannot use --system-prompt");
  });

  test("throws on invalid agency", () => {
    expect(() => parseCliArgs(["--agency", "invalid"])).toThrow('Invalid --agency value: "invalid"');
  });

  test("throws on invalid quality", () => {
    expect(() => parseCliArgs(["--quality", "invalid"])).toThrow('Invalid --quality value: "invalid"');
  });

  test("throws on invalid scope", () => {
    expect(() => parseCliArgs(["--scope", "invalid"])).toThrow('Invalid --scope value: "invalid"');
  });

  test("parses --readonly modifier", () => {
    const result = parseCliArgs(["create", "--readonly"]);
    expect(result.modifiers.readonly).toBe(true);
  });

  test("parses --print modifier", () => {
    const result = parseCliArgs(["create", "--print"]);
    expect(result.modifiers.print).toBe(true);
  });

  test("captures --append-system-prompt", () => {
    const result = parseCliArgs(["create", "--append-system-prompt", "extra stuff"]);
    expect(result.forwarded.appendSystemPrompt).toBe("extra stuff");
  });

  test("captures --append-system-prompt-file", () => {
    const result = parseCliArgs(["create", "--append-system-prompt-file", "/path/to/file.md"]);
    expect(result.forwarded.appendSystemPromptFile).toBe("/path/to/file.md");
  });

  test("none preset recognized", () => {
    const result = parseCliArgs(["none"]);
    expect(result.preset).toBe("none");
  });

  test("empty args returns no preset", () => {
    const result = parseCliArgs([]);
    expect(result.preset).toBeNull();
  });
});
