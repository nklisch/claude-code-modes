# Design: Phase 4 — Bash Entry Point + End-to-End Testing

## Overview

Phase 4 creates the bash entry point script (`claude-mode`), adds end-to-end tests that exercise the full pipeline from bash script to assembled prompt, and produces a complete, usable CLI tool.

The bash script is intentionally minimal — it calls the TypeScript binary to build the prompt, then `exec`s the resulting `claude` command so Claude Code gets clean TTY ownership.

---

## Implementation Units

### Unit 1: Bash Entry Point

**File**: `claude-mode` (project root, executable)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Resolve the directory this script lives in (follows symlinks)
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

# Temp file cleanup: the TypeScript binary writes a temp prompt file.
# We can't trap here because exec replaces this process.
# Instead, rely on /tmp cleanup or add a cleanup wrapper if needed.

# Build the prompt and get the claude command
CMD=$(bun run "$SCRIPT_DIR/src/build-prompt.ts" "$@")

# If build-prompt exited with output but no command (e.g., --help or --print),
# the output was already written to stdout by the TypeScript binary.
# We only exec if the output looks like a claude command.
if [[ "$CMD" == claude\ * ]]; then
  exec $CMD
fi
```

**Implementation Notes**:
- `readlink -f` resolves symlinks so the script works when symlinked into `~/.local/bin/` or similar.
- `set -euo pipefail` for strict error handling.
- `exec $CMD` replaces the bash process with `claude`. This gives Claude Code direct TTY ownership — critical for the interactive TUI. The `$CMD` is intentionally unquoted so word splitting turns it into separate args.
- When `--help` or `--print` is used, `build-prompt.ts` writes to stdout and exits 0. The `CMD` variable captures that output, but it won't start with `claude ` so we don't exec — the output was already displayed by the TypeScript process.
- **Wait — there's a problem with the above approach.** When `--print` or `--help` is used, `build-prompt.ts` writes to stdout, which gets captured into `$CMD` instead of displayed. We need a different approach.

**Revised approach:**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Resolve the directory this script lives in (follows symlinks)
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

# Check if --help, -h, or --print is in the args.
# If so, pass through directly to TypeScript and exit — no exec needed.
for arg in "$@"; do
  case "$arg" in
    --help|-h|--print)
      bun run "$SCRIPT_DIR/src/build-prompt.ts" "$@"
      exit $?
      ;;
    --)
      break  # Stop scanning — everything after -- is passthrough
      ;;
  esac
done

# Normal mode: capture the claude command and exec it
CMD=$(bun run "$SCRIPT_DIR/src/build-prompt.ts" "$@")

if [ -z "$CMD" ]; then
  echo "Error: build-prompt produced no output" >&2
  exit 1
fi

# exec replaces this process — claude gets clean TTY ownership
exec $CMD
```

**Implementation Notes on revised approach**:
- Pre-scans args for `--help`, `-h`, `--print` before capturing output. When found, runs TypeScript directly (stdout goes to terminal) and exits.
- Stops scanning at `--` to avoid false positives from passthrough args.
- For normal mode, captures the command into `$CMD` and `exec`s it.
- `exec $CMD` is intentionally unquoted — the TypeScript binary shell-escapes each arg, so word splitting produces the correct argv.

