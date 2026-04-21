#!/usr/bin/env bun
import { join } from "node:path";
import { parseCliArgs } from "./args.js";
import { loadConfig } from "./config.js";
import { resolveConfig } from "./resolve.js";
import { assemblePrompt, writeTempPrompt } from "./assemble.js";
import { detectEnv, buildTemplateVars } from "./env.js";
import { runConfigCommand } from "./config-cli.js";
import { runInspectCommand } from "./inspect.js";
import { printUsage } from "./usage.js";
import { VERSION } from "./version.js";

function shellEscape(arg: string): string {
  // If arg contains no special characters, return as-is
  if (/^[a-zA-Z0-9_.\/\-=]+$/.test(arg)) {
    return arg;
  }
  // Otherwise, wrap in single quotes, escaping any internal single quotes
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

function main(): void {
  const argv = process.argv.slice(2);

  // --version: print claude-mode's own version and exit. Must stand alone —
  // combinations like `claude-mode create --version` are rejected so --version
  // can't be confused for a subcommand flag or silently forwarded to claude.
  // Use `claude-mode -- --version` to pass --version through to claude.
  const dashDashIdx = argv.indexOf("--");
  const ownArgs = dashDashIdx >= 0 ? argv.slice(0, dashDashIdx) : argv;
  if (ownArgs.includes("--version")) {
    if (argv.length !== 1) {
      process.stderr.write(
        "Error: --version cannot be combined with other arguments. " +
        "Use `claude-mode -- --version` to pass --version through to claude.\n"
      );
      process.exit(1);
    }
    process.stdout.write(`claude-mode ${VERSION}\n`);
    process.exit(0);
  }

  // No args or --help: show usage
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Prompts directory — needed by inspect before the normal pipeline runs
  const promptsDir = join(import.meta.dir, "..", "prompts");

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

  // Inspect subcommand routing
  if (argv[0] === "inspect") {
    try {
      runInspectCommand(argv.slice(1), promptsDir);
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
