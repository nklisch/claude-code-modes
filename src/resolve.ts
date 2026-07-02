import type { ModeConfig } from "./types.js";
import type { ParsedArgs } from "./args.js";
import type { LoadedConfig } from "./config.js";
import { resolveConfigPath } from "./config.js";
import { getPreset, isPresetName } from "./presets.js";
import {
  AGENCY_VALUES,
  QUALITY_VALUES,
  SCOPE_VALUES,
  STYLE_VALUES,
  BUILTIN_MODIFIER_NAMES,
  BUILTIN_BASE_NAMES,
  PRESET_NAMES,
  isBuiltinModifier,
  isBuiltinBase,
  isBuiltinStyle,
} from "./types.js";
import { resolve as pathResolve, isAbsolute } from "node:path";

const DEFAULT_AGENCY = "collaborative";
const DEFAULT_QUALITY = "pragmatic";
const DEFAULT_SCOPE = "adjacent";

/**
 * Returns true if a string looks like a file path rather than a name.
 * Paths contain "/" or "\" or end with ".md".
 */
function looksLikeFilePath(value: string): boolean {
  return value.includes("/") || value.includes("\\") || value.endsWith(".md");
}

/**
 * Resolves an axis value to either a built-in name or an absolute path.
 * Resolution order: built-in values → config-defined names → file path heuristic.
 * Throws with descriptive error if unresolvable.
 */
function resolveAxisValue(
  raw: string,
  axisName: "agency" | "quality" | "scope",
  builtinValues: readonly string[],
  loadedConfig: LoadedConfig | null,
): string {
  // 1. Built-in value
  if (builtinValues.includes(raw)) return raw;

  // 2. Config-defined custom name
  const configAxes = loadedConfig?.config.axes?.[axisName];
  if (configAxes && raw in configAxes) {
    return resolveConfigPath(loadedConfig!.configDir, configAxes[raw]);
  }

  // 3. File path
  if (looksLikeFilePath(raw)) {
    return isAbsolute(raw) ? raw : pathResolve(raw);
  }

  // 4. Unknown
  const configHint = loadedConfig
    ? ` Config loaded from: ${loadedConfig.configDir}`
    : " No config file found.";
  throw new Error(
    `Unknown --${axisName} value: "${raw}". ` +
    `Must be one of: ${builtinValues.join(", ")}, ` +
    `a name defined in your config, or a file path.${configHint}`
  );
}

/**
 * Resolves a modifier reference to either a built-in fragment path or an absolute path.
 * Resolution order: built-in modifier name → config-defined name → file path.
 */
function resolveModifier(
  raw: string,
  loadedConfig: LoadedConfig | null,
): { kind: "builtin"; name: string } | { kind: "custom"; path: string } {
  // 1. Built-in modifier
  if (isBuiltinModifier(raw)) {
    return { kind: "builtin", name: raw };
  }

  // 2. Config-defined custom modifier
  const configModifiers = loadedConfig?.config.modifiers;
  if (configModifiers && raw in configModifiers) {
    return {
      kind: "custom",
      path: resolveConfigPath(loadedConfig!.configDir, configModifiers[raw]),
    };
  }

  // 3. File path
  if (looksLikeFilePath(raw)) {
    const absPath = isAbsolute(raw) ? raw : pathResolve(raw);
    return { kind: "custom", path: absPath };
  }

  // 4. Unknown
  const configHint = loadedConfig
    ? ` Config loaded from: ${loadedConfig.configDir}`
    : " No config file found.";
  throw new Error(
    `Unknown modifier: "${raw}". ` +
    `Must be a built-in modifier (${BUILTIN_MODIFIER_NAMES.join(", ")}), ` +
    `a name defined in your config, or a file path.${configHint}`
  );
}

/**
 * Resolves a list of modifier references and appends/prepends their paths to resolvedPaths.
 * Built-in modifiers resolve to "modifiers/{name}.md"; custom modifiers resolve to absolute paths.
 * Deduplicates by path.
 */
function applyModifiers(
  modifiers: string[],
  loadedConfig: LoadedConfig | null,
  resolvedPaths: string[],
  position: "append" | "prepend",
): void {
  for (const raw of modifiers) {
    const resolved = resolveModifier(raw, loadedConfig);
    let path: string;
    if (resolved.kind === "builtin") {
      path = `modifiers/${resolved.name}.md`;
    } else {
      path = resolved.path;
    }
    if (!resolvedPaths.includes(path)) {
      if (position === "prepend") resolvedPaths.unshift(path);
      else resolvedPaths.push(path);
    }
  }
}

