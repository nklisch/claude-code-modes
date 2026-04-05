import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import type { AssembleOptions, TemplateVars, ModeConfig } from "./types.js";
import { AGENCY_VALUES } from "./types.js";

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
 * Returns the ordered list of fragment paths for the given mode config.
 * Built-in fragments are relative paths; custom fragments are absolute paths.
 */
export function getFragmentOrder(mode: ModeConfig): string[] {
  const fragments: string[] = [
    "base/intro.md",
    "base/system.md",
  ];

  // Axis fragments — skipped for "none" mode (axes is null)
  if (mode.axes) {
    for (const [axis, value] of [
      ["agency", mode.axes.agency],
      ["quality", mode.axes.quality],
      ["scope", mode.axes.scope],
    ] as const) {
      if (isAbsolute(value)) {
        fragments.push(value); // custom absolute path
      } else {
        fragments.push(`axis/${axis}/${value}.md`); // built-in relative path
      }
    }
  }

  // Base behavioral-neutral sections
  fragments.push("base/doing-tasks.md");

  // Actions variant: autonomous only for built-in "autonomous" agency
  const isAutonomous =
    mode.axes !== null &&
    (AGENCY_VALUES as readonly string[]).includes(mode.axes.agency) &&
    mode.axes.agency === "autonomous";
  if (isAutonomous) {
    fragments.push("base/actions-autonomous.md");
  } else {
    fragments.push("base/actions-cautious.md");
  }

  fragments.push("base/tools.md");
  fragments.push("base/tone.md");
  fragments.push("base/session-guidance.md");

  // Built-in modifiers
  if (mode.modifiers.contextPacing) {
    fragments.push("modifiers/context-pacing.md");
  }
  if (mode.modifiers.readonly) {
    fragments.push("modifiers/readonly.md");
  }

  // Custom modifiers — after built-in modifiers, before env
  for (const customPath of mode.modifiers.custom) {
    fragments.push(customPath);
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
  for (const fragPath of fragmentPaths) {
    // Absolute paths are custom fragments; relative paths are built-in
    const fullPath = isAbsolute(fragPath)
      ? fragPath
      : resolve(promptsDir, fragPath);

    let content: string | null;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch {
      content = null;
    }

    if (content === null) {
      throw new Error(`Missing prompt fragment: ${fragPath}`);
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
