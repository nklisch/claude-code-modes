import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { AssembleOptions, TemplateVars, ModeConfig, BaseManifest } from "./types.js";
import { isBuiltinBase } from "./types.js";
import { EMBEDDED_PROMPTS } from "./embedded-prompts.js";

/**
 * Reads a prompt fragment from the prompts directory.
 * Returns the content or null if the file doesn't exist.
 */
export function readFragment(promptsDir: string, relativePath: string): string | null {
  // Check embedded map first for built-in fragments
  if (!isAbsolute(relativePath) && relativePath in EMBEDDED_PROMPTS) {
    return EMBEDDED_PROMPTS[relativePath];
  }
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

/** Loads a base manifest. Built-in bases use embedded data; custom bases read from disk. */
function loadBaseManifest(base: string, promptsDir: string): { manifest: BaseManifest; baseDir: string } {
  if (isBuiltinBase(base)) {
    // Built-in: manifest is embedded
    const manifestKey = base === "standard" ? "base/base.json" : `${base}/base.json`;
    const raw = EMBEDDED_PROMPTS[manifestKey];
    if (!raw) throw new Error(`Missing embedded manifest for built-in base "${base}"`);
    const manifest = JSON.parse(raw) as BaseManifest;
    const baseDir = base === "standard"
      ? join(promptsDir, "base")
      : join(promptsDir, base);
    return { manifest, baseDir };
  }

  // Custom base: read from directory
  const manifestPath = join(base, "base.json");
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    throw new Error(
      `Base directory "${base}" does not contain a base.json manifest`
    );
  }
  const manifest = JSON.parse(raw) as BaseManifest;
  return { manifest, baseDir: base };
}

/** Validates a manifest has both required reserved words. */
function validateManifest(manifest: BaseManifest, baseName: string): void {
  if (!manifest.includes("axes")) {
    throw new Error(`Base "${baseName}" manifest is missing an "axes" entry`);
  }
  if (!manifest.includes("modifiers")) {
    throw new Error(`Base "${baseName}" manifest is missing a "modifiers" entry`);
  }
}

/** Resolves a fragment filename to an embedded key or absolute path. */
function resolveFragmentPath(filename: string, baseDir: string, baseName: string): string {
  if (isBuiltinBase(baseName)) {
    const prefix = baseName === "standard" ? "base" : baseName;
    return `${prefix}/${filename}`;
  }
  return join(baseDir, filename);
}

/**
 * Resolves manifest entries into an ordered list of fragment paths.
 * Built-in fragments are relative paths; custom fragments are absolute paths.
 */
export function getFragmentOrder(mode: ModeConfig, promptsDir: string): string[] {
  const { manifest, baseDir } = loadBaseManifest(mode.base, promptsDir);
  validateManifest(manifest, mode.base);

  const fragments: string[] = [];

  for (const entry of manifest) {
    if (entry === "axes") {
      // Insert axis fragments (skipped for none mode)
      if (mode.axes) {
        for (const [axis, value] of [
          ["agency", mode.axes.agency],
          ["quality", mode.axes.quality],
          ["scope", mode.axes.scope],
        ] as const) {
          if (isAbsolute(value)) {
            fragments.push(value);
          } else {
            fragments.push(`axis/${axis}/${value}.md`);
          }
        }
      }
      // Style fragment rides the axes insertion point but applies even in
      // none mode — an explicit --style is honored like explicit modifiers
      if (mode.style) {
        if (isAbsolute(mode.style)) {
          fragments.push(mode.style);
        } else {
          fragments.push(`style/${mode.style}.md`);
        }
      }
    } else if (entry === "modifiers") {
      // All modifiers are fragment paths — just add them
      for (const modPath of mode.modifiers) {
        fragments.push(modPath);
      }
    } else {
      // Plain fragment filename — resolve relative to base directory
      fragments.push(resolveFragmentPath(entry, baseDir, mode.base));
    }
  }

  return fragments;
}

/**
 * Assembles all fragments into a single prompt string.
 */
export function assemblePrompt(options: AssembleOptions): string {
  const { mode, templateVars, promptsDir } = options;
  const fragmentPaths = getFragmentOrder(mode, promptsDir);

  const sections: string[] = [];
  for (const fragPath of fragmentPaths) {
    let content: string | null;
    if (isAbsolute(fragPath)) {
      // Custom fragment — always read from disk
      try {
        content = readFileSync(fragPath, "utf8");
      } catch {
        content = null;
      }
    } else {
      // Built-in fragment — embedded map first, disk fallback
      content = EMBEDDED_PROMPTS[fragPath] ?? null;
      if (content === null) {
        const fullPath = resolve(promptsDir, fragPath);
        try {
          content = readFileSync(fullPath, "utf8");
        } catch {
          content = null;
        }
      }
    }

    if (content === null) {
      throw new Error(`Missing prompt fragment: ${fragPath}`);
    }
    sections.push(content.trim());
  }

  const joined = sections.join("\n\n");
  return substituteTemplateVars(joined, templateVars);
}

// Claude Code re-reads --system-prompt-file every time it starts the session's
// process, and with `claude --bg` that happens after claude-mode has exited: the
// background supervisor respawns sessions after idle stops, binary updates, and
// reboots. A temp file removed at exit breaks every one of those restarts, so
// prompts live in the state dir instead. Content addressing keeps reruns of the
// same mode from piling up files.
function promptStoreDir(): string {
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return join(stateHome, "claude-mode", "prompts");
}

/**
 * Writes the assembled prompt to a content-addressed file and returns its path.
 * The file is never cleaned up, because Claude Code may need to read it again
 * long after claude-mode has exited. Identical prompts share one file.
 */
export function writePromptFile(content: string, dir: string = promptStoreDir()): string {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const filePath = join(dir, `${hash}.md`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf8");
  return filePath;
}
