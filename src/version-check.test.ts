import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { makeTempDir } from "./test-helpers.js";
import {
  shouldRunCheck,
  getCachePath,
  readCache,
  writeCache,
  isCacheFresh,
  startVersionCheck,
  awaitAndNag,
  type VersionCheckCache,
  type VersionCheckHandle,
} from "./version-check.js";
import type { UpdateTransport } from "./update.js";

// ----------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------

const BASE_CACHE: VersionCheckCache = {
  checkedAt: 1_700_000_000_000,
  latestVersion: "0.99.0",
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/** Captures writes to a fake writable stream. */
function makeFakeStderr(): { stderr: NodeJS.WritableStream; output: () => string } {
  let captured = "";
  const stderr = {
    write(chunk: string | Uint8Array) {
      captured += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    },
  } as unknown as NodeJS.WritableStream;
  return { stderr, output: () => captured };
}

/** Builds a fake transport with call counters. */
type FakeTransportResult = {
  transport: UpdateTransport;
  calls: { fetchJson: number };
};

function makeTransport(opts: {
  version?: string;
  throwOnFetch?: boolean;
  delayMs?: number;
}): FakeTransportResult {
  const version = opts.version ?? "1.0.0";
  const calls = { fetchJson: 0 };

  const transport: UpdateTransport = {
    async fetchJson(_url: string): Promise<unknown> {
      calls.fetchJson++;
      if (opts.delayMs) {
        await new Promise((r) => setTimeout(r, opts.delayMs));
      }
      if (opts.throwOnFetch) throw new Error("HTTP 404");
      return {
        tag_name: `v${version}`,
        assets: [],
      };
    },
    async fetchBytes(_url: string): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async fetchText(_url: string): Promise<string> {
      return "";
    },
  };

  return { transport, calls };
}

/** A sleep that resolves immediately (for fast tests). */
function noopSleep(_ms: number): Promise<void> {
  return Promise.resolve();
}

/** A sleep that never resolves (to simulate timeout). */
function neverSleep(_ms: number): Promise<void> {
  return new Promise(() => {});
}

// ----------------------------------------------------------------------
// shouldRunCheck
// ----------------------------------------------------------------------

describe("shouldRunCheck", () => {
  test("returns false when stderrIsTty is false", () => {
    expect(shouldRunCheck(["create"], {}, false)).toBe(false);
  });

  test("returns false when CLAUDE_MODE_NO_UPDATE_CHECK=1", () => {
    expect(shouldRunCheck(["create"], { CLAUDE_MODE_NO_UPDATE_CHECK: "1" }, true)).toBe(false);
  });

  test("returns false when CLAUDE_MODE_NO_UPDATE_CHECK=true", () => {
    expect(shouldRunCheck(["create"], { CLAUDE_MODE_NO_UPDATE_CHECK: "true" }, true)).toBe(false);
  });

  test("does NOT opt out when CLAUDE_MODE_NO_UPDATE_CHECK=0", () => {
    expect(shouldRunCheck(["create"], { CLAUDE_MODE_NO_UPDATE_CHECK: "0" }, true)).toBe(true);
  });

  test("does NOT opt out when CLAUDE_MODE_NO_UPDATE_CHECK unset", () => {
    expect(shouldRunCheck(["create"], {}, true)).toBe(true);
  });

  test("returns false when argv[0] === 'update'", () => {
    expect(shouldRunCheck(["update"], {}, true)).toBe(false);
  });

  test("returns false when argv[0] === 'update' with subflags", () => {
    expect(shouldRunCheck(["update", "--check"], {}, true)).toBe(false);
  });

  test("returns false when --version is in own args", () => {
    expect(shouldRunCheck(["--version"], {}, true)).toBe(false);
  });

  test("does NOT opt out for --version after '--'", () => {
    // ["--", "--version"] — --version is after --, so it's a passthrough
    expect(shouldRunCheck(["--", "--version"], {}, true)).toBe(true);
  });

  test("returns true for typical invocation 'create'", () => {
    expect(shouldRunCheck(["create"], {}, true)).toBe(true);
  });

  test("returns true for 'safe --readonly'", () => {
    expect(shouldRunCheck(["safe", "--readonly"], {}, true)).toBe(true);
  });

  test("returns true for '--agency autonomous'", () => {
    expect(shouldRunCheck(["--agency", "autonomous"], {}, true)).toBe(true);
  });

  test("returns true for empty argv (no-args case before version check fires)", () => {
    // no-args is handled before the version check in cli.ts, but shouldRunCheck
    // itself should not block on it
    expect(shouldRunCheck([], {}, true)).toBe(true);
  });
});

// ----------------------------------------------------------------------
// getCachePath
// ----------------------------------------------------------------------

describe("getCachePath", () => {
  test("uses XDG_CACHE_HOME when set", () => {
    const path = getCachePath({ XDG_CACHE_HOME: "/custom/cache" });
    expect(path).toBe("/custom/cache/claude-mode/version-check.json");
  });

  test("falls back to ~/.cache when XDG_CACHE_HOME unset", () => {
    const path = getCachePath({});
    expect(path).toMatch(/\/\.cache\/claude-mode\/version-check\.json$/);
  });

  test("falls back to ~/.cache when XDG_CACHE_HOME is empty string", () => {
    const path = getCachePath({ XDG_CACHE_HOME: "" });
    expect(path).toMatch(/\/\.cache\/claude-mode\/version-check\.json$/);
  });
});

// ----------------------------------------------------------------------
// readCache / writeCache round-trips and error cases
// ----------------------------------------------------------------------

describe("readCache / writeCache", () => {
  test("round-trip: write then read returns same cache entry", () => {
    const tempDir = makeTempDir("vc-cache-");
    const path = join(tempDir, "version-check.json");
    writeCache(path, { ...BASE_CACHE });
    const result = readCache(path);
    expect(result).toEqual(BASE_CACHE);
  });

  test("read returns null on missing file", () => {
    expect(readCache("/nonexistent/path/version-check.json")).toBeNull();
  });

  test("read returns null on malformed JSON", () => {
    const tempDir = makeTempDir("vc-bad-json-");
    const path = join(tempDir, "bad.json");
    writeFileSync(path, "{ not valid json", "utf8");
    expect(readCache(path)).toBeNull();
  });

  test("read returns null when checkedAt is missing", () => {
    const tempDir = makeTempDir("vc-no-checkedat-");
    const path = join(tempDir, "cache.json");
    writeFileSync(path, JSON.stringify({ latestVersion: "1.0.0" }), "utf8");
    expect(readCache(path)).toBeNull();
  });

  test("read returns null when latestVersion is missing", () => {
    const tempDir = makeTempDir("vc-no-version-");
    const path = join(tempDir, "cache.json");
    writeFileSync(path, JSON.stringify({ checkedAt: 12345 }), "utf8");
    expect(readCache(path)).toBeNull();
  });

  test("read returns null when latestVersion is empty string", () => {
    const tempDir = makeTempDir("vc-empty-version-");
    const path = join(tempDir, "cache.json");
    writeFileSync(path, JSON.stringify({ checkedAt: 12345, latestVersion: "" }), "utf8");
    expect(readCache(path)).toBeNull();
  });

  test("read returns null when checkedAt is a string not a number", () => {
    const tempDir = makeTempDir("vc-bad-type-");
    const path = join(tempDir, "cache.json");
    writeFileSync(path, JSON.stringify({ checkedAt: "12345", latestVersion: "1.0.0" }), "utf8");
    expect(readCache(path)).toBeNull();
  });

  test("writeCache creates parent directory", () => {
    const tempDir = makeTempDir("vc-mkdir-");
    const path = join(tempDir, "nested", "dir", "version-check.json");
    writeCache(path, { ...BASE_CACHE });
    const result = readCache(path);
    expect(result).toEqual(BASE_CACHE);
  });

  test("writeCache swallows errors when path is under a file (not a dir)", () => {
    const tempDir = makeTempDir("vc-swallow-");
    const filePath = join(tempDir, "not-a-dir");
    writeFileSync(filePath, "I am a file", "utf8");
    // Try to write to a path whose parent is a file — this will fail; should not throw
    expect(() => writeCache(join(filePath, "child.json"), { ...BASE_CACHE })).not.toThrow();
  });
});

// ----------------------------------------------------------------------
// isCacheFresh
// ----------------------------------------------------------------------

describe("isCacheFresh", () => {
  const checkedAt = 1_700_000_000_000;

  test("returns true when age is just under TTL", () => {
    const now = checkedAt + CACHE_TTL_MS - 1;
    expect(isCacheFresh({ ...BASE_CACHE, checkedAt }, now)).toBe(true);
  });

  test("returns false when age equals TTL exactly", () => {
    const now = checkedAt + CACHE_TTL_MS;
    expect(isCacheFresh({ ...BASE_CACHE, checkedAt }, now)).toBe(false);
  });

  test("returns false for far-stale entries", () => {
    const now = checkedAt + CACHE_TTL_MS * 7;
    expect(isCacheFresh({ ...BASE_CACHE, checkedAt }, now)).toBe(false);
  });
});

// ----------------------------------------------------------------------
// startVersionCheck
// ----------------------------------------------------------------------

describe("startVersionCheck", () => {
  test("fresh cache: resolves to cached version without transport call", async () => {
    const tempDir = makeTempDir("vc-fresh-");
    const cachePath = join(tempDir, "version-check.json");
    const now = Date.now();
    writeCache(cachePath, { checkedAt: now, latestVersion: "0.99.0" });

    const { transport, calls } = makeTransport({ version: "1.0.0" });
    const { stderr, output } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, now: () => now, stderr });
    const result = await handle.result;

    expect(result).toBe("0.99.0");
    expect(calls.fetchJson).toBe(0);
    expect(output()).toBe("");
  });

  test("fresh cache: abort is safe no-op", async () => {
    const tempDir = makeTempDir("vc-fresh-abort-");
    const cachePath = join(tempDir, "version-check.json");
    const now = Date.now();
    writeCache(cachePath, { checkedAt: now, latestVersion: "0.99.0" });

    const { transport } = makeTransport({});
    const handle = startVersionCheck({ transport, cachePath, now: () => now });
    handle.abort(); // should not throw
    const result = await handle.result;
    expect(result).toBe("0.99.0");
  });

  test("stale cache + fetch succeeds: resolves to fetched version, updates cache", async () => {
    const tempDir = makeTempDir("vc-stale-success-");
    const cachePath = join(tempDir, "version-check.json");
    // Write stale cache (checkedAt = 0 is way beyond TTL)
    writeCache(cachePath, { checkedAt: 0, latestVersion: "0.1.0" });

    const nowMs = Date.now();
    const { transport, calls } = makeTransport({ version: "1.5.0" });
    const { stderr, output } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, now: () => nowMs, stderr });

    // "Checking..." should already be printed synchronously
    expect(output()).toBe("Checking for newer versions of claude-mode...\n");

    const result = await handle.result;
    expect(result).toBe("1.5.0");
    expect(calls.fetchJson).toBe(1);

    // Cache should be updated
    const cached = readCache(cachePath);
    expect(cached?.latestVersion).toBe("1.5.0");
    expect(cached?.checkedAt).toBe(nowMs);
  });

  test("stale cache + fetch errors: resolves to stale version, cache unchanged", async () => {
    const tempDir = makeTempDir("vc-stale-err-");
    const cachePath = join(tempDir, "version-check.json");
    writeCache(cachePath, { checkedAt: 0, latestVersion: "0.1.0" });

    const { transport } = makeTransport({ throwOnFetch: true });
    const { stderr, output } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, stderr });
    const result = await handle.result;

    expect(result).toBe("0.1.0");
    expect(output()).toBe("Checking for newer versions of claude-mode...\n");

    // Cache should still have original value
    const cached = readCache(cachePath);
    expect(cached?.latestVersion).toBe("0.1.0");
    expect(cached?.checkedAt).toBe(0);
  });

  test("no cache + fetch errors: resolves to null", async () => {
    const tempDir = makeTempDir("vc-no-cache-err-");
    const cachePath = join(tempDir, "version-check.json");
    // No cache file written

    const { transport } = makeTransport({ throwOnFetch: true });
    const { stderr, output } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, stderr });
    const result = await handle.result;

    expect(result).toBeNull();
    expect(output()).toBe("Checking for newer versions of claude-mode...\n");
  });

  test("abort before fetch completes: resolves to stale cached version without updating cache", async () => {
    const tempDir = makeTempDir("vc-abort-stale-");
    const cachePath = join(tempDir, "version-check.json");
    writeCache(cachePath, { checkedAt: 0, latestVersion: "0.5.0" });

    const nowMs = Date.now();
    // Use a slow transport
    const { transport } = makeTransport({ version: "2.0.0", delayMs: 200 });
    const { stderr } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, now: () => nowMs, stderr });

    // Abort immediately
    handle.abort();
    const result = await handle.result;

    // Should return stale version without updating
    expect(result).toBe("0.5.0");
    const cached = readCache(cachePath);
    expect(cached?.latestVersion).toBe("0.5.0");
    expect(cached?.checkedAt).toBe(0);
  });

  test("abort with no cache: resolves to null", async () => {
    const tempDir = makeTempDir("vc-abort-null-");
    const cachePath = join(tempDir, "version-check.json");
    // No cache file

    const { transport } = makeTransport({ version: "2.0.0", delayMs: 200 });
    const { stderr } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, stderr });
    handle.abort();
    const result = await handle.result;

    expect(result).toBeNull();
  });

  test("writes 'Checking...' exactly once when cache is stale", async () => {
    const tempDir = makeTempDir("vc-once-");
    const cachePath = join(tempDir, "version-check.json");
    writeCache(cachePath, { checkedAt: 0, latestVersion: "0.1.0" });

    const { transport } = makeTransport({ version: "1.0.0" });
    const { stderr, output } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, stderr });
    await handle.result;

    expect(output().split("Checking for newer versions of claude-mode...").length - 1).toBe(1);
  });

  test("does NOT write 'Checking...' when cache is fresh", async () => {
    const tempDir = makeTempDir("vc-no-checking-");
    const cachePath = join(tempDir, "version-check.json");
    const now = Date.now();
    writeCache(cachePath, { checkedAt: now, latestVersion: "1.0.0" });

    const { transport } = makeTransport({});
    const { stderr, output } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, now: () => now, stderr });
    await handle.result;

    expect(output()).toBe("");
  });
});

