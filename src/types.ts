export const AGENCY_VALUES = ["autonomous", "collaborative", "surgical", "partner"] as const;
export type Agency = (typeof AGENCY_VALUES)[number];

export const QUALITY_VALUES = ["architect", "pragmatic", "minimal"] as const;
export type Quality = (typeof QUALITY_VALUES)[number];

export const SCOPE_VALUES = ["unrestricted", "adjacent", "narrow"] as const;
export type Scope = (typeof SCOPE_VALUES)[number];

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
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];
export function isPresetName(value: string): value is PresetName {
  return (PRESET_NAMES as readonly string[]).includes(value);
}

// Built-in modifier names — used for collision checking in config validation
export const BUILTIN_MODIFIER_NAMES = ["readonly", "context-pacing", "debug", "methodical", "director", "bold", "speak-plain", "tdd"] as const;
export type BuiltinModifier = (typeof BUILTIN_MODIFIER_NAMES)[number];
export function isBuiltinModifier(value: string): value is BuiltinModifier {
  return (BUILTIN_MODIFIER_NAMES as readonly string[]).includes(value);
}

// Built-in base names — "standard" is the existing base, "chill" is the new alternative
export const BUILTIN_BASE_NAMES = ["standard", "chill"] as const;
export type BuiltinBaseName = (typeof BUILTIN_BASE_NAMES)[number];
export function isBuiltinBase(value: string): value is BuiltinBaseName {
  return (BUILTIN_BASE_NAMES as readonly string[]).includes(value);
}

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
  modifiers: string[]; // ordered list of modifier fragment paths (embedded keys or absolute paths)
}

export interface EnvInfo {
  cwd: string;
  isGit: boolean;
  gitBranch: string | null;
  gitStatus: string | null;
  gitLog: string | null;
  platform: string;
  shell: string;
  osVersion: string;
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
}

export interface AssembleOptions {
  mode: ModeConfig;
  templateVars: TemplateVars;
  promptsDir: string; // path to prompts/ directory
}
