import { parseArgs } from "node:util";
import type { Agency, Quality, Scope, PresetName } from "./types.js";
import { AGENCY_VALUES, QUALITY_VALUES, SCOPE_VALUES } from "./types.js";
import { isPresetName } from "./presets.js";

export interface ParsedArgs {
  preset: PresetName | null;
  overrides: {
    agency?: Agency;
    quality?: Quality;
    scope?: Scope;
  };
  modifiers: {
    readonly: boolean;
    print: boolean;
    contextPacing: boolean;
  };
  forwarded: {
    appendSystemPrompt?: string;
    appendSystemPromptFile?: string;
  };
  passthroughArgs: string[];
}

function validateAxisValue<T extends string>(
  value: unknown,
  validValues: readonly T[],
  flagName: string,
): T {
  if (!(validValues as readonly string[]).includes(value as string)) {
    throw new Error(
      `Invalid --${flagName} value: "${value}". Must be one of: ${validValues.join(", ")}`
    );
  }
  return value as T;
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  // Split at -- separator
  const dashDashIdx = argv.indexOf("--");
  const ourArgs = dashDashIdx >= 0 ? argv.slice(0, dashDashIdx) : argv;
  const afterDashDash = dashDashIdx >= 0 ? argv.slice(dashDashIdx + 1) : [];

  const { values, positionals } = parseArgs({
    args: ourArgs,
    options: {
      agency: { type: "string" },
      quality: { type: "string" },
      scope: { type: "string" },
      readonly: { type: "boolean" },
      print: { type: "boolean" },
      "context-pacing": { type: "boolean" },
      "append-system-prompt": { type: "string" },
      "append-system-prompt-file": { type: "string" },
      "system-prompt": { type: "string" },
      "system-prompt-file": { type: "string" },
      help: { type: "boolean" },
    },
    strict: false,
    allowPositionals: true,
  });

  // Reject --system-prompt and --system-prompt-file
  if (values["system-prompt"] !== undefined || values["system-prompt-file"] !== undefined) {
    throw new Error(
      "Cannot use --system-prompt or --system-prompt-file with claude-mode. " +
      "claude-mode generates its own system prompt. Use --append-system-prompt to add content."
    );
  }

  // Extract preset from first positional
  let preset: PresetName | null = null;
  const remainingPositionals: string[] = [];
  for (const pos of positionals) {
    if (preset === null && isPresetName(pos)) {
      preset = pos;
    } else {
      remainingPositionals.push(pos);
    }
  }

  // Validate axis overrides
  const overrides: ParsedArgs["overrides"] = {};
  if (values.agency !== undefined) {
    overrides.agency = validateAxisValue(values.agency, AGENCY_VALUES, "agency");
  }
  if (values.quality !== undefined) {
    overrides.quality = validateAxisValue(values.quality, QUALITY_VALUES, "quality");
  }
  if (values.scope !== undefined) {
    overrides.scope = validateAxisValue(values.scope, SCOPE_VALUES, "scope");
  }

  // Collect unknown flags for passthrough
  // parseArgs with strict:false puts unknown flags in values as booleans
  // and their intended values as positionals. We need to reconstruct them.
  const knownFlags = new Set([
    "agency", "quality", "scope", "readonly", "print", "context-pacing",
    "append-system-prompt", "append-system-prompt-file",
    "system-prompt", "system-prompt-file", "help",
  ]);
  const unknownPassthrough: string[] = [];
  for (const [key, val] of Object.entries(values)) {
    if (!knownFlags.has(key)) {
      unknownPassthrough.push(`--${key}`);
      if (typeof val === "string") {
        unknownPassthrough.push(val);
      }
    }
  }

  // Combine passthrough: unknown flags + remaining positionals + after --
  const passthroughArgs = [
    ...unknownPassthrough,
    ...remainingPositionals,
    ...afterDashDash,
  ];

  return {
    preset,
    overrides,
    modifiers: {
      readonly: values.readonly === true,
      print: values.print === true,
      contextPacing: values["context-pacing"] === true,
    },
    forwarded: {
      appendSystemPrompt: values["append-system-prompt"] as string | undefined,
      appendSystemPromptFile: values["append-system-prompt-file"] as string | undefined,
    },
    passthroughArgs,
  };
}
