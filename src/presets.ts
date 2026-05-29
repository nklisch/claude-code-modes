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
    readonly: false,
    modifiers: ["readonly"],
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
  "partner": {
    axes: { agency: "partner", quality: "pragmatic", scope: "adjacent" },
    readonly: false,
    base: "chill",
    modifiers: ["speak-plain", "tdd"],
  },
  "muse": {
    axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
    readonly: false,
    base: "chill",
    modifiers: ["muse"],
  },
  // Deep-but-bounded counterpoint to muse: depth, not sprawl. The flow base
  // supplies the calm-engaged voice; the flow modifier adds the go-deep directive;
  // "adjacent" scope encodes the modifier's own rule — meet real difficulty, never
  // manufacture more.
  "flow": {
    axes: { agency: "autonomous", quality: "architect", scope: "adjacent" },
    readonly: false,
    base: "flow",
    modifiers: ["flow"],
  },
  // Prototyping / creative-coding mode: loose, generative, fun. flow + playful
  // compose the "absorbed and enjoying it" character. "pragmatic" keeps a sketch
  // from being gold-plated; "unrestricted" lets it spin up whatever the idea needs.
  "tinker": {
    axes: { agency: "autonomous", quality: "pragmatic", scope: "unrestricted" },
    readonly: false,
    base: "flow",
    modifiers: ["flow", "playful"],
  },
  // Maximum expression: muse's anti-generic creative vision plus wit and voice.
  // "architect" so the vision is executed well, not just gestured at.
  "spark": {
    axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
    readonly: false,
    base: "chill",
    modifiers: ["muse", "playful"],
  },
};

export function getPreset(name: PresetName): PresetDefinition {
  return PRESETS[name];
}
