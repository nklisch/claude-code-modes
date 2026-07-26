import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { PRESET_NAMES, BUILTIN_MODIFIER_NAMES, AXIS_BUILTINS, BASE_AUTO, BUILTIN_BASE_NAMES, STYLE_VALUES, isBuiltinModifier, isPresetName, isBuiltinBase, isBuiltinAxisValue, isBuiltinStyle } from "./types.js";

/**
 * Matches paths that reference potentially sensitive files (SSH keys, credentials, etc.).
 * Note: bare "private" was removed — it false-positives on macOS where resolved paths
 * go through /private/var/folders/... Instead we match ".private/" (hidden directory)
 * and "private_key"/"private-key" (common key naming patterns).
 */
const SUSPICIOUS_PATH_PATTERN = /\.(ssh|env|gnupg|aws|kube|docker|pgpass)|\.npmrc|\.netrc|id_rsa|id_ed25519|id_ecdsa|credentials|secret|token|password|\.private[/]|private[_-]?key/i;

/**
 * Validates a file path defined in a config file.
 * Config-defined paths must end with .md and must not reference sensitive files.
 * This prevents malicious .claude-mode.json files from exfiltrating secrets.
 */
function validateConfigDefinedPath(path: string, context: string, configPath: string): void {
  if (!path.endsWith(".md")) {
    throw new Error(
      `Invalid config file ${configPath}: ${context} must be a .md file, got "${path}"`
    );
  }
  if (SUSPICIOUS_PATH_PATTERN.test(path)) {
    throw new Error(
      `Invalid config file ${configPath}: ${context} references a potentially sensitive path "${path}"`
    );
  }
}

/** Schema for .claude-mode.json */
export interface UserConfig {
  defaultBase?: string;
  bases?: Record<string, string>; // name → directory path (relative to config dir)
  defaultStyle?: string;
  styles?: Record<string, string>; // name → .md path (relative to config dir)
  defaultModifiers?: string[];
  modifiers?: Record<string, string>;
  axes?: {
    agency?: Record<string, string>;
    quality?: Record<string, string>;
    scope?: Record<string, string>;
  };
  presets?: Record<string, CustomPresetDef>;
}

export interface CustomPresetDef {
  base?: string; // base name for this preset
  agency?: string;
  quality?: string;
  scope?: string;
  style?: string;
  modifiers?: string[];
  readonly?: boolean;
  contextPacing?: boolean;
}

export interface LoadedConfig {
  config: UserConfig;
  configDir: string; // directory the config file lives in, for resolving relative paths
}

/** Throws if name collides with a built-in modifier name. */
export function checkModifierNameCollision(name: string): void {
  if (isBuiltinModifier(name)) {
    throw new Error(
      `"${name}" is a built-in modifier name (${BUILTIN_MODIFIER_NAMES.join(", ")}); choose a different name`
    );
  }
}

/** Throws if name collides with a built-in preset name. */
export function checkPresetNameCollision(name: string): void {
  if (isPresetName(name)) {
    throw new Error(
      `"${name}" is a built-in preset name (${PRESET_NAMES.join(", ")}); choose a different name`
    );
  }
}

/** Throws if name collides with a built-in style name. */
export function checkStyleNameCollision(name: string): void {
  if (isBuiltinStyle(name)) {
    throw new Error(
      `"${name}" is a built-in style name (${STYLE_VALUES.join(", ")}); choose a different name`
    );
  }
}

/** Throws if name collides with a built-in base name or the model-driven selector. */
export function checkBaseNameCollision(name: string): void {
  if (name === BASE_AUTO) {
    throw new Error(
      `"${BASE_AUTO}" selects a base from the session model; choose a different name`
    );
  }
  if (isBuiltinBase(name)) {
    throw new Error(
      `"${name}" is a built-in base name (${BUILTIN_BASE_NAMES.join(", ")}); choose a different name`
    );
  }
}

/** Throws if name collides with a built-in value for the given axis. */
export function checkAxisValueCollision(axis: "agency" | "quality" | "scope", name: string): void {
  const builtins = AXIS_BUILTINS[axis];
  if (isBuiltinAxisValue(axis, name)) {
    throw new Error(
      `"${name}" is a built-in ${axis} value (${builtins.join(", ")}); choose a different name`
    );
  }
}

/**
 * Reads and parses a config file, checking only that the top-level value is an object.
 * Does NOT run full schema validation — callers that need full validation should use loadConfig().
 * Throws on invalid JSON or non-object top-level value.
 */