// ----------------------------------------------------------------------
// awaitAndNag
// ----------------------------------------------------------------------

describe("awaitAndNag", () => {
  test("handle is null: returns without writing to stderr", async () => {
    const { stderr, output } = makeFakeStderr();
    await awaitAndNag(null, "0.1.0", stderr, noopSleep);
    expect(output()).toBe("");
  });

  test("result is null: returns without writing to stderr", async () => {
    const { stderr, output } = makeFakeStderr();
    const handle: VersionCheckHandle = {
      result: Promise.resolve(null),
      abort: () => {},
    };
    await awaitAndNag(handle, "0.1.0", stderr, noopSleep);
    expect(output()).toBe("");
  });

  test("result equal to current: no nag", async () => {
    const { stderr, output } = makeFakeStderr();
    const handle: VersionCheckHandle = {
      result: Promise.resolve("0.1.0"),
      abort: () => {},
    };
    await awaitAndNag(handle, "0.1.0", stderr, noopSleep);
    expect(output()).toBe("");
  });

  test("result older than current: no nag (downgrade case)", async () => {
    const { stderr, output } = makeFakeStderr();
    const handle: VersionCheckHandle = {
      result: Promise.resolve("0.0.1"),
      abort: () => {},
    };
    await awaitAndNag(handle, "0.1.0", stderr, noopSleep);
    expect(output()).toBe("");
  });

  test("result newer than current: writes nag with versions", async () => {
    const { stderr, output } = makeFakeStderr();
    const sleepCalls: number[] = [];
    const testSleep = (ms: number) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };
    const handle: VersionCheckHandle = {
      result: Promise.resolve("1.0.0"),
      abort: () => {},
    };
    await awaitAndNag(handle, "0.1.0", stderr, testSleep);
    expect(output()).toContain("claude-mode update available: 0.1.0 -> 1.0.0");
    expect(output()).toContain("claude-mode update");
    // sleep is called twice: once for the FETCH_RACE_TIMEOUT race (1000ms),
    // once for the NAG_PAUSE after writing the nag (1500ms).
    expect(sleepCalls).toContain(1500);
  });

  test("nag message contains 'Run `claude-mode update` to install.'", async () => {
    const { stderr, output } = makeFakeStderr();
    const handle: VersionCheckHandle = {
      result: Promise.resolve("99.0.0"),
      abort: () => {},
    };
    await awaitAndNag(handle, "0.1.0", stderr, noopSleep);
    expect(output()).toContain("Run `claude-mode update` to install.");
  });

  test("sleep is awaited: promise resolves after sleep completes", async () => {
    let resolved = false;
    let sleepResolve: () => void = () => {};
    const controlledSleep = (_ms: number) =>
      new Promise<void>((resolve) => {
        sleepResolve = resolve;
      });

    const handle: VersionCheckHandle = {
      result: Promise.resolve("99.0.0"),
      abort: () => {},
    };
    const { stderr } = makeFakeStderr();

    const nagPromise = awaitAndNag(handle, "0.1.0", stderr, controlledSleep).then(() => {
      resolved = true;
    });

    // Give it a tick to start running
    await Promise.resolve();
    await Promise.resolve();
    // Not resolved yet because sleep hasn't finished
    expect(resolved).toBe(false);

    // Release the sleep
    sleepResolve();
    await nagPromise;
    expect(resolved).toBe(true);
  });

  test("timeout fires: abort is called, no nag written", async () => {
    let abortCalled = false;
    const { stderr, output } = makeFakeStderr();

    const handle: VersionCheckHandle = {
      result: new Promise(() => {}), // never resolves
      abort: () => { abortCalled = true; },
    };

    // Use neverSleep so the FETCH_RACE_TIMEOUT_MS path via sleep(1000) fires
    // But we need a controlled approach: override sleep to resolve immediately
    // for the timeout slot, never for the nag pause
    let callCount = 0;
    const timeoutSleep = (_ms: number) => {
      callCount++;
      // First call is FETCH_RACE_TIMEOUT_MS — resolve immediately to simulate timeout
      if (callCount === 1) return Promise.resolve();
      // Second call (NAG_PAUSE_MS) should not be reached in this test
      return new Promise<void>(() => {});
    };

    await awaitAndNag(handle, "0.1.0", stderr, timeoutSleep);
    expect(abortCalled).toBe(true);
    expect(output()).toBe("");
  });
});

