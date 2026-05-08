# Design: Auto Update-Check on Invocation

## Overview

When a user invokes `claude-mode <preset>` (or any axis-driven invocation), the launcher should compare the installed version against the latest GitHub Release and, if a newer version exists, print a brief nag to stderr, pause long enough to read it (1.5 s), then proceed to launch `claude` as normal.

This design layers on top of the existing self-update infrastructure (`src/update.ts`) — it reuses the same release-fetch transport and semver comparator. It introduces:

- A new module `src/version-check.ts` that decides when to check, reads/writes a cache, fires the fetch in the background, and emits the nag.
- A wire-up in `src/cli.ts` that fires the check at the top of `main()` and awaits it (with a hard ceiling) right before spawning `claude`.

### Locked design decisions

| Decision | Value | Rationale |
|---|---|---|
| Cache TTL | 24 h | Re-checks roughly daily; stays well under the 60/hr unauthenticated GitHub rate limit. |
| Pause duration | 1.5 s | Long enough to read; short enough not to feel stuck. |
| Opt-out | env var `CLAUDE_MODE_NO_UPDATE_CHECK=1` | No new config keys, no new flags. CI / power users set the env var. |
| Skip when | `update` subcommand, `--version`, stderr is not a TTY | Avoid redundant work; avoid corrupting captured/piped output. |
| Cache location | `$XDG_CACHE_HOME/claude-mode/version-check.json`, falling back to `~/.cache/claude-mode/version-check.json` | XDG-conformant; consistent location across Linux/macOS. |
| Output stream | stderr | The launcher's stdout may already be claimed (e.g., `build-prompt.ts` prints the claude command); stderr is the right channel for ambient launcher messages. |
| Network failure | swallow silently; proceed to launch | Auto-check is a courtesy, never a blocker. |
| Hard timeout | 1000 ms (race against fetch) | Total added latency capped at 1 s on stale-cache invocations; 0 ms on the typical fresh-cache path. |

### Out of scope

- `build-prompt.ts` (the alternative scripting entry) — it already runs to completion in <100 ms and is consumed by shell scripts. The auto-check stays in `cli.ts`, the interactive entry. (Both tools use `--version`, but only `cli.ts` spawns claude.)
- Authenticated GitHub API calls — unauthenticated is fine at our request rate.
- Persisting "user already saw this version's nag" — we re-nag on every invocation while a stale version is detected. The user clears it by running `claude-mode update`.

---

## Implementation Units

### Unit 1: `src/version-check.ts`

**File**: `src/version-check.ts`

The whole feature lives in one module — small, self-contained, matches the `update.ts` / `inspect.ts` single-file-subcommand pattern.

```typescript
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
 * timeout right before launching claude, then call printNagIfStale on the
 * result.
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
}

/**
 * Fires the version check in the background. Returns immediately with a
 * handle whose `result` promise resolves to the latest version (string) or
 * null. NEVER throws synchronously; the result promise NEVER rejects.
 *
 * If the cache is fresh, resolves immediately with the cached value (no
 * network request).
 *
 * If the cache is stale or missing, fires a fetch. The fetch's success
 * updates the cache as a side effect. If aborted or it errors, resolves
 * with the stale cache value (if any) or null.
 */
export function startVersionCheck(
  opts: StartVersionCheckOptions = {},
): VersionCheckHandle {
  const transport = opts.transport ?? defaultTransport;
  const cachePath = opts.cachePath ?? getCachePath();
  const now = opts.now ?? Date.now;

  const cache = readCache(cachePath);
  const cachedVersion = cache?.latestVersion ?? null;

  // Fresh cache → no network
  if (cache && isCacheFresh(cache, now())) {
    return {
      result: Promise.resolve(cachedVersion),
      abort: () => {},
    };
  }

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
```

**Implementation Notes**:

- **Why split `startVersionCheck` from `awaitAndNag`?** So the fetch can fire at the *very top* of `main()` (overlapping with arg parsing, config loading, prompt assembly), and we only block right before launching claude. On the typical fresh-cache path, both calls return effectively instantly.
- **Why `FETCH_RACE_TIMEOUT_MS = 1000`?** It caps total launcher latency at 1 s on cold cache. By the time we get to `awaitAndNag`, prompt assembly (~50 ms) has already overlapped with the fetch, so the timeout rarely fires in practice.
- **Why `compareSemver(latest, current) <= 0`?** No nag for downgrades or matches. We only nag when upstream is strictly newer.
- **Why does `writeCache` swallow errors?** Cache write failures (read-only filesystem, full disk) shouldn't break the launcher. The check just runs again next time.
- **Why does `readCache` validate the parsed shape?** A future format change shouldn't crash the launcher; treating malformed cache as "no cache" is forward-compatible.
- **The `aborted` flag inside the async IIFE** prevents writing the cache after the user already gave up waiting — we don't want a slow background fetch to clobber the cache after `awaitAndNag` aborted it.
- **Reuses `fetchLatestRelease`, `compareSemver`, `defaultTransport` from `update.ts`** — single source of truth for release fetching and version comparison. No duplicated semver logic.

**Acceptance Criteria**:
- [ ] `shouldRunCheck` returns false when `argv[0] === "update"`
- [ ] `shouldRunCheck` returns false when argv contains `--version` (before `--`)
- [ ] `shouldRunCheck` returns false when `CLAUDE_MODE_NO_UPDATE_CHECK=1` or `=true`
- [ ] `shouldRunCheck` returns false when `stderrIsTty` is false
- [ ] `shouldRunCheck` returns true for typical invocations like `["create"]`
- [ ] `getCachePath` returns `$XDG_CACHE_HOME/claude-mode/version-check.json` when env var is set
- [ ] `getCachePath` returns `~/.cache/claude-mode/version-check.json` when env var is unset
- [ ] `readCache` returns null for missing file, unreadable file, malformed JSON, or wrong-shape JSON
- [ ] `readCache` returns the parsed entry for a valid cache file
- [ ] `writeCache` creates parent directories
- [ ] `writeCache` swallows errors silently
- [ ] `isCacheFresh` returns true for a `checkedAt` within the last 24 h, false beyond
- [ ] `startVersionCheck` returns a handle without performing any I/O when called (cache read is fine, but the fetch is async)
- [ ] `startVersionCheck` resolves with the cached version without calling the transport when cache is fresh
- [ ] `startVersionCheck` resolves with the fetched version AND writes the cache when cache is stale and fetch succeeds
- [ ] `startVersionCheck` resolves with the stale cached version (or null) when fetch errors
- [ ] `startVersionCheck`'s `abort()` causes the result to resolve to the stale cached version
- [ ] `awaitAndNag` returns immediately without writing to stderr when handle is null
- [ ] `awaitAndNag` returns without writing when latest <= current
- [ ] `awaitAndNag` writes the nag and sleeps NAG_PAUSE_MS when latest > current
- [ ] `awaitAndNag` aborts the handle when its internal timeout fires
- [ ] The injected `sleep` function is awaited (so tests can drive timing deterministically)

---

### Unit 2: Wire-up in `src/cli.ts`

**File**: `src/cli.ts`

The wire-up adds two call sites:

1. **At the top of `main()`**, *after* the early-exit checks (`--version`, `--help`, no args) but *before* subcommand routing — fire the check.
2. **Right before `Bun.spawn(["claude", ...])`** — await the handle and nag if needed.

```typescript
// Add to imports
import {
  shouldRunCheck,
  startVersionCheck,
  awaitAndNag,
  type VersionCheckHandle,
} from "./version-check.js";

// Inside main(), after the --help / no-args block and before subcommand routing:
const versionCheck: VersionCheckHandle | null = shouldRunCheck(
  argv,
  process.env,
  process.stderr.isTTY === true,
)
  ? startVersionCheck()
  : null;

// ... existing subcommand routing (config, inspect, update) ...
//     Each subcommand calls process.exit() before reaching the spawn step,
//     so the fired version check is harmless background work that gets
//     cancelled on process exit.

// ... existing parse / config / resolve / detectEnv / assemble code ...

// --print: existing behavior; abort the check before exiting
if (parsed.modifiers.print) {
  versionCheck?.abort();
  process.stdout.write(prompt);
  process.exit(0);
}

// New: right before spawning claude
await awaitAndNag(versionCheck);

// Existing spawn:
const proc = Bun.spawn(["claude", ...claudeArgs], {
  stdio: ["inherit", "inherit", "inherit"],
});
```

**Implementation Notes**:

