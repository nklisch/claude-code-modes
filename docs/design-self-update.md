# Design: Self-Update Operation

## Overview

This design adds a `claude-mode update` subcommand that updates an installed binary in place from the latest (or a pinned) GitHub Release. It mirrors the install flow already implemented in `install.sh` — fetch the release, download the platform binary, verify its SHA-256 against `checksums.txt`, and atomically replace the running executable.

The subcommand follows the existing positional-subcommand pattern (`config`, `inspect`) and routes from `cli.ts`. It refuses to run from a source/dev/fork build and instead points the user to the correct workflow for that install path. All capabilities the user requested are included: `--check`, `--force`, `--dry-run`, and a positional version argument for pinning/downgrade.

### Scope decisions (locked)

- **Surface**: `claude-mode update` subcommand (matches `config`/`inspect`).
- **Capabilities**: `--check`, `--force`, `--dry-run`, positional `<version>` for pinning.
- **Source-build behavior**: refuse with guidance.
- **Release source**: GitHub Releases only (no npm-fallback path).

### Interpretation note: classifying a "release build"

The original question phrased a release build as "no commit in `BUILD_INFO`". In practice the release workflow does not scrub `src/build-info.ts` — `bun install --frozen-lockfile` runs `prepare`, which runs `generate-build-info.ts` against the CI checkout, so release binaries DO carry a commit hash (and `repo` URL). The actual signal we can use:

- `process.execPath` is the bun runtime → source mode (refuse).
- `BUILD_INFO.dirty === true` → dev build with uncommitted changes (refuse).
- `BUILD_INFO.repo` is set and does not match `https://github.com/nklisch/claude-code-modes.git` → fork build (refuse).
- Otherwise → safe-to-update (clean binary built from upstream, whether from CI or a local `bun run build`).

This matches the user's intent ("refuse for source/fork/dirty; allow for upstream binaries") rather than the literal phrasing.

---

## Implementation Units

### Unit 1: Update module

**File**: `src/update.ts`

The whole update operation lives in one module — small, self-contained, and following the existing single-file-subcommand pattern (`inspect.ts`, `config-cli.ts`).

