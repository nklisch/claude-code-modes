import { execSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const PROJECT_ROOT = join(import.meta.dir, "..");

export function makeTempDir(prefix = "test-"): string {
  // realpathSync resolves symlinks (e.g. macOS /var -> /private/var)
  // so temp paths match process.cwd() after chdir
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

/**
 * stdio: 'pipe' fully captures the child's stderr instead of inheriting it
 * to the parent. Without this, expected failures from negative-path tests
 * leak their error messages into the test runner output and look like real
 * failures even when the test is asserting them correctly.
 */
const PIPED_STDIO = ["pipe", "pipe", "pipe"] as const;

/**
 * Builds a pair of subprocess runners bound to a fixed command. Each runner
 * accepts an optional cwd as its second argument; tests that don't care use
 * PROJECT_ROOT, tests that need a temp directory pass it explicitly.
 *
 * runExpectFail captures err.stderr first, then err.stdout, then err.message —
 * some CLI errors land on stdout instead of stderr depending on context.
 */
export function createCliRunner(command: string, timeout = 15000) {
  function run(args: string, cwd: string = PROJECT_ROOT): string {
    return execSync(`${command} ${args}`, {
      encoding: "utf8",
      timeout,
      cwd,
      stdio: PIPED_STDIO,
    }).trim();
  }

  function runExpectFail(args: string, cwd: string = PROJECT_ROOT): string {
    try {
      execSync(`${command} ${args}`, {
        encoding: "utf8",
        timeout,
        cwd,
        stdio: PIPED_STDIO,
      });
      throw new Error("Expected command to fail");
    } catch (err: any) {
      return (err.stderr || err.stdout || err.message || "").toString();
    }
  }

  return { run, runExpectFail };
}
