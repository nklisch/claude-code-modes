import { execSync } from "node:child_process";
import { basename } from "node:path";
import type { EnvInfo, TemplateVars } from "./types.js";

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

export function detectEnv(): EnvInfo {
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

  return { cwd, isGit, isWorktree, gitBranch, gitStatus, gitLog, platform, shell, osVersion };
}

// Hardcoded model info — update when Claude Code updates
const MODEL_NAME = "Fable 5";
const MODEL_ID = "claude-fable-5";
const KNOWLEDGE_CUTOFF = "January 2026";

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

  return {
    CWD: env.cwd,
    IS_GIT: env.isGit ? "true" : "false",
    PLATFORM: env.platform,
    SHELL: env.shell,
    OS_VERSION: env.osVersion,
    MODEL_NAME,
    MODEL_ID,
    KNOWLEDGE_CUTOFF,
    GIT_STATUS: gitStatusBlock,
    WORKTREE_NOTICE: worktreeNotice,
  };
}