```typescript
import { readFileSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { VERSION } from "./version.js";
import { BUILD_INFO, type BuildInfo } from "./build-info.js";

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------

/** Upstream repo — also referenced by install.sh and the release workflow. */
const UPSTREAM_REPO = "nklisch/claude-code-modes";

/** Normalized form of the upstream remote URL captured by build-info. */
const UPSTREAM_REPO_URL = "https://github.com/nklisch/claude-code-modes.git";

const USER_AGENT = `claude-mode/${VERSION}`;

// ----------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------

export interface UpdateOptions {
  check: boolean;
  force: boolean;
  dryRun: boolean;
  /** Positional version: "0.2.5" or "v0.2.5"; null for "latest". */
  targetTag: string | null;
}

export type InstallClassification =
  | { kind: "source"; reason: string }
  | { kind: "dirty"; reason: string }
  | { kind: "fork"; reason: string }
  | { kind: "release"; binaryPath: string };

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface ReleaseInfo {
  /** "v0.2.8" — exact tag from GitHub. */
  tag: string;
  /** "0.2.8" — tag with leading "v" stripped, comparable to package.json. */
  version: string;
  assets: ReleaseAsset[];
}

export interface PlatformArtifact {
  binary: ReleaseAsset;
  checksums: ReleaseAsset;
  /** "claude-mode-linux-x64" etc. */
  artifactName: string;
}

export type UpdateAction = "install" | "no-op" | "downgrade" | "reinstall";

export interface UpdatePlan {
  current: string;
  target: string;
  tag: string;
  artifact: PlatformArtifact;
  binaryPath: string;
  action: UpdateAction;
}

/** Injectable transport — default uses global fetch; tests inject a fake. */
export interface UpdateTransport {
  fetchJson(url: string): Promise<unknown>;
  fetchBytes(url: string): Promise<Uint8Array>;
  fetchText(url: string): Promise<string>;
}

// ----------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------

export const defaultTransport: UpdateTransport;

/** Parses argv (after "update" has been stripped). Throws on unknown flags. */
export function parseUpdateArgs(argv: string[]): UpdateOptions;

/** Determines whether the running binary is safe to self-update. Pure. */
export function classifyInstall(
  execPath?: string,
  buildInfo?: BuildInfo,
): InstallClassification;

/** Maps process.platform/process.arch → release artifact name. Throws on unsupported. */
export function detectArtifactName(
  platformVal?: string,
  archVal?: string,
): string;

/** Hits GET /repos/{repo}/releases/latest. */
export function fetchLatestRelease(transport: UpdateTransport): Promise<ReleaseInfo>;

/** Hits GET /repos/{repo}/releases/tags/v{tag}. Accepts "0.2.5" or "v0.2.5". */
export function fetchReleaseByTag(
  tag: string,
  transport: UpdateTransport,
): Promise<ReleaseInfo>;

/** Picks the binary asset and checksums.txt from a release. Throws if either is missing. */
export function selectArtifact(
  release: ReleaseInfo,
  artifactName: string,
): PlatformArtifact;

/** Reads "<sha256>  <filename>" lines and returns the hash for artifactName. */
export function parseChecksum(text: string, artifactName: string): string;

/** Returns lowercase hex SHA-256 of data. */
export function computeSha256(data: Uint8Array): string;

/** Throws Error with expected/actual hashes if they don't match. */
export function verifyChecksum(data: Uint8Array, expected: string): void;

/** Numeric compare of "X.Y.Z" strings. -1 / 0 / 1. */
export function compareSemver(a: string, b: string): number;

/** Picks the action given current, target, and --force. */
export function computeAction(
  current: string,
  target: string,
  force: boolean,
): UpdateAction;

/**
 * Atomic install: write to "<binaryPath>.new", chmod 0755, drop macOS
 * quarantine xattr (best-effort), rename over binaryPath.
 */
export function installBinary(
  data: Uint8Array,
  target: { binaryPath: string; isDarwin: boolean },
): void;

/**
 * Orchestrates the whole update operation. argv excludes the leading
 * "update" subcommand. Throws on any failure; cli.ts converts to stderr+exit.
 */
export function runUpdateCommand(
  argv: string[],
  transport?: UpdateTransport,
): Promise<void>;
```

**Implementation Notes**:

- **Module organization**: per project convention (`private-module-helpers.md`), `runUpdateCommand` is the only "true" public entry. The other exports exist so unit tests can hit each pure function directly without going through the orchestrator. Helpers used only inside the orchestrator (`guidanceFor`, `printDryRunPlan`, `executePlan`, `parseReleaseJson`) are unexported.
- **Default transport**: a single object literal at module top. Each method sets `User-Agent: claude-mode/<VERSION>` (GitHub API requires a UA), follows redirects (asset URLs redirect to S3-backed CDNs), and on non-2xx throws `Error("HTTP <status> fetching <url>")`.
- **`parseUpdateArgs` rules**:
  - Unknown `--flag` → throw `Error("Unknown flag: --bogus")`.
  - Two positionals → throw `Error("Unexpected argument: <second>")`.
  - Conflicting flags (`--check` + `--force`, `--check` + `--dry-run`) are NOT rejected — `runUpdateCommand` honors `--check` first regardless. Documented in the help text.
- **`classifyInstall` ordering** (matches the test cases below):
  1. `basename(execPath)` ∈ {"bun", "bun-debug", "node"} → `source`.
  2. `buildInfo.dirty === true` → `dirty`.
  3. `buildInfo.repo && buildInfo.repo !== UPSTREAM_REPO_URL` → `fork`.
  4. Otherwise → `release` with `binaryPath = execPath`.
- **`detectArtifactName`**: only `linux`/`darwin` × `x64`/`arm64` are valid. Anything else throws with the exact unsupported value in the message. Mirrors `install.sh`'s case statements.
- **`fetchReleaseByTag`**: normalizes `"0.2.5"` → `"v0.2.5"` before forming the URL. Wraps the transport error so the user sees `"Could not find release v0.2.5: ..."` instead of a raw HTTP message.
- **`parseChecksum`**: regex `^([0-9a-f]{64})\s+\*?(.+)$/i`. Handles both `sha256sum` default (`<hash>  <name>`) and the `-b` binary form (`<hash> *<name>`). Lower-cases the returned hash for case-insensitive comparison in `verifyChecksum`.
- **`computeAction`**:
  - If `force === true` → `"reinstall"` regardless of comparison.
  - Else `compareSemver(current, target) === 0` → `"no-op"`.
  - Else `< 0` → `"install"`.
  - Else → `"downgrade"`.
