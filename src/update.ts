import { writeFileSync, chmodSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { VERSION } from "./version.js";
import { BUILD_INFO, type BuildInfo } from "./build-info.js";

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------

/** Upstream repo slug — also referenced by install.sh and the release workflow. */
const UPSTREAM_REPO = "nklisch/claude-code-modes";

/** Normalized form of the upstream remote URL captured by build-info. */
const UPSTREAM_REPO_URL = "https://github.com/nklisch/claude-code-modes.git";

const USER_AGENT = `claude-mode/${VERSION}`;

const GITHUB_API_BASE = "https://api.github.com";

/** Basenames of interpreter runtimes — signals we're running from source. */
const SOURCE_EXEC_NAMES = new Set(["bun", "bun-debug", "node"]);

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
// Default transport
// ----------------------------------------------------------------------

async function apiFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res;
}

export const defaultTransport: UpdateTransport = {
  async fetchJson(url: string): Promise<unknown> {
    const res = await apiFetch(url);
    return res.json();
  },
  async fetchBytes(url: string): Promise<Uint8Array> {
    const res = await apiFetch(url);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  },
  async fetchText(url: string): Promise<string> {
    const res = await apiFetch(url);
    return res.text();
  },
};

// ----------------------------------------------------------------------
// Public API — pure helpers
// ----------------------------------------------------------------------

/** Parses argv (after "update" has been stripped). Throws on unknown flags. */
export function parseUpdateArgs(argv: string[]): UpdateOptions {
  const opts: UpdateOptions = { check: false, force: false, dryRun: false, targetTag: null };

  for (const arg of argv) {
    if (arg === "--check") {
      opts.check = true;
    } else if (arg === "--force") {
      opts.force = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      // Positional argument (version tag)
      if (opts.targetTag !== null) {
        throw new Error(`Unexpected argument: ${arg}`);
      }
      opts.targetTag = arg;
    }
  }

  return opts;
}

/** Determines whether the running binary is safe to self-update. Pure. */
export function classifyInstall(
  execPath: string = process.execPath,
  buildInfo: BuildInfo = BUILD_INFO,
): InstallClassification {
  // 1. Runtime interpreter → source mode
  if (SOURCE_EXEC_NAMES.has(basename(execPath))) {
    return {
      kind: "source",
      reason: `Running as ${basename(execPath)} runtime (source mode)`,
    };
  }

  // 2. Dirty working tree → dev build
  if (buildInfo.dirty === true) {
    return {
      kind: "dirty",
      reason: "Binary was built from a dirty working tree",
    };
  }

  // 3. Non-upstream repo → fork build
  if (buildInfo.repo && buildInfo.repo !== UPSTREAM_REPO_URL) {
    return {
      kind: "fork",
      reason: `Binary was built from a fork: ${buildInfo.repo}`,
    };
  }

  // 4. Otherwise → safe to update
  return { kind: "release", binaryPath: execPath };
}

/** Maps process.platform/process.arch → release artifact name. Throws on unsupported. */
export function detectArtifactName(
  platformVal: string = process.platform,
  archVal: string = process.arch,
): string {
  const SUPPORTED_PLATFORMS = ["linux", "darwin"] as const;
  const SUPPORTED_ARCHES = ["x64", "arm64"] as const;

  type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];
  type SupportedArch = (typeof SUPPORTED_ARCHES)[number];

  if (!(SUPPORTED_PLATFORMS as readonly string[]).includes(platformVal)) {
    throw new Error(
      `Unsupported platform: "${platformVal}". ` +
      `claude-mode update only supports: ${SUPPORTED_PLATFORMS.join(", ")}.`,
    );
  }
  if (!(SUPPORTED_ARCHES as readonly string[]).includes(archVal)) {
    throw new Error(
      `Unsupported architecture: "${archVal}". ` +
      `claude-mode update only supports: ${SUPPORTED_ARCHES.join(", ")}.`,
    );
  }

  const platform = platformVal as SupportedPlatform;
  const arch = archVal as SupportedArch;
  return `claude-mode-${platform}-${arch}`;
}

/** Hits GET /repos/{repo}/releases/latest. */
export async function fetchLatestRelease(transport: UpdateTransport): Promise<ReleaseInfo> {
  const url = `${GITHUB_API_BASE}/repos/${UPSTREAM_REPO}/releases/latest`;
  const data = await transport.fetchJson(url);
  return parseReleaseJson(data);
}

