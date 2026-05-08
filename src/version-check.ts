import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { VERSION } from "./version.js";
import {
  defaultTransport,
  fetchLatestRelease,
  compareSemver,
  type UpdateTransport,
} from "./update.js";

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------

/** How long a cached "latest version" entry is considered fresh. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Hard ceiling on time spent waiting for the fetch before launching claude. */
const FETCH_RACE_TIMEOUT_MS = 1000;

/** Pause after printing the nag, so the user can read it before claude takes the TTY. */
const NAG_PAUSE_MS = 1500;

/** Env-var name that disables the check entirely. */
const OPT_OUT_ENV = "CLAUDE_MODE_NO_UPDATE_CHECK";

/** Subcommand names that should skip the check. */
const SKIPPED_SUBCOMMANDS = new Set(["update"]);

// ----------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------

export interface VersionCheckCache {
  /** Unix epoch milliseconds when this entry was written. */
  checkedAt: number;
  /** "0.2.11" — without a leading "v". Comparable to VERSION. */
  latestVersion: string;
}

/**
 * The handle returned by startVersionCheck. Consumers race this against a
 * timeout right before launching claude, then call awaitAndNag on the result.
 */
export interface VersionCheckHandle {
  /**
   * Resolves with the latest known version (from cache or freshly fetched),
   * or null if no version could be determined within the budget. NEVER rejects.
   */
  result: Promise<string | null>;
  /** Aborts the in-flight fetch, if any. Safe to call multiple times. */
  abort(): void;
}

// ----------------------------------------------------------------------
// Pure decision: should we run the check at all?
// ----------------------------------------------------------------------

/**
 * Pure decision function — given argv (process.argv.slice(2)), env, and the
 * stderr-isTTY flag, decide whether to run the version check.
 *
 * Skips when:
 *   - CLAUDE_MODE_NO_UPDATE_CHECK is set to a truthy value
 *   - argv[0] === "update"
 *   - argv contains "--version" before any "--"
 *   - stderr is not a TTY (output is being captured)
 */
export function shouldRunCheck(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  stderrIsTty: boolean,
): boolean {
  if (!stderrIsTty) return false;

  const optOut = env[OPT_OUT_ENV];
  if (optOut === "1" || optOut === "true") return false;

  if (argv.length > 0 && SKIPPED_SUBCOMMANDS.has(argv[0])) return false;

  // --version must stand alone (cli.ts enforces this elsewhere); the check
  // here is to skip even when `--version` appears as the only own-arg.
  const dashDashIdx = argv.indexOf("--");
  const ownArgs = dashDashIdx >= 0 ? argv.slice(0, dashDashIdx) : argv;
  if (ownArgs.includes("--version")) return false;

  return true;
}

// ----------------------------------------------------------------------
// Cache I/O — pure-ish (touches disk; tests inject path)
// ----------------------------------------------------------------------

/**
 * Returns the absolute path to the cache file. Honors XDG_CACHE_HOME on Linux
 * and macOS; falls back to ~/.cache/claude-mode/version-check.json.
 */
export function getCachePath(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_CACHE_HOME;
  const baseDir = xdg && xdg.length > 0 ? xdg : join(homedir(), ".cache");
  return join(baseDir, "claude-mode", "version-check.json");
}

/**
 * Reads the cache file. Returns null if missing, unreadable, or malformed —
 * never throws. The caller treats null as "no cache" and proceeds.
 */
export function readCache(path: string): VersionCheckCache | null {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<VersionCheckCache>;
    if (
      typeof parsed.checkedAt !== "number" ||
      typeof parsed.latestVersion !== "string" ||
      parsed.latestVersion.length === 0
    ) {
      return null;
    }
    return { checkedAt: parsed.checkedAt, latestVersion: parsed.latestVersion };
  } catch {
    return null;
  }
}

/**
 * Writes the cache file. Creates the parent directory if missing. Swallows
 * I/O errors (the check is a courtesy — never a blocker).
 */
