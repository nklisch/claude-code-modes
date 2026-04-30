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

  let gitBranch: string | null = null;
  let gitStatus: string | null = null;
  let gitLog: string | null = null;

  if (isGit) {
    gitBranch = exec("git branch --show-current");
    gitStatus = exec("git status --short");
    gitLog = exec("git log --oneline -5");
  }

  const platform = exec("uname -s")?.toLowerCase() ?? "unknown";
  const shell = basename(process.env.SHELL || "bash");
  const osVersion = exec("uname -sr") ?? "unknown";

  return { cwd, isGit, gitBranch, gitStatus, gitLog, platform, shell, osVersion };
}

// Hardcoded model info — update when Claude Code updates
const MODEL_NAME = "Claude Opus 4.7";
const MODEL_ID = "claude-opus-4-7";
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
  };
}
