#!/usr/bin/env bun
import { join } from "node:path";
import { rmSync } from "node:fs";
import { parseCliArgs } from "./args.js";
import { loadConfig } from "./config.js";
import { resolveConfig } from "./resolve.js";
import { assemblePrompt, writeTempPrompt } from "./assemble.js";
import { detectEnv, buildTemplateVars } from "./env.js";
import { runConfigCommand } from "./config-cli.js";
import { runInspectCommand } from "./inspect.js";
import { runUpdateCommand } from "./update.js";
import { printUsage } from "./usage.js";
import { formatVersion } from "./version.js";
import {
  shouldRunCheck,
  startVersionCheck,
  awaitAndNag,
  type VersionCheckHandle,
} from "./version-check.js";

async function main(): Promise<void> {
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
    process.stdout.write(`${formatVersion()}\n`);
    process.exit(0);
  }

  // No args or --help: show usage
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Fire version check early so the fetch overlaps with arg parsing / config /
  // prompt assembly. Skipped when stderr is not a TTY (piped/CI), on the
  // update subcommand, on --version, and when CLAUDE_MODE_NO_UPDATE_CHECK=1.
  const versionCheck: VersionCheckHandle | null = shouldRunCheck(
    argv,
    process.env,
    process.stderr.isTTY === true,
  )
    ? startVersionCheck()
    : null;

  // Prompts directory — embedded prompts are primary; disk is fallback
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

  // Update subcommand routing
  if (argv[0] === "update") {
    try {
      await runUpdateCommand(argv.slice(1));
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

  // --print: output the prompt itself (for debugging); abort the check so
  // a background fetch doesn't keep the process alive after stdout is written.
  if (parsed.modifiers.print) {
    versionCheck?.abort();
    process.stdout.write(prompt);
    process.exit(0);
  }

  // Write to temp file
  const tempFile = writeTempPrompt(prompt);

  // Build claude args
  const claudeArgs: string[] = ["--system-prompt-file", tempFile];

  // Forward append-system-prompt flags
  if (parsed.forwarded.appendSystemPrompt) {
    claudeArgs.push("--append-system-prompt", parsed.forwarded.appendSystemPrompt);
  }
  if (parsed.forwarded.appendSystemPromptFile) {
    claudeArgs.push("--append-system-prompt-file", parsed.forwarded.appendSystemPromptFile);
  }

  // Add passthrough args
  claudeArgs.push(...parsed.passthroughArgs);

  // Await the version check result and print a nag if an update is available.
  // Total latency is capped at 1 s by awaitAndNag's internal timeout.
  await awaitAndNag(versionCheck);

  // Spawn claude directly — gives it full TTY ownership
  const proc = Bun.spawn(["claude", ...claudeArgs], {
    stdio: ["inherit", "inherit", "inherit"],
  });

  // Forward signals to the child process
  process.on("SIGINT", () => proc.kill("SIGINT"));
  process.on("SIGTERM", () => proc.kill("SIGTERM"));

  const exitCode = await proc.exited;

  // Clean up temp file after claude exits
  try {
    const { dirname } = await import("node:path");
    rmSync(dirname(tempFile), { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; don't fail if temp dir is already gone
  }

  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
});
