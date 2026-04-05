import type { ModeConfig, Agency, Quality, Scope } from "./types.js";
import type { ParsedArgs } from "./args.js";
import { getPreset } from "./presets.js";

const DEFAULT_AGENCY: Agency = "collaborative";
const DEFAULT_QUALITY: Quality = "pragmatic";
const DEFAULT_SCOPE: Scope = "adjacent";

export function resolveConfig(parsed: ParsedArgs): ModeConfig {
  if (parsed.preset === "none") {
    // None mode: no axes, just modifiers
    return {
      axes: null,
      modifiers: {
        readonly: parsed.modifiers.readonly,
        contextPacing: parsed.modifiers.contextPacing,
      },
    };
  }

  let agency: Agency;
  let quality: Quality;
  let scope: Scope;
  let readonly = parsed.modifiers.readonly;

  if (parsed.preset) {
    // Start from preset, apply overrides
    const preset = getPreset(parsed.preset);
    if (preset.axes === null) {
      // Shouldn't happen — "none" is handled above
      throw new Error(`Preset "${parsed.preset}" has null axes`);
    }
    agency = parsed.overrides.agency ?? preset.axes.agency;
    quality = parsed.overrides.quality ?? preset.axes.quality;
    scope = parsed.overrides.scope ?? preset.axes.scope;
    // Preset's readonly is OR'd with the flag (explore defaults to readonly,
    // but you could also explicitly pass --readonly on any other preset)
    readonly = readonly || preset.readonly;
  } else {
    // No preset: use overrides with defaults
    agency = parsed.overrides.agency ?? DEFAULT_AGENCY;
    quality = parsed.overrides.quality ?? DEFAULT_QUALITY;
    scope = parsed.overrides.scope ?? DEFAULT_SCOPE;
  }

  return {
    axes: { agency, quality, scope },
    modifiers: { readonly, contextPacing: parsed.modifiers.contextPacing },
  };
}