- **`installBinary`**:
  - Stage at `${binaryPath}.new` so a partial write never leaves the live binary in a half-written state.
  - `chmodSync(stagingPath, 0o755)` even though Bun-compiled binaries usually arrive executable; explicit beats implicit.
  - macOS quarantine drop: `execSync('xattr -d com.apple.quarantine "..." 2>/dev/null', { stdio: "ignore" })` wrapped in try/catch — best-effort, missing attr is normal.
  - `renameSync(stagingPath, binaryPath)` is atomic on the same filesystem (POSIX guarantee). Replacing the running binary is safe on Linux/macOS — the kernel keeps the old inode alive for the running process.
- **`runUpdateCommand` flow** (orchestrator):
  1. `parseUpdateArgs(argv)`.
  2. `classifyInstall()` — throw with `guidanceFor(kind)` appended if not `release`.
  3. `detectArtifactName()`.
  4. Print `"Checking for updates..."`.
  5. Fetch release: `fetchReleaseByTag(opts.targetTag, transport)` if pinned, else `fetchLatestRelease(transport)`.
  6. `computeAction(VERSION, release.version, opts.force)`.
  7. Print `Current: ...\nLatest: ...`.
  8. If `--check`: print human-readable status (`Up to date.` / `Update available: X -> Y` / `Older version available: Y (current: X)`) and return.
  9. If action is `no-op` and not `--force`: print `"Already up to date."` and return.
  10. `selectArtifact(release, artifactName)` — fails fast if assets missing.
  11. If `--dry-run`: call `printDryRunPlan(plan)` (lists every URL, hash source, target path) and return.
  12. `executePlan(plan, transport)` — parallel fetch of binary + checksums, verify, install.
  13. Print `"Installed claude-mode <target> at <binaryPath>"`.
- **Error policy** (matches `fail-fast-errors.md`): every failure throws an `Error` with a descriptive message; `cli.ts` already has the single try/catch that turns this into `stderr + exit(1)`. Do not add per-step try/catch — the orchestrator just lets errors bubble.
- **No `--install-dir` flag**: the binary's path is `process.execPath`. Updating in place means we never need to know the install dir — that was an install-time decision and should not be re-litigated by update. `CLAUDE_MODE_INSTALL` (used by `install.sh`) is therefore irrelevant here. Documented in the help text.

**Acceptance Criteria**:
- [ ] `parseUpdateArgs([])` returns `{ check:false, force:false, dryRun:false, targetTag:null }`.
- [ ] `parseUpdateArgs(["--check", "--force", "--dry-run", "0.2.5"])` returns all flags true and `targetTag: "0.2.5"`.
- [ ] `parseUpdateArgs(["--bogus"])` throws with message containing `"--bogus"`.
- [ ] `parseUpdateArgs(["0.2.5", "0.2.6"])` throws with message containing `"Unexpected argument"`.
- [ ] `classifyInstall("/home/u/.bun/bin/bun", clean)` returns `{ kind: "source" }`.
- [ ] `classifyInstall("/home/u/.local/bin/claude-mode", { ...clean, dirty: true })` returns `{ kind: "dirty" }`.
- [ ] `classifyInstall(exe, { repo: "https://github.com/fork/x.git", ... })` returns `{ kind: "fork" }`.
- [ ] `classifyInstall(exe, { repo: UPSTREAM_REPO_URL, dirty: false, ... })` returns `{ kind: "release", binaryPath: exe }`.
- [ ] `classifyInstall(exe, { repo: null, dirty: false, ... })` returns `{ kind: "release" }`.
- [ ] `detectArtifactName("linux", "x64")` returns `"claude-mode-linux-x64"`.
- [ ] `detectArtifactName("darwin", "arm64")` returns `"claude-mode-darwin-arm64"`.
- [ ] `detectArtifactName("win32", "x64")` throws containing `"Unsupported platform"`.
- [ ] `detectArtifactName("linux", "ia32")` throws containing `"Unsupported architecture"`.
- [ ] `parseChecksum("abc...64chars  claude-mode-linux-x64\n", "claude-mode-linux-x64")` returns the hash.
- [ ] `parseChecksum("...", "missing")` throws containing `"Could not find checksum"`.
- [ ] `verifyChecksum(data, computeSha256(data))` does not throw.
- [ ] `verifyChecksum(data, "0".repeat(64))` throws containing both expected and actual hashes.
- [ ] `compareSemver("1.0.0", "1.0.1")` returns negative; `("2.0.0", "1.9.9")` positive; equal returns 0.
- [ ] `computeAction("1.0.0", "1.0.0", false) === "no-op"`; `(_, _, true) === "reinstall"`.
- [ ] `computeAction("1.0.0", "1.1.0", false) === "install"`.
- [ ] `computeAction("1.1.0", "1.0.0", false) === "downgrade"`.
- [ ] `selectArtifact` returns matching binary + checksums asset; throws when either is missing with the missing name in the message.
- [ ] `runUpdateCommand` with mocked transport: `--check` on outdated prints `"Update available: X -> Y"` and does not call `fetchBytes`.
- [ ] `runUpdateCommand` with mocked transport and `--dry-run`: prints plan, does not call `fetchBytes`/`fetchText` for the artifact, does not call `installBinary`.
- [ ] `runUpdateCommand` from a source build (mocked `classifyInstall`) throws containing `"git pull"` (per `guidanceFor("source")`).

