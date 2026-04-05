import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { AssembleOptions, TemplateVars, ModeConfig } from "./types.js";

/**
 * Reads a prompt fragment from the prompts directory.
 * Returns the content or null if the file doesn't exist.
 */
export function readFragment(promptsDir: string, relativePath: string): string | null {
  const fullPath = resolve(promptsDir, relativePath);
  try {
    return readFileSync(fullPath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Replaces all {{VAR}} placeholders in a string with values from templateVars.
 * Throws if any unreplaced {{VAR}} patterns remain.
 */
export function substituteTemplateVars(content: string, vars: TemplateVars): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  // Check for unreplaced template variables
  const unreplaced = result.match(/\{\{[A-Z_]+\}\}/g);
  if (unreplaced) {
    throw new Error(
      `Unreplaced template variables in prompt: ${[...new Set(unreplaced)].join(", ")}`
    );
  }

  return result;
}

/**
 * Returns the ordered list of fragment relative paths for the given mode config.
 */
export function getFragmentOrder(mode: ModeConfig): string[] {
  const fragments: string[] = [
    "base/intro.md",
    "base/system.md",
  ];

  // Axis fragments — skipped for "none" mode (axes is null)
  if (mode.axes) {
    fragments.push(`axis/agency/${mode.axes.agency}.md`);
    fragments.push(`axis/quality/${mode.axes.quality}.md`);
    fragments.push(`axis/scope/${mode.axes.scope}.md`);
  }

  // Base behavioral-neutral sections
  fragments.push("base/doing-tasks.md");

  // Actions variant based on agency
  if (mode.axes && mode.axes.agency === "autonomous") {
    fragments.push("base/actions-autonomous.md");
  } else {
    fragments.push("base/actions-cautious.md");
  }

  fragments.push("base/tools.md");
  fragments.push("base/tone.md");
  fragments.push("base/session-guidance.md");

  // Context pacing — opt-in with --context-pacing
  if (mode.modifiers.contextPacing) {
    fragments.push("modifiers/context-pacing.md");
  }

  // Conditional modifiers
  if (mode.modifiers.readonly) {
    fragments.push("modifiers/readonly.md");
  }

  // Environment info — always last (contains template variables)
  fragments.push("base/env.md");

  return fragments;
}

/**
 * Assembles all fragments into a single prompt string.
 */
export function assemblePrompt(options: AssembleOptions): string {
  const { mode, templateVars, promptsDir } = options;
  const fragmentPaths = getFragmentOrder(mode);

  const sections: string[] = [];
  for (const relPath of fragmentPaths) {
    const content = readFragment(promptsDir, relPath);
    if (content === null) {
      throw new Error(`Missing prompt fragment: ${relPath}`);
    }
    sections.push(content.trim());
  }

  const joined = sections.join("\n\n");
  return substituteTemplateVars(joined, templateVars);
}

/**
 * Writes the assembled prompt to a temp file and returns the file path.
 */
export function writeTempPrompt(content: string): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "claude-mode-"));
  const filePath = join(tmpDir, "prompt.md");
  writeFileSync(filePath, content, "utf8");
  return filePath;
}