// ----------------------------------------------------------------------
// Integration: startVersionCheck + awaitAndNag together
// ----------------------------------------------------------------------

describe("version check integration", () => {
  // Use a sleep that keeps the FETCH_RACE_TIMEOUT alive (never resolves for
  // timeout slot) but resolves for the nag pause, so the fetch result wins.
  function fetchWinsSleep(ms: number): Promise<void> {
    // 1000 ms = FETCH_RACE_TIMEOUT_MS — never resolve so fetch result wins
    if (ms === 1000) return new Promise(() => {});
    // 1500 ms = NAG_PAUSE_MS — resolve immediately
    return Promise.resolve();
  }

  test("nag fires when fetched version is newer", async () => {
    const tempDir = makeTempDir("vc-int-nag-");
    const cachePath = join(tempDir, "version-check.json");
    writeCache(cachePath, { checkedAt: 0, latestVersion: "0.1.0" });

    const { transport } = makeTransport({ version: "99.0.0" });
    const { stderr: checkStderr } = makeFakeStderr();
    const { stderr: nagStderr, output: nagOutput } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, stderr: checkStderr });
    await awaitAndNag(handle, "0.1.0", nagStderr, fetchWinsSleep);

    expect(nagOutput()).toContain("claude-mode update available: 0.1.0 -> 99.0.0");
  });

  test("no nag when fetched version equals current", async () => {
    const tempDir = makeTempDir("vc-int-no-nag-");
    const cachePath = join(tempDir, "version-check.json");
    writeCache(cachePath, { checkedAt: 0, latestVersion: "0.1.0" });

    const { transport } = makeTransport({ version: "0.1.0" });
    const { stderr: checkStderr } = makeFakeStderr();
    const { stderr: nagStderr, output: nagOutput } = makeFakeStderr();

    const handle = startVersionCheck({ transport, cachePath, stderr: checkStderr });
    await awaitAndNag(handle, "0.1.0", nagStderr, fetchWinsSleep);

    expect(nagOutput()).toBe("");
  });
});