---

### Unit 2: CLI subcommand routing

**File**: `src/cli.ts` (modification)

Add an `update` subcommand block beside the existing `config` and `inspect` blocks, before `parseCliArgs` runs:

```typescript
// After the `inspect` block, before parseCliArgs:

if (argv[0] === "update") {
  try {
    await runUpdateCommand(argv.slice(1));
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }
  process.exit(0);
}
```

Add the import at the top:

```typescript
import { runUpdateCommand } from "./update.js";
```

**Implementation Notes**:
- `main()` is already `async`, so `await runUpdateCommand(...)` slots in cleanly.
- `update` is dispatched BEFORE `parseCliArgs`. That matters because `--check`, `--force`, `--dry-run`, and a positional version are not part of the `claude-mode <preset>` arg surface — sending them through `parseCliArgs` would mis-classify them as preset/passthrough.
- The single try/catch around the call mirrors the `config`/`inspect` blocks. No new error handling is needed inside `update.ts`.
- The top-level `--version` precheck stays unchanged. `claude-mode update --version` would currently be rejected by that precheck; that's fine — pinning uses a positional argument (`claude-mode update 0.2.5`), not a flag, specifically to avoid colliding with the standalone `--version`.

**Acceptance Criteria**:
- [ ] `claude-mode update --bogus` exits non-zero with stderr containing `"Unknown flag: --bogus"`.
- [ ] `claude-mode update --check` (mocked transport / live network in manual test) exits 0 and prints status.
- [ ] `claude-mode update` followed by any successful run exits 0.
- [ ] `claude-mode update` followed by an error throws (existing single try/catch turns this into stderr + exit 1).
- [ ] No regressions: existing `config`, `inspect`, preset, `--version`, `--help` paths still work.

---

### Unit 3: Usage text

**File**: `src/usage.ts` (modification)

Add `update` to the Subcommands list and add an example. Replace the current `Subcommands:` block and add to the `Examples:` block:

```typescript
const usage = `Usage: claude-mode [preset] [options] [-- claude-args...]

Subcommands:
  config            Manage configuration
  inspect [--print] Show prompt assembly plan with provenance and warnings
  update [version]  Update the installed binary from GitHub Releases

Update flags (passed after the "update" subcommand):
  --check           Check for updates without installing
  --force           Reinstall the same version (repair a corrupted install)
  --dry-run         Show what would happen without writing anything
  <version>         Install a specific release tag (e.g. "0.2.5"); default is latest

Info:
  --version         Print claude-mode version and exit
  --help, -h        Show this help

...

Examples:
  ...
  claude-mode update                          # update to the latest release
  claude-mode update --check                  # check for updates without installing
  claude-mode update 0.2.5                    # pin to a specific version (downgrade or reinstall)
  claude-mode update --force                  # reinstall the same version (repair)`;
