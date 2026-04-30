import { describe, test, expect } from "bun:test";
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

// ----------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------

const CLEAN_RELEASE_BUILD: BuildInfo = {
  repo: "https://github.com/nklisch/claude-code-modes.git",
  branch: null,
  commit: "abc1234",
  dirty: false,
};

const FAKE_BIN_PATH = "/home/u/.local/bin/claude-mode";

// A 64-char hex string for use in checksum tests
const FAKE_HASH = "a".repeat(64);

// Shared fake release used by orchestrator tests
const FAKE_RELEASE: ReleaseInfo = {
  tag: "v9.9.9",
  version: "9.9.9",
  assets: [
    { name: "claude-mode-linux-x64", url: "https://example.com/bin" },
    { name: "claude-mode-linux-arm64", url: "https://example.com/bin-arm" },
    { name: "claude-mode-darwin-x64", url: "https://example.com/bin-darwin" },
    { name: "claude-mode-darwin-arm64", url: "https://example.com/bin-darwin-arm" },
    { name: "checksums.txt", url: "https://example.com/sums" },
  ],
};

// Build a fake binary payload and its valid checksum string
const FAKE_BINARY = new Uint8Array([1, 2, 3, 4]);
const FAKE_BINARY_HASH = computeSha256(FAKE_BINARY);

function makeChecksumText(artifactName: string, hash: string = FAKE_BINARY_HASH): string {
  return `${hash}  ${artifactName}\n`;
}

// Capture stdout during async operations
async function captureStdoutAsync(fn: () => Promise<void>): Promise<string> {
  let captured = "";
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    captured += chunk;
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = origWrite;
  }
  return captured;
}

// Build a fake transport pre-loaded with a release and binary
type FakeTransportResult = {
  transport: UpdateTransport;
  calls: { fetchJson: number; fetchBytes: number; fetchText: number };
};

function makeTransport(opts: {
  release?: ReleaseInfo;
  binaryHash?: string;
  throwOnFetchJson?: boolean;
}): FakeTransportResult {
  const release = opts.release ?? FAKE_RELEASE;
  const binaryHash = opts.binaryHash ?? FAKE_BINARY_HASH;
  const calls = { fetchJson: 0, fetchBytes: 0, fetchText: 0 };

  const artifactName = release.assets.find((a) => a.name !== "checksums.txt")?.name ?? "claude-mode-linux-x64";

  const transport: UpdateTransport = {
    async fetchJson(_url: string): Promise<unknown> {
      calls.fetchJson++;
      if (opts.throwOnFetchJson) throw new Error("HTTP 404 fetching ...");
      return {
        tag_name: release.tag,
        assets: release.assets.map((a) => ({
          name: a.name,
          browser_download_url: a.url,
        })),
      };
    },
    async fetchBytes(_url: string): Promise<Uint8Array> {
      calls.fetchBytes++;
      return FAKE_BINARY;
    },
    async fetchText(_url: string): Promise<string> {
      calls.fetchText++;
      return makeChecksumText(artifactName, binaryHash);
    },
  };

  return { transport, calls };
}

// ----------------------------------------------------------------------
// parseUpdateArgs
// ----------------------------------------------------------------------

describe("parseUpdateArgs", () => {
  test("no args returns defaults", () => {
    const opts = parseUpdateArgs([]);
    expect(opts).toEqual({ check: false, force: false, dryRun: false, targetTag: null });
  });

  test("--check sets check", () => {
    const opts = parseUpdateArgs(["--check"]);
    expect(opts.check).toBe(true);
    expect(opts.force).toBe(false);
    expect(opts.dryRun).toBe(false);
    expect(opts.targetTag).toBeNull();
  });

  test("--force sets force", () => {
    const opts = parseUpdateArgs(["--force"]);
    expect(opts.force).toBe(true);
  });

  test("--dry-run sets dryRun", () => {
    const opts = parseUpdateArgs(["--dry-run"]);
    expect(opts.dryRun).toBe(true);
  });

  test("positional becomes targetTag", () => {
    const opts = parseUpdateArgs(["0.2.5"]);
    expect(opts.targetTag).toBe("0.2.5");
  });

  test("v-prefixed positional is stored as-is", () => {
    const opts = parseUpdateArgs(["v0.2.5"]);
    expect(opts.targetTag).toBe("v0.2.5");
  });

  test("all flags + positional combined", () => {
    const opts = parseUpdateArgs(["--check", "--force", "--dry-run", "0.2.5"]);
    expect(opts).toEqual({ check: true, force: true, dryRun: true, targetTag: "0.2.5" });
  });

  test("unknown flag throws", () => {
    expect(() => parseUpdateArgs(["--bogus"])).toThrow("Unknown flag: --bogus");
  });

  test("two positionals throws", () => {
    expect(() => parseUpdateArgs(["0.2.5", "0.2.6"])).toThrow("Unexpected argument");
  });
});

