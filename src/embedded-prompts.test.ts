import { describe, test, expect } from "bun:test";
import { EMBEDDED_PROMPTS } from "./embedded-prompts.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getFragmentOrder } from "./assemble.js";
import type { ModeConfig } from "./types.js";

const PROMPTS_DIR = join(import.meta.dir, "..", "prompts");

const EXPECTED_FRAGMENTS = [
  "base/intro.md",
  "base/system.md",
  "base/doing-tasks.md",
  "base/actions-autonomous.md",
  "base/actions-cautious.md",
  "base/tools.md",
  "base/tone.md",
  "base/session-guidance.md",
  "base/env.md",
  "axis/agency/autonomous.md",
  "axis/agency/collaborative.md",
  "axis/agency/surgical.md",
  "axis/quality/architect.md",
  "axis/quality/pragmatic.md",
  "axis/quality/minimal.md",
  "axis/scope/unrestricted.md",
  "axis/scope/adjacent.md",
  "axis/scope/narrow.md",
  "modifiers/readonly.md",
  "modifiers/context-pacing.md",
] as const;

describe("EMBEDDED_PROMPTS", () => {
  test("contains exactly 20 fragments", () => {
    expect(Object.keys(EMBEDDED_PROMPTS).length).toBe(20);
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

  test("all fragment keys used by getFragmentOrder are in EMBEDDED_PROMPTS", () => {
    // Spec: every built-in relative path from getFragmentOrder must be embeddable
    const modes: ModeConfig[] = [
      // none mode
      { axes: null, modifiers: { readonly: true, contextPacing: true, custom: [] } },
      // create preset
      {
        axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
        modifiers: { readonly: false, contextPacing: false, custom: [] },
      },
      // safe preset
      {
        axes: { agency: "collaborative", quality: "minimal", scope: "narrow" },
        modifiers: { readonly: false, contextPacing: false, custom: [] },
      },
      // surgical agency (tests actions-cautious path)
      {
        axes: { agency: "surgical", quality: "pragmatic", scope: "adjacent" },
        modifiers: { readonly: false, contextPacing: false, custom: [] },
      },
    ];
    for (const mode of modes) {
      const paths = getFragmentOrder(mode);
      for (const p of paths) {
        // Only check relative paths (built-in fragments)
        if (!p.startsWith("/")) {
          expect(p in EMBEDDED_PROMPTS).toBe(true);
        }
      }
    }
  });
});
