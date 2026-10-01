import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { EnvInfo, ModelCapability, ModelInfo, TemplateVars } from "./types.js";

function exec(command: string): string | null {
  try {
    // stdio: ignore stderr cross-platform — avoids shell-specific redirects
    // like `2>/dev/null` (Unix) or `2>NUL` (Windows). Without this, Windows
    // cmd.exe interprets `/dev/null` as a missing path and prints
    // "The system cannot find the path specified." for every invocation.
    return execSync(command, {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// Sections each upstream prompt bundle adds, as the modifiers that carry them.
// `opus_5_prompt_bundle` sends all three; `fable_5_1_prompt_bundle` sends only delivering
// work (its other sections are intentional omissions); `opus_5_5_prompt_bundle` sends none.
const OPUS_5_BUNDLE = ["delivering-work", "corrections", "tool-restraint"] as const;
const FABLE_5_1_BUNDLE = ["delivering-work"] as const;

// Model metadata table extracted from the Claude Code binary — update when Claude Code updates.
// Extraction: grep the native binary for `{id:"claude-...,display_name:...,knowledge_cutoff:...`
// Capabilities come from upstream's prompt predicates, not the `capabilities` array verbatim:
// "lean-prompt" mirrors the lean predicate (which also treats Mythos 5 as lean), and
// "mid-conv-system" mirrors `mid_conv_system` minus upstream's Opus 4.8 and Sonnet 5 exclusions.
// Longer ids precede their prefixes so dated-variant matching picks the most specific entry.
const MODEL_TABLE: readonly ModelInfo[] = [
  { id: "claude-fable-5-1", name: "Fable 5.1", cutoff: "June 2026", capabilities: ["lean-prompt", "mid-conv-system"], promptBundle: FABLE_5_1_BUNDLE },
  { id: "claude-mythos-5-1", name: "Mythos 5.1", cutoff: "June 2026", capabilities: ["lean-prompt", "mid-conv-system"], promptBundle: FABLE_5_1_BUNDLE },
  { id: "claude-opus-5-5", name: "Opus 5.5", cutoff: "June 2026", capabilities: ["lean-prompt", "mid-conv-system"] },
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5", cutoff: "June 2026", capabilities: ["lean-prompt", "mid-conv-system"] },
  { id: "claude-fable-5", name: "Fable 5", cutoff: "January 2026", capabilities: ["lean-prompt", "mid-conv-system"] },
  { id: "claude-mythos-5", name: "Mythos 5", cutoff: "January 2026", capabilities: ["lean-prompt", "mid-conv-system"] },
  { id: "claude-opus-5", name: "Opus 5", cutoff: "May 2026", capabilities: ["lean-prompt", "mid-conv-system"], promptBundle: OPUS_5_BUNDLE },
  { id: "claude-opus-4-8", name: "Opus 4.8", cutoff: "January 2026", capabilities: ["lean-prompt"] },
  { id: "claude-opus-4-7", name: "Opus 4.7", cutoff: "January 2026" },
  { id: "claude-opus-4-6", name: "Opus 4.6", cutoff: "May 2025" },
  { id: "claude-opus-4-5", name: "Opus 4.5", cutoff: "May 2025" },
  { id: "claude-opus-4-1", name: "Opus 4.1", cutoff: "January 2025" },
  { id: "claude-opus-4-0", name: "Opus 4", cutoff: "January 2025" },
  { id: "claude-sonnet-5", name: "Sonnet 5", cutoff: "January 2026" },
  { id: "claude-sonnet-4-6", name: "Sonnet 4.6", cutoff: "August 2025" },
  { id: "claude-sonnet-4-5", name: "Sonnet 4.5", cutoff: "January 2025" },
  { id: "claude-sonnet-4-0", name: "Sonnet 4", cutoff: "January 2025" },
  { id: "claude-haiku-4-5", name: "Haiku 4.5", cutoff: "February 2025" },
] as const;

// Aliases resolve to the newest model of the family; opusplan executes on opus
const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-5-5",
  opusplan: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-4-5",
  fable: "claude-fable-5-1",
};

const DEFAULT_MODEL: ModelInfo = MODEL_TABLE[0];

export function resolveModel(raw: string | null | undefined): ModelInfo {
  if (!raw || raw === "default") return DEFAULT_MODEL;

  const has1m = raw.endsWith("[1m]");
  const base = has1m ? raw.slice(0, -"[1m]".length) : raw;
  const id = MODEL_ALIASES[base] ?? base;

  // Exact id first, then dated variants like claude-haiku-4-5-20251001
  const entry =
    MODEL_TABLE.find((m) => m.id === id) ?? MODEL_TABLE.find((m) => id.startsWith(`${m.id}-`));
  if (!entry) {
    // Unknown model — likely newer than the table, so assume it inherits the newest
    // known model's cutoff and prompt capabilities rather than inventing either.
    // Prompt bundles are per-model sections, so an unknown model gets none.
    return {
      name: id,
      id: has1m ? `${id}[1m]` : id,
      cutoff: DEFAULT_MODEL.cutoff,
      capabilities: DEFAULT_MODEL.capabilities,
    };
  }

  return {
    name: has1m ? `${entry.name} (1M context)` : entry.name,
    id: has1m ? `${id}[1m]` : id,
    cutoff: entry.cutoff,
    capabilities: entry.capabilities,
    ...(entry.promptBundle && { promptBundle: entry.promptBundle }),
  };
}

export function modelHasCapability(model: ModelInfo, capability: ModelCapability): boolean {
  return model.capabilities?.includes(capability) ?? false;
}

// Claude Code reads its model setting from these files, most specific first
function readConfiguredModel(cwd: string): string | null {
  const candidates = [
    join(cwd, ".claude", "settings.local.json"),
    join(cwd, ".claude", "settings.json"),
    join(homedir(), ".claude", "settings.json"),
  ];
  for (const path of candidates) {
    try {
      const settings = JSON.parse(readFileSync(path, "utf8"));
      if (typeof settings.model === "string" && settings.model !== "") return settings.model;
    } catch {
      // Missing or malformed settings file — try the next candidate
    }
  }
  return null;
}

/**
 * Resolves the model this session will run on, using the same precedence Claude Code
 * itself applies. Runs before base resolution so `--base auto` can key off the result.
 */
export function resolveSessionModel(modelArg?: string | null): ModelInfo {
  return resolveModel(modelArg ?? process.env.ANTHROPIC_MODEL ?? readConfiguredModel(process.cwd()));
}

export function detectEnv(model: ModelInfo): EnvInfo {
  const cwd = process.cwd();
  const isGit = exec("git rev-parse --is-inside-work-tree") === "true";

  let isWorktree = false;
  let gitBranch: string | null = null;
  let gitStatus: string | null = null;
  let gitLog: string | null = null;

  if (isGit) {
    const gitDir = exec("git rev-parse --git-dir");
    const commonDir = exec("git rev-parse --git-common-dir");
    isWorktree = gitDir !== null && commonDir !== null && gitDir !== commonDir;
    gitBranch = exec("git branch --show-current");
    gitStatus = exec("git status --short");
    gitLog = exec("git log --oneline -5");
  }

  const platform = exec("uname -s")?.toLowerCase() ?? "unknown";
  const shell = basename(process.env.SHELL || "bash");
  const osVersion = exec("uname -sr") ?? "unknown";

  return { cwd, isGit, isWorktree, gitBranch, gitStatus, gitLog, platform, shell, osVersion, model };
}

export function buildTemplateVars(env: EnvInfo): TemplateVars {
  let gitStatusBlock = "";
  if (env.isGit) {
    const parts: string[] = [];
    if (env.gitBranch) parts.push(`Current branch: ${env.gitBranch}`);
    if (env.gitStatus) {
      parts.push(`\nStatus:\n${env.gitStatus}`);
    } else {
      parts.push(`\nStatus:\n(clean)`);
    }
    if (env.gitLog) parts.push(`\nRecent commits:\n${env.gitLog}`);
    gitStatusBlock = parts.join("\n");
  }

  const worktreeNotice = env.isWorktree
    ? "\n - This is a git worktree — an isolated copy of the repository. Run all commands from this directory. Do NOT `cd` to the original repository root." +
      "\n - The git stash stack is shared with the main checkout and all other worktrees, and other Claude sessions may push or pop it concurrently. Never use bare `git stash` / `git stash pop` — you could pop another session's changes. Prefer a temporary WIP commit to set work aside; if you must stash, use `git stash push -u -m \"<unique-tag>\"`, immediately capture your entry's SHA via `git stash list --format='%H %gs'`, restore with `git stash apply <sha>` (not pop), and afterwards drop the entry, re-finding its current `stash@{n}` by tag first."
    : "";

  // Upstream's lean `# Harness` bullet describes reminders by how this model receives them
  const systemReminderNote = modelHasCapability(env.model, "mid-conv-system")
    ? "The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results."
    : "`<system-reminder>` tags in messages and tool results are injected by the harness, not the user.";

  return {
    CWD: env.cwd,
    IS_GIT: env.isGit ? "true" : "false",
    PLATFORM: env.platform,
    SHELL: env.shell,
    OS_VERSION: env.osVersion,
    MODEL_NAME: env.model.name,
    MODEL_ID: env.model.id,
    KNOWLEDGE_CUTOFF: env.model.cutoff,
    GIT_STATUS: gitStatusBlock,
    WORKTREE_NOTICE: worktreeNotice,
    SYSTEM_REMINDER_NOTE: systemReminderNote,
  };
}