/**
 * Resolves a style value to either a built-in name or an absolute path.
 * Resolution order: built-in values → config-defined names → file path heuristic.
 * Throws with descriptive error if unresolvable.
 */
function resolveStyleValue(raw: string, loadedConfig: LoadedConfig | null): string {
  // 1. Built-in value
  if (isBuiltinStyle(raw)) return raw;

  // 2. Config-defined custom name
  const configStyles = loadedConfig?.config.styles;
  if (configStyles && raw in configStyles) {
    return resolveConfigPath(loadedConfig!.configDir, configStyles[raw]);
  }

  // 3. File path
  if (looksLikeFilePath(raw)) {
    return isAbsolute(raw) ? raw : pathResolve(raw);
  }

  // 4. Unknown
  const configHint = loadedConfig
    ? ` Config loaded from: ${loadedConfig.configDir}`
    : " No config file found.";
  throw new Error(
    `Unknown --style value: "${raw}". ` +
    `Must be one of: ${STYLE_VALUES.join(", ")}, ` +
    `a name defined in your config, or a file path.${configHint}`
  );
}

/**
 * Resolves the active style, or null when none applies.
 * Priority: CLI --style > config defaultStyle > preset style > none
 */
function resolveStyle(
  raw: string | undefined,
  loadedConfig: LoadedConfig | null,
  presetStyle: string | undefined,
): string | null {
  const value = raw ?? loadedConfig?.config.defaultStyle ?? presetStyle;
  if (value === undefined) return null;
  return resolveStyleValue(value, loadedConfig);
}

/**
 * Resolves a base reference to a built-in name or absolute directory path.
 * Priority: CLI --base > config defaultBase > preset base > "standard"
 */
function resolveBase(
  raw: string | undefined,
  loadedConfig: LoadedConfig | null,
  presetBase: string | undefined,
): string {
  const config = loadedConfig?.config ?? null;

  // Priority: CLI --base > config defaultBase > preset base > "standard"
  const value = raw ?? config?.defaultBase ?? presetBase ?? "standard";

  // 1. Built-in name
  if (isBuiltinBase(value)) return value;

  // 2. Config-defined name
  const configBases = config?.bases;
  if (configBases && value in configBases) {
    return resolveConfigPath(loadedConfig!.configDir, configBases[value]);
  }

  // 3. Directory path
  if (looksLikeFilePath(value)) {
    return isAbsolute(value) ? value : pathResolve(value);
  }

  // 4. Unknown
  const configHint = loadedConfig
    ? ` Config loaded from: ${loadedConfig.configDir}`
    : " No config file found.";
  throw new Error(
    `Unknown --base value: "${value}". ` +
    `Must be one of: ${BUILTIN_BASE_NAMES.join(", ")}, ` +
    `a name defined in your config, or a directory path.${configHint}`
  );
}