/** Hits GET /repos/{repo}/releases/tags/v{tag}. Accepts "0.2.5" or "v0.2.5". */
export async function fetchReleaseByTag(
  tag: string,
  transport: UpdateTransport,
): Promise<ReleaseInfo> {
  const normalizedTag = tag.startsWith("v") ? tag : `v${tag}`;
  const url = `${GITHUB_API_BASE}/repos/${UPSTREAM_REPO}/releases/tags/${normalizedTag}`;
  try {
    const data = await transport.fetchJson(url);
    return parseReleaseJson(data);
  } catch (err) {
    throw new Error(`Could not find release ${normalizedTag}: ${(err as Error).message}`);
  }
}

/** Picks the binary asset and checksums.txt from a release. Throws if either is missing. */
export function selectArtifact(release: ReleaseInfo, artifactName: string): PlatformArtifact {
  const binary = release.assets.find((a) => a.name === artifactName);
  const checksums = release.assets.find((a) => a.name === "checksums.txt");

  if (!binary) {
    const available = release.assets.map((a) => a.name).join(", ");
    throw new Error(
      `Could not find binary "${artifactName}" in release ${release.tag}. ` +
      `Available assets: ${available}`,
    );
  }
  if (!checksums) {
    throw new Error(
      `Could not find "checksums.txt" in release ${release.tag}. ` +
      `Available assets: ${release.assets.map((a) => a.name).join(", ")}`,
    );
  }

  return { binary, checksums, artifactName };
}

/** Reads "<sha256>  <filename>" lines and returns the hash for artifactName. */
export function parseChecksum(text: string, artifactName: string): string {
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (match && match[2].trim() === artifactName) {
      return match[1].toLowerCase();
    }
  }
  throw new Error(`Could not find checksum for "${artifactName}" in checksums.txt`);
}

/** Returns lowercase hex SHA-256 of data. */
export function computeSha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex").toLowerCase();
}

/** Throws Error with expected/actual hashes if they don't match. */
export function verifyChecksum(data: Uint8Array, expected: string): void {
  const actual = computeSha256(data);
  if (actual !== expected.toLowerCase()) {
    throw new Error(
      `Checksum mismatch!\n` +
      `  Expected: ${expected.toLowerCase()}\n` +
      `  Actual:   ${actual}`,
    );
  }
}

/** Numeric compare of "X.Y.Z" strings. -1 / 0 / 1. */
export function compareSemver(a: string, b: string): number {
  const parseVer = (v: string): number[] =>
    v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10));

  const aParts = parseVer(a);
  const bParts = parseVer(b);

  for (let i = 0; i < 3; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff < 0) return -1;
    if (diff > 0) return 1;
  }
  return 0;
}

/** Picks the action given current, target, and --force. */
export function computeAction(
  current: string,
  target: string,
  force: boolean,
): UpdateAction {
  if (force) return "reinstall";
  const cmp = compareSemver(current, target);
  if (cmp === 0) return "no-op";
  if (cmp < 0) return "install";
  return "downgrade";
}

/**
 * Atomic install: write to "<binaryPath>.new", chmod 0755, drop macOS
 * quarantine xattr (best-effort), rename over binaryPath.
 */
export function installBinary(
  data: Uint8Array,
  target: { binaryPath: string; isDarwin: boolean },
): void {
  const stagingPath = `${target.binaryPath}.new`;
  writeFileSync(stagingPath, data);
  chmodSync(stagingPath, 0o755);

  if (target.isDarwin) {
    try {
      execSync(`xattr -d com.apple.quarantine "${stagingPath}" 2>/dev/null`, { stdio: "ignore" });
    } catch {
      // Best-effort — missing xattr attribute is normal
    }
  }

  renameSync(stagingPath, target.binaryPath);
}

// ----------------------------------------------------------------------
// Orchestrator internals (unexported)
// ----------------------------------------------------------------------

function guidanceFor(kind: "source" | "dirty" | "fork"): string {
  if (kind === "source") {
    return "To update, use: git pull && bun install";
  }
  if (kind === "dirty") {
    return "Commit or stash your changes, build a clean binary, then run update.";
  }
  // fork
  return "Update via your fork's release process.";
}

