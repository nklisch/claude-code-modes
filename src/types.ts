export const AGENCY_VALUES = ["autonomous", "collaborative", "surgical"] as const;
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
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

// Built-in modifier names — used for collision checking in config validation
export const BUILTIN_MODIFIER_NAMES = ["readonly", "context-pacing"] as const;
export type BuiltinModifier = (typeof BUILTIN_MODIFIER_NAMES)[number];

// Axis values are strings: either a built-in name or an absolute path to a custom fragment
export interface AxisConfig {
  agency: string;
  quality: string;
  scope: string;
}

export interface ModeConfig {
  axes: AxisConfig | null; // null for "none" mode
  modifiers: {
    readonly: boolean;
    contextPacing: boolean;
    custom: string[]; // ordered list of absolute paths to custom modifier files
  };
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
