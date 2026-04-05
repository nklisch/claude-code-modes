import { parseArgs } from "node:util";

export interface ParsedArgs {
  preset: string | null;
  overrides: {
    agency?: string;
    quality?: string;
    scope?: string;
  };
  modifiers: {
    readonly: boolean;
    print: boolean;
    contextPacing: boolean;
  };
  customModifiers: string[];
  forwarded: {
    appendSystemPrompt?: string;
    appendSystemPromptFile?: string;
  };
  passthroughArgs: string[];
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
      modifier: { type: "string", multiple: true },
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

  // First positional is always treated as preset candidate
  let preset: string | null = null;
  const remainingPositionals: string[] = [];
  for (const pos of positionals) {
    if (preset === null) {
      preset = pos;
    } else {
      remainingPositionals.push(pos);
    }
  }

  // Raw axis overrides — validation moves to resolve
  const overrides: ParsedArgs["overrides"] = {};
  if (values.agency !== undefined) overrides.agency = values.agency as string;
  if (values.quality !== undefined) overrides.quality = values.quality as string;
  if (values.scope !== undefined) overrides.scope = values.scope as string;

  // Custom modifiers from --modifier flags
  const customModifiers: string[] = (values.modifier as string[] | undefined) ?? [];

  // Collect unknown flags for passthrough
  const knownFlags = new Set([
    "agency", "quality", "scope", "modifier", "readonly", "print", "context-pacing",
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
    customModifiers,
    forwarded: {
      appendSystemPrompt: values["append-system-prompt"] as string | undefined,
      appendSystemPromptFile: values["append-system-prompt-file"] as string | undefined,
    },
    passthroughArgs,
  };
}
