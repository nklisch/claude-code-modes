import type { AxisConfig, PresetName } from "./types.js";
export { isPresetName } from "./types.js";

export interface PresetDefinition {
  axes: AxisConfig | null;
  readonly: boolean;
  base?: string;       // default base for this preset
  modifiers: string[]; // built-in modifier names to apply
}

const PRESETS: Record<PresetName, PresetDefinition> = {
  "create": {
    axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
    readonly: false,
    modifiers: [],
  },
  "extend": {
    axes: { agency: "autonomous", quality: "pragmatic", scope: "adjacent" },
    readonly: false,
    modifiers: [],
  },
  "safe": {
    axes: { agency: "collaborative", quality: "minimal", scope: "narrow" },
    readonly: false,
    modifiers: [],
  },
  "refactor": {
    axes: { agency: "autonomous", quality: "pragmatic", scope: "unrestricted" },
    readonly: false,
    modifiers: [],
  },
  "explore": {
    axes: { agency: "collaborative", quality: "architect", scope: "narrow" },
    readonly: true,
    modifiers: [],
  },
  "none": {
    axes: null,
    readonly: false,
    modifiers: [],
  },
  "debug": {
    axes: { agency: "collaborative", quality: "pragmatic", scope: "narrow" },
    readonly: false,
    base: "chill",
    modifiers: ["debug"],
  },
  "methodical": {
    axes: { agency: "surgical", quality: "architect", scope: "narrow" },
    readonly: false,
    base: "chill",
    modifiers: ["methodical"],
  },
  "director": {
    axes: { agency: "collaborative", quality: "architect", scope: "unrestricted" },
    readonly: false,
    base: "chill",
    modifiers: ["director"],
  },
};

export function getPreset(name: PresetName): PresetDefinition {
  return PRESETS[name];
}