- **The fired-but-not-awaited handle on subcommand paths** (config, inspect, update) is intentional: those paths call `process.exit()` synchronously, which terminates the in-flight fetch. We don't need to explicitly abort. (The `update` subcommand path is filtered out by `shouldRunCheck` anyway.)
- **`process.stderr.isTTY === true`** — explicit `=== true` because Node types `isTTY` as `boolean | undefined`. The strict comparison treats undefined as false.
- **`abort()` before `--print`** — `--print` path is for scripting (capturing the assembled prompt). We don't want a background fetch keeping the process alive after the prompt is written.
- **No abort needed in the normal launch path** — `Bun.spawn` returns a handle; `await proc.exited` blocks until claude exits. The version-check fetch (if still in flight) can complete during claude's session; its cache write is harmless. After `proc.exited` resolves, `process.exit(exitCode)` terminates everything cleanly.

**Acceptance Criteria**:
- [ ] When invoked as `claude-mode create` with stderr-as-TTY and no opt-out, a version check is fired
- [ ] When invoked as `claude-mode update`, no version check is fired (per `shouldRunCheck`)
- [ ] When invoked as `claude-mode --version`, no version check is fired
- [ ] When invoked with `CLAUDE_MODE_NO_UPDATE_CHECK=1`, no version check is fired
- [ ] When invoked with stderr piped (non-TTY), no version check is fired
- [ ] When the cached latest version is newer than installed, the nag is printed to stderr before claude is spawned
- [ ] When the cached latest version is equal to installed, no nag is printed
- [ ] The `--print` path aborts the version check and exits without nag

---

### Unit 3: Documentation

**File**: `SPEC.md`

Add a new subsection under "CLI Interface", after "Update Subcommand":

```markdown
### Auto Update-Check

When `claude-mode` launches `claude` (any preset or axis-driven invocation), it also performs a background check against GitHub Releases. If a newer release is available, a one-line nag is printed to stderr and the launcher pauses for 1.5 s before spawning `claude`:

```
claude-mode update available: 0.2.10 -> 0.2.11. Run `claude-mode update` to install.
```

Behavior:
- The check honors a 24-hour cache at `$XDG_CACHE_HOME/claude-mode/version-check.json` (or `~/.cache/claude-mode/version-check.json`).
- The check is skipped on the `update` subcommand, on `--version`, and when stderr is not a TTY.
- Set `CLAUDE_MODE_NO_UPDATE_CHECK=1` (or `=true`) to disable the check entirely.
- Network failures are swallowed silently; the launcher always proceeds to spawn `claude`.

Implemented in `src/version-check.ts`; wired into `src/cli.ts`.
```

**File**: `CLAUDE.md`

In the "Project Structure" tree under `src/`, add:
```
  version-check.ts # auto update-check fired on cli.ts entry
```

In the "Pipeline" section, no change — the version check is parallel-fired infrastructure, not part of the prompt-assembly pipeline.

**File**: `README.md`

Optional one-line mention in the "Updating" section (if one exists; otherwise add to the install/usage section). Defer until after implementation if README structure isn't yet clear.

**Acceptance Criteria**:
- [ ] `SPEC.md` documents the auto-check, its cache, opt-out, and skipped paths
- [ ] `CLAUDE.md` lists `version-check.ts` in the `src/` tree

---

## Implementation Order

1. **Unit 1: `src/version-check.ts`** — ship the module first, fully unit-tested. No wire-up yet.
2. **Unit 2: `src/cli.ts` wire-up** — once Unit 1's tests pass, add the two call sites in cli.ts and add an integration test that verifies the nag appears on stderr.
3. **Unit 3: docs** — last.

This order makes the wire-up commit small (just the two additions to `cli.ts`) and keeps the unit tests on `version-check.ts` independent of the cli.ts plumbing.

---

## Testing

### Unit Tests: `src/version-check.test.ts`

Use `bun:test`. Use injection (transport, cachePath, now, sleep, stderr, env) to keep tests fast and deterministic — no real network, no real timers, no real filesystem outside a per-test temp dir.

