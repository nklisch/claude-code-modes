#!/usr/bin/env bun
import { join } from "node:path";
import { parseCliArgs } from "./args.js";
import { resolveConfig } from "./resolve.js";
import { assemblePrompt, writeTempPrompt } from "./assemble.js";
import { detectEnv, buildTemplateVars } from "./env.js";

function shellEscape(arg: string): string {
  // If arg contains no special characters, return as-is
  if (/^[a-zA-Z0-9_.\/\-=]+$/.test(arg)) {
    return arg;
  }
  // Otherwise, wrap in single quotes, escaping any internal single quotes
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

function printUsage(): void {
  const usage = `Usage: claude-mode [preset] [options] [-- claude-args...]

Presets:
  create          autonomous / architect / unrestricted
  extend          autonomous / pragmatic / adjacent
  safe            collaborative / minimal / narrow
  refactor        autonomous / pragmatic / unrestricted
  explore         collaborative / architect / narrow (readonly)
  none            no behavioral instructions

Axis overrides:
  --agency <autonomous|collaborative|surgical>
  --quality <architect|pragmatic|minimal>
  --scope <unrestricted|adjacent|narrow>

Modifiers:
  --readonly              Prevent file modifications
  --context-pacing        Include context pacing prompt
  --print                 Print assembled prompt instead of launching claude

Forwarded to claude:
  --append-system-prompt <text>
  --append-system-prompt-file <path>

Everything after -- is passed to claude verbatim.

Examples:
  claude-mode create
  claude-mode create --quality pragmatic
  claude-mode --agency autonomous --quality architect --scope unrestricted
  claude-mode explore --print
  claude-mode create -- --verbose --model sonnet`;

  process.stdout.write(usage + "\n");
}

function main(): void {
  const argv = process.argv.slice(2);

  // No args or --help: show usage
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const config = resolveConfig(parsed);

  // Detect environment and build template vars
  const env = detectEnv();
  const templateVars = buildTemplateVars(env);

  // Assemble the prompt
  const promptsDir = join(import.meta.dir, "..", "prompts");
  const prompt = assemblePrompt({
    mode: config,
    templateVars,
    promptsDir,
  });

  // --print: output the prompt itself (for debugging / Phase 4 tests)
  if (parsed.modifiers.print) {
    process.stdout.write(prompt);
    process.exit(0);
  }

  // Write to temp file
  const tempFile = writeTempPrompt(prompt);

  // Build the claude command
  const claudeArgs: string[] = ["claude", "--system-prompt-file", tempFile];

  // Forward append-system-prompt flags
  if (parsed.forwarded.appendSystemPrompt) {
    claudeArgs.push("--append-system-prompt", parsed.forwarded.appendSystemPrompt);
  }
  if (parsed.forwarded.appendSystemPromptFile) {
    claudeArgs.push("--append-system-prompt-file", parsed.forwarded.appendSystemPromptFile);
  }

  // Add passthrough args
  claudeArgs.push(...parsed.passthroughArgs);

  // Output the command — the bash wrapper will exec this
  process.stdout.write(claudeArgs.map(shellEscape).join(" ") + "\n");
}

main();