**Acceptance Criteria**:
- [ ] Script is executable (`chmod +x`)
- [ ] `./claude-mode --help` prints usage text
- [ ] `./claude-mode create --print` prints assembled prompt
- [ ] `./claude-mode create` would exec `claude --system-prompt-file /tmp/...` (can't fully test without claude installed, but command construction is testable)
- [ ] Script works when symlinked from another directory
- [ ] `--print` output goes directly to terminal (not captured then re-echoed)

---

### Unit 2: Make Script Executable + Add .gitattributes

**Files**: `claude-mode` permissions, `.gitattributes`

```bash
chmod +x claude-mode
```

**.gitattributes**:
```
claude-mode text eol=lf
```

**Implementation Notes**:
- The `.gitattributes` entry ensures the bash script always has Unix line endings, even on Windows checkouts.

**Acceptance Criteria**:
- [ ] `claude-mode` has executable permission
- [ ] `.gitattributes` marks `claude-mode` as LF

---

### Unit 3: End-to-End Tests

**File**: `src/e2e.test.ts`

These tests exercise the full pipeline through the bash script. Since we can't actually launch Claude Code in tests, we test everything up to the `exec` point using `--print` and verifying command output.

```typescript
import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { execSync } from "node:child_process";

const SCRIPT = join(import.meta.dir, "..", "claude-mode");
const PROJECT_ROOT = join(import.meta.dir, "..");

function run(args: string): string {
  return execSync(`${SCRIPT} ${args}`, {
    encoding: "utf8",
    timeout: 15000,
    cwd: PROJECT_ROOT,
  }).trim();
}

function runExpectFail(args: string): string {
  try {
    execSync(`${SCRIPT} ${args}`, {
      encoding: "utf8",
      timeout: 15000,
      cwd: PROJECT_ROOT,
    });
    throw new Error("Expected command to fail");
  } catch (err: any) {
    return (err.stderr || err.message || "").toString();
  }
}

describe("claude-mode e2e", () => {
  // Help and usage
  test("no args prints usage", () => {
    const output = run("");
    expect(output).toContain("Usage: claude-mode");
  });

  test("--help prints usage", () => {
    const output = run("--help");
    expect(output).toContain("Usage: claude-mode");
  });

  test("-h prints usage", () => {
    const output = run("-h");
    expect(output).toContain("Usage: claude-mode");
  });

  // --print mode for each preset
  test("create --print contains correct axis headers", () => {
    const output = run("create --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Architect");
    expect(output).toContain("# Scope: Unrestricted");
    expect(output).not.toContain("# Read-only mode");
  });

  test("extend --print contains correct axis headers", () => {
    const output = run("extend --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).toContain("# Scope: Adjacent");
  });

  test("safe --print contains correct axis headers", () => {
    const output = run("safe --print");
    expect(output).toContain("# Agency: Collaborative");
    expect(output).toContain("# Quality: Minimal");
    expect(output).toContain("# Scope: Narrow");
  });

  test("refactor --print contains correct axis headers", () => {
    const output = run("refactor --print");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).toContain("# Scope: Unrestricted");
  });

  test("explore --print contains readonly modifier", () => {
    const output = run("explore --print");
    expect(output).toContain("# Agency: Collaborative");
    expect(output).toContain("# Quality: Architect");
    expect(output).toContain("# Scope: Narrow");
    expect(output).toContain("# Read-only mode");
  });

  test("none --print has no axis headers", () => {
    const output = run("none --print");
    expect(output).not.toContain("# Agency:");
    expect(output).not.toContain("# Quality:");
    expect(output).not.toContain("# Scope:");
  });

  // All presets include universal sections
  test("all presets include context pacing", () => {
    for (const preset of ["create", "extend", "safe", "refactor", "explore", "none"]) {
      const output = run(`${preset} --print`);
      expect(output).toContain("# Context and pacing");
    }
  });

  test("all presets include environment section", () => {
    for (const preset of ["create", "extend", "safe", "refactor", "explore", "none"]) {
      const output = run(`${preset} --print`);
      expect(output).toContain("# Environment");
      expect(output).toContain(process.cwd());
    }
  });

  // Axis override through bash script
  test("preset with axis override works", () => {
    const output = run("create --quality pragmatic --print");
    expect(output).toContain("# Quality: Pragmatic");
    expect(output).not.toContain("# Quality: Architect");
    expect(output).toContain("# Agency: Autonomous");
  });

  // --readonly modifier
  test("--readonly adds readonly content", () => {
    const output = run("create --readonly --print");
    expect(output).toContain("# Read-only mode");
  });

  // Error handling through bash script
  test("invalid agency error propagates", () => {
    const err = runExpectFail("--agency invalid");
    expect(err).toContain("Invalid --agency");
  });

  test("--system-prompt error propagates", () => {
    const err = runExpectFail("create --system-prompt foo");
    expect(err).toContain("Cannot use --system-prompt");
  });

  // Normal mode (non-print) produces claude command
  test("normal mode outputs claude command", () => {
    const output = run("create");
    expect(output).toMatch(/^claude --system-prompt-file /);
  });

  // Passthrough args
  test("passthrough args via -- separator", () => {
    const output = run("create -- --verbose --model sonnet");
    expect(output).toContain("--verbose");
    expect(output).toContain("--model");
    expect(output).toContain("sonnet");
  });

  // No template variable leaks in any mode
  test("no unreplaced template variables in any preset", () => {
    for (const preset of ["create", "extend", "safe", "refactor", "explore", "none"]) {
      const output = run(`${preset} --print`);
      expect(output).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });
});
```

**Implementation Notes**:
- Tests run the bash script directly, not the TypeScript binary — full e2e through both layers.
- `--print` is the key testing tool — it outputs the assembled prompt through the bash script without needing `claude` installed.
- Normal mode test verifies the command format but doesn't `exec` claude.
- The `cwd` is set to project root so path resolution works.
- Timeout is 15s since the bash script spawns Bun which spawns shell commands for env detection.

**Acceptance Criteria**:
- [ ] All 6 presets produce correct axis headers via `--print`
- [ ] All 6 presets include context pacing and environment sections
- [ ] Axis override works through the bash script
- [ ] `--readonly` modifier works through the bash script
- [ ] Error handling propagates through bash script
- [ ] Normal mode produces `claude --system-prompt-file ...` output
- [ ] No unreplaced template variables in any preset
- [ ] Passthrough args work through `--` separator

---

## Implementation Order

1. **Unit 1: `claude-mode` bash script** — the main deliverable
2. **Unit 2: Permissions + .gitattributes** — make it executable
3. **Unit 3: `src/e2e.test.ts`** — end-to-end tests

## Verification Checklist

```bash
cd /home/nathan/dev/claude-mode

# Run all tests (should include e2e)
bun test

# Manual verification
./claude-mode --help
./claude-mode create --print | head -5
./claude-mode explore --print | grep "Read-only"
./claude-mode none --print | grep -c "# Agency:"  # should be 0
./claude-mode create  # should output claude command

# Verify script works when invoked from different directory
cd /tmp && /home/nathan/dev/claude-mode/claude-mode create --print | head -3
```