export function readConfigFile(configPath: string): UserConfig {
  let raw: unknown;
  try {
    const text = readFileSync(configPath, "utf8");
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Invalid config file ${configPath}: ${(err as Error).message}`
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      `Invalid config file ${configPath}: top-level value must be an object`
    );
  }
  return raw as UserConfig;
}

/**
 * Loads config from .claude-mode.json in CWD, falling back to
 * ~/.config/claude-mode/config.json. Returns null if neither exists.
 * Throws on invalid JSON or schema violations.
 */
export function loadConfig(): LoadedConfig | null {
  const candidates = [
    join(process.cwd(), ".claude-mode.json"),
    join(homedir(), ".config", "claude-mode", "config.json"),
  ];

  for (const configPath of candidates) {
    if (!existsSync(configPath)) continue;

    const config = validateConfig(readConfigFile(configPath), configPath);
    return { config, configDir: dirname(configPath) };
  }

  return null;
}

/** Validates a value is a Record<string, string>. Returns the typed record or throws. */
function validateStringRecord(
  value: unknown,
  fieldName: string,
  configPath: string,
): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `Invalid config file ${configPath}: "${fieldName}" must be an object (Record<string, string>)`
    );
  }
  const record = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(record)) {
    if (typeof val !== "string") {
      throw new Error(
        `Invalid config file ${configPath}: "${fieldName}.${key}" must be a string`
      );
    }
  }
  return record as Record<string, string>;
}

/** Validates a value is a string[]. Returns the typed array or throws. */
function validateStringArray(
  value: unknown,
  fieldName: string,
  configPath: string,
): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(
      `Invalid config file ${configPath}: "${fieldName}" must be an array of strings`
    );
  }
  return value as string[];
}

/**
 * Validates the loaded config object. Throws descriptive errors for:
 * - Non-object top-level value
 * - Invalid field types
 * - Custom preset names that collide with built-in preset names
 * - Custom modifier names that collide with built-in modifier names
 */
function validateConfig(raw: unknown, configPath: string): UserConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      `Invalid config file ${configPath}: top-level value must be an object`
    );
  }

  const obj = raw as Record<string, unknown>;

  // Validate defaultBase
  if (obj.defaultBase !== undefined && typeof obj.defaultBase !== "string") {
    throw new Error(
      `Invalid config file ${configPath}: "defaultBase" must be a string`
    );
  }

  // Validate bases map
  if (obj.bases !== undefined) {
    const bases = validateStringRecord(obj.bases, "bases", configPath);
    for (const key of Object.keys(bases)) checkBaseNameCollision(key);
  }

  // Validate defaultStyle
  if (obj.defaultStyle !== undefined && typeof obj.defaultStyle !== "string") {
    throw new Error(
      `Invalid config file ${configPath}: "defaultStyle" must be a string`
    );
  }

  // Validate styles map
  if (obj.styles !== undefined) {
    const styles = validateStringRecord(obj.styles, "styles", configPath);
    for (const [key, val] of Object.entries(styles)) {
      checkStyleNameCollision(key);
      validateConfigDefinedPath(val, `"styles.${key}"`, configPath);
    }
  }

  // Validate defaultModifiers
  if (obj.defaultModifiers !== undefined) {
    const defaultModifiers = validateStringArray(obj.defaultModifiers, "defaultModifiers", configPath);
    // Validate file path entries in defaultModifiers
    for (const entry of defaultModifiers) {
      if (entry.includes("/") || entry.includes("\\") || entry.endsWith(".md")) {
        validateConfigDefinedPath(entry, `"defaultModifiers" entry "${entry}"`, configPath);
      }
    }
  }

  // Validate modifiers map
  if (obj.modifiers !== undefined) {
    const modifiers = validateStringRecord(obj.modifiers, "modifiers", configPath);
    for (const [key, val] of Object.entries(modifiers)) {
      checkModifierNameCollision(key);
      validateConfigDefinedPath(val, `"modifiers.${key}"`, configPath);
    }
  }

  // Validate axes
  if (obj.axes !== undefined) {
    if (typeof obj.axes !== "object" || obj.axes === null || Array.isArray(obj.axes)) {
      throw new Error(
        `Invalid config file ${configPath}: "axes" must be an object`
      );
    }
    const axesObj = obj.axes as Record<string, unknown>;
    for (const axisName of ["agency", "quality", "scope"] as const) {
      if (axesObj[axisName] !== undefined) {
        const axisMap = validateStringRecord(axesObj[axisName], `axes.${axisName}`, configPath);
        for (const [key, val] of Object.entries(axisMap)) {
          validateConfigDefinedPath(val, `"axes.${axisName}.${key}"`, configPath);
        }
      }
    }
  }

  // Validate presets
  if (obj.presets !== undefined) {
    if (typeof obj.presets !== "object" || obj.presets === null || Array.isArray(obj.presets)) {
      throw new Error(
        `Invalid config file ${configPath}: "presets" must be an object`
      );
    }
    for (const [presetName, presetDef] of Object.entries(obj.presets as Record<string, unknown>)) {
      checkPresetNameCollision(presetName);
      if (typeof presetDef !== "object" || presetDef === null || Array.isArray(presetDef)) {
        throw new Error(
          `Invalid config file ${configPath}: preset "${presetName}" must be an object`
        );
      }
      const def = presetDef as Record<string, unknown>;
      if (def.base !== undefined && typeof def.base !== "string") {
        throw new Error(
          `Invalid config file ${configPath}: preset "${presetName}.base" must be a string`
        );
      }
      for (const field of ["agency", "quality", "scope", "style"] as const) {
        if (def[field] !== undefined && typeof def[field] !== "string") {
          throw new Error(
            `Invalid config file ${configPath}: preset "${presetName}.${field}" must be a string`
          );
        }
      }
      if (def.modifiers !== undefined) {
        if (
          !Array.isArray(def.modifiers) ||
          !def.modifiers.every((v) => typeof v === "string")
        ) {
          throw new Error(
            `Invalid config file ${configPath}: preset "${presetName}.modifiers" must be an array of strings`
          );
        }
      }
      if (def.readonly !== undefined && typeof def.readonly !== "boolean") {
        throw new Error(
          `Invalid config file ${configPath}: preset "${presetName}.readonly" must be a boolean`
        );
      }
      if (def.contextPacing !== undefined && typeof def.contextPacing !== "boolean") {
        throw new Error(
          `Invalid config file ${configPath}: preset "${presetName}.contextPacing" must be a boolean`
        );
      }
    }
  }

  return raw as UserConfig;
}

/**
 * Resolves a path from the config file relative to the config file's directory.
 * Absolute paths are returned as-is.
 */
export function resolveConfigPath(configDir: string, relativePath: string): string {
  if (isAbsolute(relativePath)) return relativePath;
  return resolve(configDir, relativePath);
}
