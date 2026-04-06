import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const PROJECT_ROOT = join(import.meta.dir, "..");

export function makeTempDir(prefix = "test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function createCliRunner(command: string, timeout = 15000) {
  function run(args: string): string {
    return execSync(`${command} ${args}`, {
      encoding: "utf8",
      timeout,
      cwd: PROJECT_ROOT,
    }).trim();
  }

  function runExpectFail(args: string): string {
    try {
      execSync(`${command} ${args}`, {
        encoding: "utf8",
        timeout,
        cwd: PROJECT_ROOT,
      });
      throw new Error("Expected command to fail");
    } catch (err: any) {
      return (err.stderr || err.message || "").toString();
    }
  }

  return { run, runExpectFail };
}