```

**Implementation Notes**:
- Keep the existing examples and only append the four update lines so the diff is minimal.
- Keep the help under one screen; the four added lines fit.

**Acceptance Criteria**:
- [ ] `claude-mode --help` output contains the line `update [version]  Update the installed binary from GitHub Releases`.
- [ ] Output contains all four update-flag lines.
- [ ] Output contains all four update example lines.
- [ ] Total help text still fits in a typical 50-line terminal.

---

### Unit 4: Tests

**File**: `src/update.test.ts` (new)

Pure-function and orchestrator tests using `bun:test` and a hand-rolled `UpdateTransport` fake. No live network. Follows the `Base Fixture + Spread Override` pattern for `BuildInfo` (`as-const-enum.md`, `test-fixture-spread.md`).

```typescript
import { test, expect, describe } from "bun:test";
import {
  parseUpdateArgs,
  classifyInstall,
  detectArtifactName,
  selectArtifact,
  parseChecksum,
  computeSha256,
  verifyChecksum,
  compareSemver,
  computeAction,
  runUpdateCommand,
  type ReleaseInfo,
  type UpdateTransport,
} from "./update.js";
import type { BuildInfo } from "./build-info.js";

const CLEAN_RELEASE_BUILD: BuildInfo = {
  repo: "https://github.com/nklisch/claude-code-modes.git",
  branch: null,
  commit: "abc1234",
  dirty: false,
};
const FAKE_BIN_PATH = "/home/u/.local/bin/claude-mode";

// ---- parseUpdateArgs ----

describe("parseUpdateArgs", () => {
  test("no args returns defaults");
  test("--check");
  test("--force");
  test("--dry-run");
  test("positional becomes targetTag");
  test("all flags + positional combined");
  test("unknown flag throws");
  test("two positionals throws");
});

// ---- classifyInstall ----

describe("classifyInstall", () => {
  test("bun runtime is source", () => {
    expect(classifyInstall("/h/.bun/bin/bun", CLEAN_RELEASE_BUILD).kind).toBe("source");
  });
  test("bun-debug is source");
  test("node is source");
  test("dirty worktree is dirty", () => {
    const c = classifyInstall(FAKE_BIN_PATH, { ...CLEAN_RELEASE_BUILD, dirty: true });
    expect(c.kind).toBe("dirty");
  });
  test("non-upstream repo is fork", () => {
    const c = classifyInstall(FAKE_BIN_PATH, { ...CLEAN_RELEASE_BUILD, repo: "https://github.com/fork/x.git" });
    expect(c.kind).toBe("fork");
  });
  test("clean upstream binary is release", () => {
    const c = classifyInstall(FAKE_BIN_PATH, CLEAN_RELEASE_BUILD);
    expect(c).toEqual({ kind: "release", binaryPath: FAKE_BIN_PATH });
  });
  test("null repo (e.g. git missing at build) is release", () => {
    const c = classifyInstall(FAKE_BIN_PATH, { ...CLEAN_RELEASE_BUILD, repo: null });
    expect(c.kind).toBe("release");
  });
});

// ---- detectArtifactName ----

describe("detectArtifactName", () => {
  test.each([
    ["linux", "x64", "claude-mode-linux-x64"],
    ["linux", "arm64", "claude-mode-linux-arm64"],
    ["darwin", "x64", "claude-mode-darwin-x64"],
    ["darwin", "arm64", "claude-mode-darwin-arm64"],
  ])("%s/%s → %s", (p, a, expected) => {
    expect(detectArtifactName(p, a)).toBe(expected);
  });
  test("win32 throws");
  test("ia32 throws");
});

// ---- parseChecksum ----

describe("parseChecksum", () => {
  test("sha256sum default format (two spaces)");
  test("sha256sum binary format (space + asterisk)");
  test("missing artifact throws");
  test("malformed lines are skipped");
});

// ---- computeSha256 / verifyChecksum ----

describe("checksum verification", () => {
  test("matching hash passes");
  test("mismatched hash throws with both hashes in message");
  test("case-insensitive comparison");
});

// ---- compareSemver / computeAction ----