function printDryRunPlan(plan: UpdatePlan): void {
  process.stdout.write(`Dry-run plan:\n`);
  process.stdout.write(`  Action:         ${plan.action}\n`);
  process.stdout.write(`  Current:        ${plan.current}\n`);
  process.stdout.write(`  Target:         ${plan.target} (${plan.tag})\n`);
  process.stdout.write(`  Binary URL:     ${plan.artifact.binary.url}\n`);
  process.stdout.write(`  Checksums URL:  ${plan.artifact.checksums.url}\n`);
  process.stdout.write(`  Artifact:       ${plan.artifact.artifactName}\n`);
  process.stdout.write(`  Install path:   ${plan.binaryPath}\n`);
  process.stdout.write(`  (No changes written)\n`);
}

async function executePlan(plan: UpdatePlan, transport: UpdateTransport): Promise<void> {
  // Fetch binary and checksums in parallel
  const [binaryData, checksumsText] = await Promise.all([
    transport.fetchBytes(plan.artifact.binary.url),
    transport.fetchText(plan.artifact.checksums.url),
  ]);

  const expectedHash = parseChecksum(checksumsText, plan.artifact.artifactName);
  verifyChecksum(binaryData, expectedHash);

  installBinary(binaryData, {
    binaryPath: plan.binaryPath,
    isDarwin: process.platform === "darwin",
  });
}

/** Parses a raw GitHub release API response into a ReleaseInfo. */
function parseReleaseJson(data: unknown): ReleaseInfo {
  const raw = data as Record<string, unknown>;
  const tag = raw["tag_name"] as string;
  const version = tag.startsWith("v") ? tag.slice(1) : tag;
  const rawAssets = (raw["assets"] as Record<string, unknown>[]) ?? [];
  const assets: ReleaseAsset[] = rawAssets.map((a) => ({
    name: a["name"] as string,
    url: a["browser_download_url"] as string,
  }));
  return { tag, version, assets };
}

// ----------------------------------------------------------------------
// Orchestrator (public entry point)
// ----------------------------------------------------------------------

/**
 * Orchestrates the whole update operation. argv excludes the leading
 * "update" subcommand. Throws on any failure; cli.ts converts to stderr+exit.
 */
export async function runUpdateCommand(
  argv: string[],
  transport: UpdateTransport = defaultTransport,
): Promise<void> {
  // 1. Parse args
  const opts = parseUpdateArgs(argv);

  // 2. Classify install — refuse if not a release build
  const classification = classifyInstall();
  if (classification.kind !== "release") {
    const guidance = guidanceFor(classification.kind);
    throw new Error(
      `Cannot self-update: ${classification.reason}.\n${guidance}`,
    );
  }
  const binaryPath = classification.binaryPath;

  // 3. Detect artifact name for this platform
  const artifactName = detectArtifactName();

  // 4. Fetch the target release
  process.stdout.write("Checking for updates...\n");
  const release = opts.targetTag
    ? await fetchReleaseByTag(opts.targetTag, transport)
    : await fetchLatestRelease(transport);

  // 5. Compute action
  const action = computeAction(VERSION, release.version, opts.force);

  // 6. Print status
  process.stdout.write(`Current: ${VERSION}\n`);
  process.stdout.write(`Latest:  ${release.version}\n`);

  // 7. --check: print human-readable status and return
  if (opts.check) {
    if (action === "no-op") {
      process.stdout.write("Up to date.\n");
    } else if (action === "install") {
      process.stdout.write(`Update available: ${VERSION} -> ${release.version}\n`);
    } else if (action === "downgrade") {
      process.stdout.write(`Older version available: ${release.version} (current: ${VERSION})\n`);
    } else {
      // reinstall (--force + --check)
      process.stdout.write(`Will reinstall: ${release.version}\n`);
    }
    return;
  }

  // 8. no-op without --force
  if (action === "no-op") {
    process.stdout.write("Already up to date.\n");
    return;
  }

  // 9. Select the platform artifact
  const artifact = selectArtifact(release, artifactName);

  const plan: UpdatePlan = {
    current: VERSION,
    target: release.version,
    tag: release.tag,
    artifact,
    binaryPath,
    action,
  };

  // 10. --dry-run: print the plan and return
  if (opts.dryRun) {
    printDryRunPlan(plan);
    return;
  }

  // 11. Execute
  await executePlan(plan, transport);
  process.stdout.write(`Installed claude-mode ${plan.target} at ${binaryPath}\n`);
}