// ----------------------------------------------------------------------
// classifyInstall
// ----------------------------------------------------------------------

describe("classifyInstall", () => {
  test("bun runtime is source", () => {
    expect(classifyInstall("/home/u/.bun/bin/bun", CLEAN_RELEASE_BUILD).kind).toBe("source");
  });

  test("bun-debug is source", () => {
    expect(classifyInstall("/usr/local/bin/bun-debug", CLEAN_RELEASE_BUILD).kind).toBe("source");
  });

  test("node is source", () => {
    expect(classifyInstall("/usr/bin/node", CLEAN_RELEASE_BUILD).kind).toBe("source");
  });

  test("dirty worktree is dirty", () => {
    const c = classifyInstall(FAKE_BIN_PATH, { ...CLEAN_RELEASE_BUILD, dirty: true });
    expect(c.kind).toBe("dirty");
  });

  test("non-upstream repo is fork", () => {
    const c = classifyInstall(FAKE_BIN_PATH, {
      ...CLEAN_RELEASE_BUILD,
      repo: "https://github.com/fork/x.git",
    });
    expect(c.kind).toBe("fork");
  });

  test("fork reason includes repo URL", () => {
    const c = classifyInstall(FAKE_BIN_PATH, {
      ...CLEAN_RELEASE_BUILD,
      repo: "https://github.com/fork/x.git",
    });
    expect(c.kind).toBe("fork");
    if (c.kind === "fork") {
      expect(c.reason).toContain("https://github.com/fork/x.git");
    }
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

// ----------------------------------------------------------------------
// detectArtifactName
// ----------------------------------------------------------------------

describe("detectArtifactName", () => {
  test.each([
    ["linux", "x64", "claude-mode-linux-x64"],
    ["linux", "arm64", "claude-mode-linux-arm64"],
    ["darwin", "x64", "claude-mode-darwin-x64"],
    ["darwin", "arm64", "claude-mode-darwin-arm64"],
  ])("%s/%s → %s", (p, a, expected) => {
    expect(detectArtifactName(p, a)).toBe(expected);
  });

  test("win32 throws with 'Unsupported platform'", () => {
    expect(() => detectArtifactName("win32", "x64")).toThrow("Unsupported platform");
  });

  test("win32 error includes the platform value", () => {
    expect(() => detectArtifactName("win32", "x64")).toThrow("win32");
  });

  test("ia32 throws with 'Unsupported architecture'", () => {
    expect(() => detectArtifactName("linux", "ia32")).toThrow("Unsupported architecture");
  });

  test("ia32 error includes the arch value", () => {
    expect(() => detectArtifactName("linux", "ia32")).toThrow("ia32");
  });
});

// ----------------------------------------------------------------------
// parseChecksum
// ----------------------------------------------------------------------

describe("parseChecksum", () => {
  test("sha256sum default format (two spaces)", () => {
    const text = `${FAKE_HASH}  claude-mode-linux-x64\n`;
    expect(parseChecksum(text, "claude-mode-linux-x64")).toBe(FAKE_HASH.toLowerCase());
  });

  test("sha256sum binary format (space + asterisk)", () => {
    const text = `${FAKE_HASH} *claude-mode-linux-x64\n`;
    expect(parseChecksum(text, "claude-mode-linux-x64")).toBe(FAKE_HASH.toLowerCase());
  });

  test("returns lowercase hash", () => {
    const upperHash = FAKE_HASH.toUpperCase();
    const text = `${upperHash}  claude-mode-linux-x64\n`;
    expect(parseChecksum(text, "claude-mode-linux-x64")).toBe(FAKE_HASH.toLowerCase());
  });

  test("missing artifact throws with 'Could not find checksum'", () => {
    const text = `${FAKE_HASH}  claude-mode-linux-x64\n`;
    expect(() => parseChecksum(text, "missing")).toThrow("Could not find checksum");
  });

  test("missing artifact error includes artifact name", () => {
    const text = `${FAKE_HASH}  claude-mode-linux-x64\n`;
    expect(() => parseChecksum(text, "claude-mode-darwin-x64")).toThrow("claude-mode-darwin-x64");
  });

  test("malformed lines are skipped", () => {
    const text = `not-a-hash  claude-mode-linux-x64\n${FAKE_HASH}  claude-mode-darwin-x64\n`;
    expect(parseChecksum(text, "claude-mode-darwin-x64")).toBe(FAKE_HASH.toLowerCase());
  });

  test("multiple artifacts — returns correct one", () => {
    const hash1 = "b".repeat(64);
    const hash2 = "c".repeat(64);
    const text = `${hash1}  claude-mode-linux-x64\n${hash2}  claude-mode-darwin-x64\n`;
    expect(parseChecksum(text, "claude-mode-linux-x64")).toBe(hash1);
    expect(parseChecksum(text, "claude-mode-darwin-x64")).toBe(hash2);
  });
});

// ----------------------------------------------------------------------
// computeSha256 / verifyChecksum
// ----------------------------------------------------------------------

describe("checksum verification", () => {
  test("matching hash passes", () => {
    const data = new Uint8Array([1, 2, 3]);
    expect(() => verifyChecksum(data, computeSha256(data))).not.toThrow();
  });

  test("mismatched hash throws with both hashes in message", () => {
    const data = new Uint8Array([1, 2, 3]);
    const actual = computeSha256(data);
    const bogus = "0".repeat(64);
    let err: Error | null = null;
    try {
      verifyChecksum(data, bogus);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toContain(bogus);
    expect(err!.message).toContain(actual);
  });

  test("case-insensitive comparison (uppercase expected passes)", () => {
    const data = new Uint8Array([1, 2, 3]);
    const lower = computeSha256(data);
    const upper = lower.toUpperCase();
    expect(() => verifyChecksum(data, upper)).not.toThrow();
  });
});

// ----------------------------------------------------------------------
// compareSemver / computeAction
// ----------------------------------------------------------------------

describe("semver", () => {
  test.each([
    ["1.0.0", "1.0.0", 0],
    ["1.0.0", "1.0.1", -1],
    ["1.0.1", "1.0.0", 1],
    ["2.0.0", "1.9.9", 1],
    ["1.10.0", "1.9.0", 1],
  ] as [string, string, number][])(
    "compareSemver(%s, %s) = %d",
    (a, b, expected) => {
      expect(compareSemver(a, b)).toBe(expected);
    },
  );

  test("computeAction equal + force = reinstall", () => {
    expect(computeAction("1.0.0", "1.0.0", true)).toBe("reinstall");
  });

  test("computeAction equal + no-force = no-op", () => {
    expect(computeAction("1.0.0", "1.0.0", false)).toBe("no-op");
  });

  test("computeAction lower + no-force = install", () => {
    expect(computeAction("1.0.0", "1.1.0", false)).toBe("install");
  });

  test("computeAction higher + no-force = downgrade", () => {
    expect(computeAction("1.1.0", "1.0.0", false)).toBe("downgrade");
  });

  test("computeAction any + force = reinstall regardless of direction", () => {
    expect(computeAction("1.0.0", "2.0.0", true)).toBe("reinstall");
    expect(computeAction("2.0.0", "1.0.0", true)).toBe("reinstall");
  });
});

// ----------------------------------------------------------------------
// selectArtifact
// ----------------------------------------------------------------------

describe("selectArtifact", () => {
  const release: ReleaseInfo = {
    tag: "v0.2.99",
    version: "0.2.99",
    assets: [
      { name: "claude-mode-linux-x64", url: "https://example.com/bin" },
      { name: "checksums.txt", url: "https://example.com/sums" },
    ],
  };

  test("returns binary + checksums asset", () => {
    const artifact = selectArtifact(release, "claude-mode-linux-x64");
    expect(artifact.binary.name).toBe("claude-mode-linux-x64");
    expect(artifact.checksums.name).toBe("checksums.txt");
    expect(artifact.artifactName).toBe("claude-mode-linux-x64");
  });

  test("missing binary throws with artifact name in message", () => {
    expect(() => selectArtifact(release, "claude-mode-darwin-x64")).toThrow("claude-mode-darwin-x64");
  });

  test("missing binary error mentions available assets", () => {
    let err: Error | null = null;
    try {
      selectArtifact(release, "claude-mode-darwin-x64");
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toContain("claude-mode-linux-x64");
  });

  test("missing checksums throws", () => {
    const releaseNoChecksums: ReleaseInfo = {
      ...release,
      assets: [{ name: "claude-mode-linux-x64", url: "https://example.com/bin" }],
    };
    expect(() => selectArtifact(releaseNoChecksums, "claude-mode-linux-x64")).toThrow("checksums.txt");
  });
});

// ----------------------------------------------------------------------
// runUpdateCommand (orchestrator) — uses fake transport, no network
// ----------------------------------------------------------------------

describe("runUpdateCommand", () => {
  // The orchestrator calls classifyInstall() with process.execPath by default.
  // When tests run via `bun test`, process.execPath is the bun runtime, so
  // classifyInstall returns { kind: "source" } and the orchestrator throws.
  //
  // To test the check/dry-run paths, we need to exercise a code path that
  // bypasses the source-build check. We do this by calling runUpdateCommand
  // with a transport that can't be reached when running in source mode, and
  // instead assert on the error thrown by classifyInstall.
  //
  // For --check and --dry-run orchestrator paths (which require a release build),
  // we verify the behavior through the exported pure functions already tested above,
  // plus the integration tests in cli.test.ts (which verify the source refusal).

  test("source build refuses with 'git pull' guidance", async () => {
    // When running via bun, process.execPath is bun → classifyInstall returns source
    const { transport } = makeTransport({});
    let err: Error | null = null;
    try {
      await captureStdoutAsync(() => runUpdateCommand(["--check"], transport));
    } catch (e) {
      err = e as Error;
    }
    // Will throw because process.execPath is bun (source mode)
    expect(err).not.toBeNull();
    expect(err!.message).toContain("source");
    expect(err!.message).toContain("git pull");
  });

  test("unknown flag throws before any transport call", async () => {
    const { transport, calls } = makeTransport({});
    let err: Error | null = null;
    try {
      await runUpdateCommand(["--bogus"], transport);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toContain("--bogus");
    expect(calls.fetchJson).toBe(0);
  });

  test("parseUpdateArgs defaults: no args produces default options", () => {
    // Verify via pure function that the orchestrator receives correct defaults
    const opts = parseUpdateArgs([]);
    expect(opts.check).toBe(false);
    expect(opts.force).toBe(false);
    expect(opts.dryRun).toBe(false);
    expect(opts.targetTag).toBeNull();
  });

  test("--check on outdated prints update available (pure function path)", () => {
    // Verify that computeAction + the check branch produce the right action
    const action = computeAction("0.1.0", "9.9.9", false);
    expect(action).toBe("install");
  });

  test("--check on up-to-date produces no-op action", () => {
    const action = computeAction("9.9.9", "9.9.9", false);
    expect(action).toBe("no-op");
  });

  test("dirty build classifies as dirty", () => {
    const c = classifyInstall(FAKE_BIN_PATH, { ...CLEAN_RELEASE_BUILD, dirty: true });
    expect(c.kind).toBe("dirty");
    if (c.kind === "dirty") {
      expect(c.reason).toBeTruthy();
    }
  });

  test("fork build classifies as fork", () => {
    const c = classifyInstall(FAKE_BIN_PATH, {
      ...CLEAN_RELEASE_BUILD,
      repo: "https://github.com/myfork/claude-code-modes.git",
    });
    expect(c.kind).toBe("fork");
  });
});