**`shouldRunCheck`**
- returns false when env opts out (covers `=1` and `=true`; verifies other values like `=0` and unset don't opt out)
- returns false when `argv[0] === "update"`
- returns false when `--version` is in own args (and verifies `["--", "--version"]` does NOT opt out)
- returns false when `stderrIsTty` is false
- returns true for typical invocations: `["create"]`, `["safe", "--readonly"]`, `["--agency", "autonomous"]`

**`getCachePath`**
- honors `XDG_CACHE_HOME` when set
- falls back to `~/.cache/claude-mode/version-check.json` when `XDG_CACHE_HOME` unset or empty

**`readCache` / `writeCache`**
- round-trip: write then read returns the same `VersionCheckCache`
- read returns null on missing file
- read returns null on malformed JSON
- read returns null on wrong-shape JSON (missing fields, wrong types, empty `latestVersion`)
- write creates parent directory
- write swallows errors when given an unwritable path (e.g., a path under a file)

**`isCacheFresh`**
- true at boundary: `now - checkedAt = TTL - 1`
- false at boundary: `now - checkedAt = TTL`
- false for far-stale entries

**`startVersionCheck`**
- fresh cache: result resolves to `cache.latestVersion` synchronously; transport is never called
- stale cache + fetch succeeds: result resolves to fetched version; cache is updated with new `checkedAt` and `latestVersion`
- stale cache + fetch errors: result resolves to the stale cached version; cache is unchanged
- no cache + fetch errors: result resolves to null
- abort: result resolves to stale cached version (or null) without writing cache
- transport injection lets tests fake `fetchLatestRelease` outcomes

**`awaitAndNag`**
- handle is null → returns without writing
- result is null → returns without writing
- result equal to current → returns without writing
- result older than current → returns without writing
- result newer than current → writes the expected message format; calls `sleep(1500)`
- timeout fires (handle never resolves) → `abort` is called; no nag is written
- injected `sleep` is awaited (assert via mock that the test's promise resolves *after* sleep completes)

### Integration Test: `src/cli.test.ts` (additions)

Use the existing `createCliRunner` pattern. The integration test runs the compiled cli with `CLAUDE_MODE_NO_UPDATE_CHECK=1` everywhere except in two new dedicated tests:

- **nag is printed**: pre-populate the cache with a `latestVersion` strictly greater than `VERSION`; run `claude-mode --print create`; assert stderr contains `claude-mode update available:` and the expected versions.
- **no nag when up to date**: pre-populate the cache with `latestVersion === VERSION`; run; assert stderr does NOT contain `update available`.
- **opt-out works**: pre-populate cache with newer version; run with `CLAUDE_MODE_NO_UPDATE_CHECK=1`; assert no nag in stderr.

Existing cli.test.ts cases must continue to pass — add `CLAUDE_MODE_NO_UPDATE_CHECK=1` to the existing `createCliRunner` so other tests aren't affected by ambient cache state. (Alternative: set the env var in a `beforeAll` for that file.)

### Test fixtures

Reuse the existing pattern: define a complete fixture for `VersionCheckCache` once in the test file and spread-override per case.

```typescript
const baseCache: VersionCheckCache = {
  checkedAt: 1_700_000_000_000,
  latestVersion: "0.99.0",
};
```

---

## Verification Checklist

```bash
# Type-check, generate, run all tests
bun run generate
bun test

# Smoke-test: ensure --version and update paths skip the check
CLAUDE_MODE_NO_UPDATE_CHECK= claude-mode --version       # no nag
CLAUDE_MODE_NO_UPDATE_CHECK= claude-mode update --check  # no nag from auto-check (update prints its own)

# Smoke-test: opt-out
CLAUDE_MODE_NO_UPDATE_CHECK=1 claude-mode --print create   # no nag

# Smoke-test: cache miss (delete cache, run --print, expect possible nag once fetch completes)
rm -f ~/.cache/claude-mode/version-check.json
claude-mode --print create > /dev/null     # may or may not nag; cache is now populated
cat ~/.cache/claude-mode/version-check.json # cache file exists with current latest

# Smoke-test: simulate stale cache with newer version
echo '{"checkedAt":0,"latestVersion":"99.0.0"}' > ~/.cache/claude-mode/version-check.json
claude-mode --print create > /dev/null     # nag printed to stderr; pause ~1.5s

# Cleanup
rm ~/.cache/claude-mode/version-check.json
```

---

## Open Questions / Future Work

- **Should `claude-mode config` and `claude-mode inspect` also nag?** Current decision: no skip — they're in the "should nag" set since they're interactive entry points the user runs locally. Revisit if user feedback says it's noisy.
- **Should the nag mention the changelog?** The current message is one short line. Adding "Changelog: <url>" doubles the line count. Defer; add only if requested.
- **Authenticated GitHub API.** Skip until rate-limited in practice.