export function resolveConfig(
  parsed: ParsedArgs,
  loadedConfig: LoadedConfig | null,
): ModeConfig {
  const config = loadedConfig?.config ?? null;
  const modifierPaths: string[] = [];

  // 1. Config defaultModifiers — always applied first
  if (config?.defaultModifiers) {
    applyModifiers(config.defaultModifiers, loadedConfig, modifierPaths, "append");
  }

  // 2. CLI boolean flags → inject as modifier names
  if (parsed.modifiers.readonly) {
    applyModifiers(["readonly"], loadedConfig, modifierPaths, "append");
  }
  if (parsed.modifiers.contextPacing) {
    applyModifiers(["context-pacing"], loadedConfig, modifierPaths, "append");
  }

  // 3. CLI --modifier flags — appended after defaults
  applyModifiers(parsed.customModifiers, loadedConfig, modifierPaths, "append");

  // Handle "none" preset — resolve base before early return.
  // Explicit --style (or config defaultStyle) still applies, like modifiers.
  if (parsed.preset === "none") {
    const base = resolveBase(parsed.base, loadedConfig, undefined);
    return {
      base,
      axes: null,
      style: resolveStyle(parsed.style, loadedConfig, undefined),
      modifiers: modifierPaths,
    };
  }

  let agency: string;
  let quality: string;
  let scope: string;
  let presetBase: string | undefined;
  let presetStyle: string | undefined;

  if (parsed.preset) {
    // Check built-in presets first, then config presets
    if (isPresetName(parsed.preset)) {
      const preset = getPreset(parsed.preset);
      if (preset.axes === null) throw new Error(`Preset "${parsed.preset}" has null axes`);
      agency = parsed.overrides.agency
        ? resolveAxisValue(parsed.overrides.agency, "agency", AGENCY_VALUES, loadedConfig)
        : preset.axes.agency;
      quality = parsed.overrides.quality
        ? resolveAxisValue(parsed.overrides.quality, "quality", QUALITY_VALUES, loadedConfig)
        : preset.axes.quality;
      scope = parsed.overrides.scope
        ? resolveAxisValue(parsed.overrides.scope, "scope", SCOPE_VALUES, loadedConfig)
        : preset.axes.scope;
      presetBase = preset.base;
      presetStyle = preset.style;

      // Apply preset's readonly flag as a modifier
      if (preset.readonly) {
        applyModifiers(["readonly"], loadedConfig, modifierPaths, "prepend");
      }
      // Apply preset's built-in modifiers (before CLI modifiers)
      if (preset.modifiers.length > 0) {
        applyModifiers(preset.modifiers, loadedConfig, modifierPaths, "prepend");
      }
    } else if (config?.presets && parsed.preset in config.presets) {
      // Config-defined preset
      const customPreset = config.presets[parsed.preset];
      presetBase = customPreset.base;
      presetStyle = customPreset.style;
      agency = parsed.overrides.agency
        ? resolveAxisValue(parsed.overrides.agency, "agency", AGENCY_VALUES, loadedConfig)
        : customPreset.agency
          ? resolveAxisValue(customPreset.agency, "agency", AGENCY_VALUES, loadedConfig)
          : DEFAULT_AGENCY;
      quality = parsed.overrides.quality
        ? resolveAxisValue(parsed.overrides.quality, "quality", QUALITY_VALUES, loadedConfig)
        : customPreset.quality
          ? resolveAxisValue(customPreset.quality, "quality", QUALITY_VALUES, loadedConfig)
          : DEFAULT_QUALITY;
      scope = parsed.overrides.scope
        ? resolveAxisValue(parsed.overrides.scope, "scope", SCOPE_VALUES, loadedConfig)
        : customPreset.scope
          ? resolveAxisValue(customPreset.scope, "scope", SCOPE_VALUES, loadedConfig)
          : DEFAULT_SCOPE;

      // Apply config preset's boolean flags as modifiers
      if (customPreset.readonly) {
        applyModifiers(["readonly"], loadedConfig, modifierPaths, "prepend");
      }
      if (customPreset.contextPacing) {
        applyModifiers(["context-pacing"], loadedConfig, modifierPaths, "prepend");
      }

      // Resolve preset's modifiers list — inserted before CLI modifiers
      if (customPreset.modifiers) {
        applyModifiers(customPreset.modifiers, loadedConfig, modifierPaths, "prepend");
      }
    } else {
      throw new Error(
        `Unknown preset: "${parsed.preset}". ` +
        `Built-in presets: ${PRESET_NAMES.join(", ")}. ` +
        (config?.presets
          ? `Config presets: ${Object.keys(config.presets).join(", ")}.`
          : "No config file found.")
      );
    }
  } else {
    // No preset: use overrides with defaults
    agency = parsed.overrides.agency
      ? resolveAxisValue(parsed.overrides.agency, "agency", AGENCY_VALUES, loadedConfig)
      : DEFAULT_AGENCY;
    quality = parsed.overrides.quality
      ? resolveAxisValue(parsed.overrides.quality, "quality", QUALITY_VALUES, loadedConfig)
      : DEFAULT_QUALITY;
    scope = parsed.overrides.scope
      ? resolveAxisValue(parsed.overrides.scope, "scope", SCOPE_VALUES, loadedConfig)
      : DEFAULT_SCOPE;
  }

  const base = resolveBase(parsed.base, loadedConfig, presetBase);
  const style = resolveStyle(parsed.style, loadedConfig, presetStyle);

  return {
    base,
    axes: { agency, quality, scope },
    style,
    modifiers: modifierPaths,
  };
}