describe("semver", () => {
  test.each([
    ["1.0.0", "1.0.0", 0],
    ["1.0.0", "1.0.1", -1],
    ["1.0.1", "1.0.0", 1],
    ["2.0.0", "1.9.9", 1],
    ["1.10.0", "1.9.0", 1],
  ])("compareSemver(%s, %s) ≷ %d");

  test("computeAction equal + force = reinstall");
  test("computeAction equal + no-force = no-op");
  test("computeAction lower + no-force = install");
  test("computeAction higher + no-force = downgrade");
});

// ---- selectArtifact ----

describe("selectArtifact", () => {
  const release: ReleaseInfo = {
    tag: "v0.2.99", version: "0.2.99",
    assets: [
      { name: "claude-mode-linux-x64", url: "https://example.com/bin" },
      { name: "checksums.txt", url: "https://example.com/sums" },
    ],
  };
  test("returns binary + checksums");
  test("missing binary throws with available list");
  test("missing checksums throws");
});

// ---- runUpdateCommand (orchestrator) ----

describe("runUpdateCommand", () => {
  // Helper builds a transport pre-loaded with a fake release + binary
  function makeTransport(opts: { version: string }): {
    transport: UpdateTransport;
    calls: { fetchJson: number; fetchBytes: number; fetchText: number };
  } { ... }

  test("--check on outdated reports update and skips download");
  test("--check on equal reports up-to-date");
  test("--dry-run prints plan and skips installBinary");
  test("source build refuses with guidance");
  test("dirty build refuses with guidance");
  test("fork build refuses with guidance");
  test("checksum mismatch aborts before installBinary");
});
```

**Implementation Notes**:
- `runUpdateCommand` tests capture stdout/stderr by overriding `process.stdout.write` for the duration of each test (existing tests in `version.test.ts` and `inspect.test.ts` use the same pattern — match them).
- Tests for paths that would actually call `installBinary` (real file write) are **out of scope** for unit tests — covered manually via the verification checklist. Unit tests stop at `--dry-run` and `--check` to keep tests hermetic.
- For the "source/dirty/fork build refuses" tests, mock `classifyInstall` is not needed — those tests can pass their own `BuildInfo` to a thin wrapper, or alternatively assert via the integration test (Unit 5) which runs through `bun run` (always source mode) and verifies the refusal message.

**Acceptance Criteria**:
- [ ] All 30+ test cases above pass.
- [ ] `bun test src/update.test.ts` runs in under 5 seconds (no live network).
- [ ] Tests use no live network.
- [ ] Tests do not write to disk outside `tmpdir()` (and the install path is never touched).

---

### Unit 5: Integration test via CLI

**File**: `src/cli.test.ts` (additions)

Add three end-to-end checks via the existing `createCliRunner`. These run `bun src/cli.ts update ...`, which is always classified as source mode (since `process.execPath` is `bun`), so they exercise the routing + refusal path without touching the network.

```typescript
test("update --bogus rejects unknown flag", () => {
  const out = runExpectFail("update --bogus");
  expect(out).toContain("Unknown flag");
  expect(out).toContain("--bogus");
});

test("update from source build refuses with guidance", () => {
  const out = runExpectFail("update --check");
  expect(out).toContain("source");        // kind
  expect(out).toContain("git pull");      // guidance
});

test("update help mentions in main usage", () => {
  const out = run("--help");
  expect(out).toContain("update [version]");
  expect(out).toContain("--check");
  expect(out).toContain("--dry-run");
});
```

**Implementation Notes**:
- The two-positional and unknown-flag rejections come straight from `parseUpdateArgs`. The source-build refusal comes from `classifyInstall` running against the real `process.execPath` (which is `bun` during `bun run`).
- These tests do not — and must not — hit the network. They all fail before any HTTP call.

**Acceptance Criteria**:
- [ ] All three tests pass via `bun test src/cli.test.ts`.
- [ ] No network calls made.

---

### Unit 6: README documentation

**File**: `README.md` (modification)

Add a short "Updating" section between "Install" and "Usage", and link from the install section. Minimal addition — no large rewrite:

```markdown
## Updating

If you installed the binary via `install.sh`:

\`\`\`bash
claude-mode update              # update to the latest release
claude-mode update --check      # check without installing
claude-mode update 0.2.5        # pin a specific version (downgrade or reinstall)
claude-mode update --force      # reinstall same version (repair a corrupt binary)
claude-mode update --dry-run    # show what would happen
\`\`\`

`update` only works on binaries built from the upstream repo. If you're running from a `git clone` checkout (`bun link`), use `git pull && bun link` instead. If you're running a fork build, update via your fork's release process.
```

**Implementation Notes**:
- Keep tone consistent with existing README sections (terse, code-block-heavy).
- No need to mirror every flag detail; `claude-mode --help` is the source of truth.

**Acceptance Criteria**:
- [ ] Section exists between "Install" and "Usage".
- [ ] All four common invocations are shown.
- [ ] Source-build escape hatch is explained.

---

## Implementation Order

1. **Unit 1: Update module** — pure logic + types. No CLI integration yet; tested in isolation.
2. **Unit 4: Tests** — written alongside Unit 1 (TDD-friendly). Pure-function tests can be written first and drive the function signatures.
3. **Unit 2: CLI subcommand routing** — wire `runUpdateCommand` into `cli.ts`.
4. **Unit 3: Usage text** — update help.
5. **Unit 5: Integration test** — once routing is wired.
6. **Unit 6: README documentation** — last, after the behavior is locked.

Units 1+4 are coupled (test-driven). Units 2/3/5 are independent of each other once Unit 1 is in. Unit 6 is purely docs.

---

## Testing

### Unit Tests: `src/update.test.ts`

Covered in Unit 4 above. Summary of coverage:

| Function | Cases |
|---|---|
| `parseUpdateArgs` | defaults, each flag, positional, combined, unknown flag, two positionals |
| `classifyInstall` | bun, bun-debug, node, dirty, fork, clean upstream, null repo |
| `detectArtifactName` | 4 supported pairs, unsupported platform, unsupported arch |
| `parseChecksum` | default format, binary format, missing, malformed |
| `verifyChecksum` | match, mismatch (with both hashes in message), case-insensitive |
| `compareSemver` | equal, less, greater, multi-digit |
| `computeAction` | each of `install`/`no-op`/`downgrade`/`reinstall` |
| `selectArtifact` | match, missing binary, missing checksums |
| `runUpdateCommand` | --check (outdated/equal), --dry-run, source/dirty/fork refusal, checksum mismatch |

### Integration Tests: `src/cli.test.ts`

| Case | Assertion |
|---|---|
| Unknown flag rejected | stderr contains `"Unknown flag: --bogus"`, exit non-zero |
| Source build refused | stderr contains `"source"` and `"git pull"`, exit non-zero |
| Help mentions update | stdout contains `"update [version]"`, `"--check"`, `"--dry-run"` |

### Manual Verification (real install path)

These cannot run in CI without polluting state. Run on a real installed binary in a scratch VM or after `install.sh` to a temp dir.

```bash
# 1. Install fresh
CLAUDE_MODE_INSTALL=/tmp/cmtest sh install.sh

# 2. Check (real network)
/tmp/cmtest/claude-mode update --check

# 3. Dry-run
/tmp/cmtest/claude-mode update --dry-run

# 4. Pin to an older version (verifies downgrade path)
/tmp/cmtest/claude-mode update 0.2.7

# 5. --force reinstalls the same version
/tmp/cmtest/claude-mode update --force

# 6. Update to latest
/tmp/cmtest/claude-mode update

# 7. Verify the new binary is executable and reports the new version
/tmp/cmtest/claude-mode --version
```

---

## Verification Checklist

```bash
# Generate prompts + build info, run the full test suite
bun run generate
bun test

# Confirm new tests are picked up
bun test src/update.test.ts

# Confirm CLI integration
bun run src/cli.ts update --bogus           # → "Error: Unknown flag: --bogus"
bun run src/cli.ts update --check           # → "Error: ... source ... git pull ..."
bun run src/cli.ts --help | grep -E "update|--check|--dry-run"

# Confirm a real release build can fetch (manual; uses live network)
bun run build
./claude-mode-bin update --check
./claude-mode-bin update --dry-run

# Optional: end-to-end real install path (in a scratch dir)
CLAUDE_MODE_INSTALL=/tmp/cmtest sh install.sh
/tmp/cmtest/claude-mode update --check
/tmp/cmtest/claude-mode update --dry-run
```
