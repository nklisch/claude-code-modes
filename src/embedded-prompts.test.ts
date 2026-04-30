import { describe, test, expect } from "bun:test";
import { EMBEDDED_PROMPTS } from "./embedded-prompts.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getFragmentOrder } from "./assemble.js";
import type { ModeConfig } from "./types.js";

const PROMPTS_DIR = join(import.meta.dir, "..", "prompts");

const EXPECTED_FRAGMENTS = [
  // Standard base fragments
  "base/intro.md",
  "base/system.md",
  "base/doing-tasks.md",
  "base/actions.md",
  "base/tools.md",
  "base/tone.md",
  "base/text-output.md",
  "base/session-guidance.md",
  "base/env.md",
  // Standard base manifest
  "base/base.json",
  // Chill base
  "chill/base.json",
  "chill/core.md",
  "chill/actions.md",
  "chill/tools.md",
  "chill/env.md",
  // Axis fragments
  "axis/agency/autonomous.md",
  "axis/agency/collaborative.md",
  "axis/agency/surgical.md",
  "axis/agency/partner.md",
  "axis/quality/architect.md",
  "axis/quality/pragmatic.md",
  "axis/quality/minimal.md",
  "axis/scope/unrestricted.md",
  "axis/scope/adjacent.md",
  "axis/scope/narrow.md",
  // Modifiers
  "modifiers/readonly.md",
  "modifiers/context-pacing.md",
  "modifiers/debug.md",
  "modifiers/methodical.md",
  "modifiers/director.md",
  "modifiers/bold.md",
  "modifiers/speak-plain.md",
  "modifiers/tdd.md",
] as const;

describe("EMBEDDED_PROMPTS", () => {
  test("contains exactly 33 fragments", () => {
    expect(Object.keys(EMBEDDED_PROMPTS).length).toBe(33);
  });

  test("all expected fragment keys are present", () => {
    for (const path of EXPECTED_FRAGMENTS) {
      expect(path in EMBEDDED_PROMPTS).toBe(true);
    }
  });

  test("each embedded value matches disk content exactly", () => {
    for (const relativePath of EXPECTED_FRAGMENTS) {
      const diskContent = readFileSync(join(PROMPTS_DIR, relativePath), "utf8");
      expect(EMBEDDED_PROMPTS[relativePath]).toBe(diskContent);
    }
  });

  test("no fragment value is empty", () => {
    for (const [key, value] of Object.entries(EMBEDDED_PROMPTS)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test("removed action variants are not in embedded map", () => {
    expect("base/actions-autonomous.md" in EMBEDDED_PROMPTS).toBe(false);
    expect("base/actions-cautious.md" in EMBEDDED_PROMPTS).toBe(false);
  });

  test("manifests are embedded and parseable as JSON", () => {
    const standardManifest = JSON.parse(EMBEDDED_PROMPTS["base/base.json"]);
    expect(Array.isArray(standardManifest)).toBe(true);
    expect(standardManifest).toContain("axes");
    expect(standardManifest).toContain("modifiers");

    const chillManifest = JSON.parse(EMBEDDED_PROMPTS["chill/base.json"]);
    expect(Array.isArray(chillManifest)).toBe(true);
    expect(chillManifest).toContain("axes");
    expect(chillManifest).toContain("modifiers");
  });

  test("all fragment keys used by getFragmentOrder are in EMBEDDED_PROMPTS", () => {
    // Spec: every built-in relative path from getFragmentOrder must be embeddable
    const modes: ModeConfig[] = [
      // none mode — standard base, with built-in modifiers
      { base: "standard", axes: null, modifiers: ["modifiers/readonly.md", "modifiers/context-pacing.md"] },
      // create preset — standard base
      {
        base: "standard",
        axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
        modifiers: [],
      },
      // safe preset — standard base
      {
        base: "standard",
        axes: { agency: "collaborative", quality: "minimal", scope: "narrow" },
        modifiers: [],
      },
      // surgical agency — standard base
      {
        base: "standard",
        axes: { agency: "surgical", quality: "pragmatic", scope: "adjacent" },
        modifiers: [],
      },
      // none mode — chill base
      { base: "chill", axes: null, modifiers: [] },
      // create preset — chill base
      {
        base: "chill",
        axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
        modifiers: [],
      },
      // debug preset — chill base with debug modifier
      {
        base: "chill",
        axes: { agency: "collaborative", quality: "pragmatic", scope: "narrow" },
        modifiers: ["modifiers/debug.md"],
      },
      // methodical preset — chill base with methodical modifier
      {
        base: "chill",
        axes: { agency: "surgical", quality: "architect", scope: "narrow" },
        modifiers: ["modifiers/methodical.md"],
      },
      // partner preset — chill base, partner agency, speak-plain + tdd modifiers
      {
        base: "chill",
        axes: { agency: "partner", quality: "pragmatic", scope: "adjacent" },
        modifiers: ["modifiers/speak-plain.md", "modifiers/tdd.md"],
      },
    ];
    for (const mode of modes) {
      const paths = getFragmentOrder(mode, PROMPTS_DIR);
      for (const p of paths) {
        // Only check relative paths (built-in fragments)
        if (!p.startsWith("/")) {
          expect(p in EMBEDDED_PROMPTS).toBe(true);
        }
      }
    }
  });
});