export function writeCache(path: string, cache: VersionCheckCache): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache));
  } catch {
    // best-effort
  }
}

/** Pure: is this cache entry younger than CACHE_TTL_MS? */
export function isCacheFresh(
  cache: VersionCheckCache,
  now: number = Date.now(),
): boolean {
  return now - cache.checkedAt < CACHE_TTL_MS;
}

// ----------------------------------------------------------------------
// Orchestrator: fire the check, return a handle
// ----------------------------------------------------------------------

export interface StartVersionCheckOptions {
  transport?: UpdateTransport;
  cachePath?: string;
  now?: () => number;
  /** Where the in-flight notice is written. Defaults to process.stderr. */
  stderr?: NodeJS.WritableStream;
}

/**
 * Fires the version check in the background. Returns immediately with a
 * handle whose `result` promise resolves to the latest version (string) or
 * null. NEVER throws synchronously; the result promise NEVER rejects.
 *
 * If the cache is fresh, resolves immediately with the cached value (no
 * network request, no stderr noise).
 *
 * If the cache is stale or missing, prints a one-line "Checking for newer
 * versions..." notice to stderr, then fires the fetch. The fetch's success
 * updates the cache as a side effect. If aborted or it errors, resolves
 * with the stale cache value (if any) or null.
 */
export function startVersionCheck(
  opts: StartVersionCheckOptions = {},
): VersionCheckHandle {
  const transport = opts.transport ?? defaultTransport;
  const cachePath = opts.cachePath ?? getCachePath();
  const now = opts.now ?? Date.now;
  const stderr = opts.stderr ?? process.stderr;

  const cache = readCache(cachePath);
  const cachedVersion = cache?.latestVersion ?? null;

  // Fresh cache → no network, no notice
  if (cache && isCacheFresh(cache, now())) {
    return {
      result: Promise.resolve(cachedVersion),
      abort: () => {},
    };
  }

  // We're going to fetch — tell the user what's happening so a slow GitHub
  // request doesn't read as a hang. Single line; the nag (if any) appears on
  // a new line below.
  stderr.write("Checking for newer versions of claude-mode...\n");

  const controller = new AbortController();
  let aborted = false;

  const result: Promise<string | null> = (async () => {
    try {
      const release = await Promise.race([
        fetchLatestRelease(transport),
        abortPromise(controller.signal),
      ]);
      if (aborted) return cachedVersion;
      writeCache(cachePath, {
        checkedAt: now(),
        latestVersion: release.version,
      });
      return release.version;
    } catch {
      return cachedVersion;
    }
  })();

  return {
    result,
    abort: () => {
      aborted = true;
      controller.abort();
    },
  };
}

/** Resolves to never; rejects with an Error when the signal aborts. */
function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
}

// ----------------------------------------------------------------------
// Final-step: race against timeout, print nag, sleep
// ----------------------------------------------------------------------

/**
 * Awaits the version-check handle with a hard timeout. If the result shows
 * a newer version than `current`, writes a one-line nag to stderr and
 * sleeps for NAG_PAUSE_MS so the user can read it.
 *
 * Always returns; never throws. Safe to call even when the check was never
 * fired (caller passes null).
 */
export async function awaitAndNag(
  handle: VersionCheckHandle | null,
  current: string = VERSION,
  stderr: NodeJS.WritableStream = process.stderr,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  if (!handle) return;

  const latest = await Promise.race([
    handle.result,
    sleep(FETCH_RACE_TIMEOUT_MS).then(() => null),
  ]);

  // If we timed out, abort the underlying fetch so it doesn't keep the
  // process alive after claude exits.
  if (latest === null) handle.abort();

  if (!latest) return;
  if (compareSemver(latest, current) <= 0) return;

  stderr.write(
    `claude-mode update available: ${current} -> ${latest}. ` +
    `Run \`claude-mode update\` to install.\n`,
  );
  await sleep(NAG_PAUSE_MS);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
