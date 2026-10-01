export const AGENCY_VALUES = ["autonomous", "collaborative", "surgical", "partner"] as const;
export type Agency = (typeof AGENCY_VALUES)[number];

export const QUALITY_VALUES = ["architect", "pragmatic", "minimal"] as const;
export type Quality = (typeof QUALITY_VALUES)[number];

export const SCOPE_VALUES = ["unrestricted", "adjacent", "narrow"] as const;
export type Scope = (typeof SCOPE_VALUES)[number];

// Built-in style names — writing styles applied on top of any base/axes
export const STYLE_VALUES = ["declaudified", "straight"] as const;
export type Style = (typeof STYLE_VALUES)[number];
export function isBuiltinStyle(value: string): value is Style {
  return (STYLE_VALUES as readonly string[]).includes(value);
}

export const PRESET_NAMES = [
  "create",
  "extend",
  "safe",
  "refactor",
  "explore",
  "none",
  "debug",
  "methodical",
  "director",
  "partner",
  "muse",
  "flow",
  "tinker",
  "spark",
  "straight",
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];
export function isPresetName(value: string): value is PresetName {
  return (PRESET_NAMES as readonly string[]).includes(value);
}

// Built-in modifier names — used for collision checking in config validation
export const BUILTIN_MODIFIER_NAMES = ["readonly", "context-pacing", "debug", "methodical", "director", "bold", "speak-plain", "tdd", "muse", "flow", "playful", "delivering-work", "corrections", "tool-restraint"] as const;
export type BuiltinModifier = (typeof BUILTIN_MODIFIER_NAMES)[number];
export function isBuiltinModifier(value: string): value is BuiltinModifier {
  return (BUILTIN_MODIFIER_NAMES as readonly string[]).includes(value);
}

// Built-in base names — "standard" (upstream-derived), "chill" (calm), "flow" (calm + engaged),
// "lean" (upstream's lean assembly), "straight" (direct, anti-sycophantic technical communication)
export const BUILTIN_BASE_NAMES = ["standard", "chill", "flow", "lean", "straight"] as const;
export type BuiltinBaseName = (typeof BUILTIN_BASE_NAMES)[number];
export function isBuiltinBase(value: string): value is BuiltinBaseName {
  return (BUILTIN_BASE_NAMES as readonly string[]).includes(value);
}

// Not a base directory — a selector that picks a base from the session's model
export const BASE_AUTO = "auto";

// Reserved manifest entries — "axes" and "modifiers" trigger insertion
export const MANIFEST_RESERVED = ["axes", "modifiers"] as const;
export type ManifestReserved = (typeof MANIFEST_RESERVED)[number];

// A manifest is a flat array of strings
export type BaseManifest = string[];

/** Maps each axis to its built-in values — single source of truth for collision checks */
export const AXIS_BUILTINS: Record<"agency" | "quality" | "scope", readonly string[]> = {
  agency: AGENCY_VALUES,
  quality: QUALITY_VALUES,
  scope: SCOPE_VALUES,
};
export function isBuiltinAxisValue(axis: "agency" | "quality" | "scope", value: string): boolean {
  return (AXIS_BUILTINS[axis] as readonly string[]).includes(value);
}

// Axis values are strings: either a built-in name or an absolute path to a custom fragment
export interface AxisConfig {
  agency: string;
  quality: string;
  scope: string;
}

export interface ModeConfig {
  base: string; // built-in name ("standard", "chill") or absolute path to base directory
  axes: AxisConfig | null; // null for "none" mode
  style: string | null; // built-in name or absolute path to a custom fragment; null = no style
  modifiers: string[]; // ordered list of modifier fragment paths (embedded keys or absolute paths)
}

/** Resolved model metadata for env.md substitution */
/**
 * Prompt-shaping capabilities Claude Code reads off the session model.
 * - "lean-prompt": upstream sends the lean assembly instead of the standard one
 * - "mid-conv-system": the lean assembly describes reminders as mid-conversation
 *   system turns rather than `<system-reminder>` tags
 */
export const MODEL_CAPABILITIES = ["lean-prompt", "mid-conv-system"] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export interface ModelInfo {
  name: string;
  id: string;
  cutoff: string;
  capabilities?: readonly ModelCapability[];
  /** Modifiers mirroring the extra sections upstream sends this model (its `*_prompt_bundle`) */
  promptBundle?: readonly BuiltinModifier[];
}

export interface EnvInfo {
  cwd: string;
  isGit: boolean;
  isWorktree: boolean;
  gitBranch: string | null;
  gitStatus: string | null;
  gitLog: string | null;
  platform: string;
  shell: string;
  osVersion: string;
  model: ModelInfo;
}

/** Template variables for env.md substitution */
export interface TemplateVars {
  CWD: string;
  IS_GIT: string;
  PLATFORM: string;
  SHELL: string;
  OS_VERSION: string;
  MODEL_NAME: string;
  MODEL_ID: string;
  KNOWLEDGE_CUTOFF: string;
  GIT_STATUS: string;
  WORKTREE_NOTICE: string;
  SYSTEM_REMINDER_NOTE: string;
}

export interface AssembleOptions {
  mode: ModeConfig;
  templateVars: TemplateVars;
  promptsDir: string; // path to prompts/ directory
}
