#!/usr/bin/env bun
import { join } from "node:path";
import { parseCliArgs } from "./args.js";
import { loadConfig } from "./config.js";
import { resolveConfig } from "./resolve.js";
import { assemblePrompt, writeTempPrompt } from "./assemble.js";
import { detectEnv, buildTemplateVars } from "./env.js";
import { runConfigCommand } from "./config-cli.js";

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
  --agency <value>        Built-in: autonomous, collaborative, surgical
  --quality <value>       Built-in: architect, pragmatic, minimal
  --scope <value>         Built-in: unrestricted, adjacent, narrow
  Axis values can also be config-defined names or file paths (.md files).

Modifiers:
  --readonly              Prevent file modifications
  --context-pacing        Include context pacing prompt
  --modifier <name|path>  Add a custom modifier (repeatable)
  --print                 Print assembled prompt instead of launching claude

Forwarded to claude:
  --append-system-prompt <text>
  --append-system-prompt-file <path>

Config: .claude-mode.json (project) or ~/.config/claude-mode/config.json (global)

Everything after -- is passed to claude verbatim.

Examples:
  claude-mode create
  claude-mode create --quality pragmatic
  claude-mode create --modifier ./my-rules.md
  claude-mode --agency autonomous --quality ./team-quality.md
  claude-mode team-default                    # custom preset from config
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

  // Config subcommand routing
  if (argv[0] === "config") {
    try {
      runConfigCommand(argv.slice(1));
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
    process.exit(0);
  }

  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Load config between parse and resolve
  let loadedConfig;
  try {
    loadedConfig = loadConfig();
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Resolve with config
  let config;
  try {
    config = resolveConfig(parsed, loadedConfig);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }

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
