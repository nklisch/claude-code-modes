# Refactor Plan

## Overview

The codebase is small (~600 lines source, ~400 lines tests) and was built in 4 phases by subagents. The main issues are:

1. **Repeated axis validation logic** in `args.ts` — 3 identical blocks differing only in the axis name and values array
2. **Repeated shell exec + try/catch** in `env.ts` — 4 identical git command blocks
3. **Duplicate test CLI helpers** — `run()` and `runExpectFail()` copy-pasted between `build-prompt.test.ts` and `e2e.test.ts`
4. **Hardcoded preset lists in e2e tests** instead of importing `PRESET_NAMES`
5. **Duplicate `TemplateVars` mock** in `assemble.test.ts` — same object defined twice in different describe blocks

Skipped from the agent findings (not worth the complexity for this project size):
- Centralized constants file — 3 constants in `env.ts` is fine, not worth a new file
- Fragment path constants — the string interpolation in `assemble.ts` is readable as-is
- Custom error classes — overkill for a CLI tool with 3 validation checks
- Splitting `env.ts` into two modules — 60 lines doesn't warrant a split
- Validation schema library — massive dependency for trivial validation

---

## Refactor Steps

### Step 1: Extract axis validation helper in `args.ts`

**Priority**: High
**Risk**: Low
**Files**: `src/args.ts`

**Current State** (lines 68-92):
```typescript
const overrides: ParsedArgs["overrides"] = {};
if (values.agency !== undefined) {
  if (!AGENCY_VALUES.includes(values.agency as Agency)) {
    throw new Error(
      `Invalid --agency value: "${values.agency}". Must be one of: ${AGENCY_VALUES.join(", ")}`
    );
  }
  overrides.agency = values.agency as Agency;
}
if (values.quality !== undefined) {
  if (!QUALITY_VALUES.includes(values.quality as Quality)) {
    throw new Error(
      `Invalid --quality value: "${values.quality}". Must be one of: ${QUALITY_VALUES.join(", ")}`
    );
  }
  overrides.quality = values.quality as Quality;
}
if (values.scope !== undefined) {
  if (!SCOPE_VALUES.includes(values.scope as Scope)) {
    throw new Error(
      `Invalid --scope value: "${values.scope}". Must be one of: ${SCOPE_VALUES.join(", ")}`
    );
  }
  overrides.scope = values.scope as Scope;
}
```

**Target State**:
```typescript
function validateAxisValue<T extends string>(
  value: unknown,
  validValues: readonly T[],
  flagName: string,
): T {
  if (!(validValues as readonly string[]).includes(value as string)) {
    throw new Error(
      `Invalid --${flagName} value: "${value}". Must be one of: ${validValues.join(", ")}`
    );
  }
  return value as T;
}

// Usage:
const overrides: ParsedArgs["overrides"] = {};
if (values.agency !== undefined) {
  overrides.agency = validateAxisValue(values.agency, AGENCY_VALUES, "agency");
}
if (values.quality !== undefined) {
  overrides.quality = validateAxisValue(values.quality, QUALITY_VALUES, "quality");
}
if (values.scope !== undefined) {
  overrides.scope = validateAxisValue(values.scope, SCOPE_VALUES, "scope");
}
```

**Implementation Notes**:
- `validateAxisValue` is a private helper within `args.ts` — no need to export or create a separate file.
- The generic `<T extends string>` preserves type narrowing: the return type is `Agency`, `Quality`, or `Scope` depending on what's passed.
- Error message format is unchanged — existing tests still pass.

**Acceptance Criteria**:
- [ ] `bun test` passes (all 106 tests)
- [ ] Error messages from `--agency invalid` etc. are unchanged
- [ ] No duplicate validation blocks remain

---

### Step 2: Extract shell exec helper in `env.ts`

**Priority**: High
**Risk**: Low
**Files**: `src/env.ts`

**Current State** (lines 9-50, 52-58):
```typescript
let isGit = false;
try {
  const result = execSync("git rev-parse --is-inside-work-tree 2>/dev/null", {
    encoding: "utf8",
    timeout: 5000,
  }).trim();
  isGit = result === "true";
} catch {
  isGit = false;
}

// ... then 3 more identical try/catch blocks for gitBranch, gitStatus, gitLog
// ... then 2 more for platform, osVersion (these don't need try/catch but use same options)
```

**Target State**:
```typescript
function exec(command: string): string | null {
  try {
    return execSync(command, { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

export function detectEnv(): EnvInfo {
  const cwd = process.cwd();
  const isGit = exec("git rev-parse --is-inside-work-tree 2>/dev/null") === "true";

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
```

**Implementation Notes**:
- `exec` is a private helper — not exported.
- The `?? "unknown"` fallback for platform and osVersion handles the (unlikely) case where `uname` fails. Previously this would have thrown, crashing the CLI. Now it degrades gracefully.
- `isGit` check becomes a one-liner instead of an 8-line try/catch.
- Function reduces from ~50 lines to ~20 lines.

**Acceptance Criteria**:
- [ ] `bun test` passes (all 106 tests)
- [ ] `detectEnv()` returns same shape for git repos and non-git directories
- [ ] `uname` failure produces `"unknown"` instead of crashing

---

### Step 3: Extract shared CLI test runner

**Priority**: High
**Risk**: Low
**Files**: `src/test-helpers.ts` (new), `src/build-prompt.test.ts`, `src/e2e.test.ts`

**Current State** — both files define nearly identical helpers:

`build-prompt.test.ts:8-27`:
```typescript
function run(args: string): string {
  return execSync(`bun run ${BUILD_PROMPT} ${args}`, {
    encoding: "utf8", timeout: 10000, cwd: join(import.meta.dir, ".."),
  }).trim();
}
function runExpectFail(args: string): string { /* identical pattern */ }
```

`e2e.test.ts:8-27`:
```typescript
function run(args: string): string {
  return execSync(`${SCRIPT} ${args}`, {
    encoding: "utf8", timeout: 15000, cwd: PROJECT_ROOT,
  }).trim();
}
function runExpectFail(args: string): string { /* identical pattern */ }
```

**Target State**:

`src/test-helpers.ts` (new file):
```typescript
import { execSync } from "node:child_process";
import { join } from "node:path";

export const PROJECT_ROOT = join(import.meta.dir, "..");

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
```

`build-prompt.test.ts` becomes:
```typescript
import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createCliRunner } from "./test-helpers.js";

const { run, runExpectFail } = createCliRunner(
  `bun run ${join(import.meta.dir, "build-prompt.ts")}`,
  10000,
);

describe("build-prompt CLI", () => {
  // ... tests unchanged
});
```

`e2e.test.ts` becomes:
```typescript
import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { createCliRunner } from "./test-helpers.js";

const { run, runExpectFail } = createCliRunner(
  join(import.meta.dir, "..", "claude-mode"),
);

describe("claude-mode e2e", () => {
  // ... tests unchanged
});
```

**Implementation Notes**:
- `createCliRunner` is a factory that takes the command and optional timeout, returns `run` and `runExpectFail`.
- The error handling in `runExpectFail` is normalized to the more defensive version from e2e.test.ts: `(err.stderr || err.message || "").toString()`.
- `PROJECT_ROOT` is also exported since integration tests use it for `PROMPTS_DIR`.

**Acceptance Criteria**:
- [ ] `bun test` passes (all 106 tests)
- [ ] No `run()` or `runExpectFail()` function defined inline in test files
- [ ] Both test files import from `test-helpers.ts`

---

### Step 4: Use `PRESET_NAMES` in e2e tests instead of hardcoded lists

**Priority**: Medium
**Risk**: Low
**Files**: `src/e2e.test.ts`

**Current State** (lines 93, 100, 148):
```typescript
for (const preset of ["create", "extend", "safe", "refactor", "explore", "none"]) {
```

**Target State**:
```typescript
import { PRESET_NAMES } from "./types.js";

// ...
for (const preset of PRESET_NAMES) {
```

**Implementation Notes**:
- Simple import + replace. Three occurrences in e2e.test.ts.
- If a preset is added in the future, e2e tests automatically cover it.

**Acceptance Criteria**:
- [ ] `bun test` passes
- [ ] No hardcoded preset arrays remain in e2e.test.ts
- [ ] `PRESET_NAMES` imported from types.ts

---

### Step 5: Deduplicate `TemplateVars` mock in `assemble.test.ts`

**Priority**: Medium
**Risk**: Low
**Files**: `src/assemble.test.ts`

**Current State** — two identical `vars` objects in different describe blocks (lines 30-40 and 139-149):
```typescript
describe("substituteTemplateVars", () => {
  const vars: TemplateVars = {
    CWD: "/test", IS_GIT: "true", PLATFORM: "linux", SHELL: "bash",
    OS_VERSION: "Linux 6.0", MODEL_NAME: "Test Model", MODEL_ID: "test-model-1",
    KNOWLEDGE_CUTOFF: "January 2025", GIT_STATUS: "clean",
  };
  // ...
});

describe("assemblePrompt", () => {
  const vars: TemplateVars = {
    CWD: "/test/project", IS_GIT: "true", PLATFORM: "linux", SHELL: "bash",
    OS_VERSION: "Linux 6.0", MODEL_NAME: "Claude Opus 4.6", MODEL_ID: "claude-opus-4-6",
    KNOWLEDGE_CUTOFF: "May 2025",
    GIT_STATUS: "Current branch: main\n\nStatus:\n(clean)",
  };
  // ...
});
```

**Target State** — single mock at module level:
```typescript
const TEST_VARS: TemplateVars = {
  CWD: "/test/project",
  IS_GIT: "true",
  PLATFORM: "linux",
  SHELL: "bash",
  OS_VERSION: "Linux 6.0",
  MODEL_NAME: "Claude Opus 4.6",
  MODEL_ID: "claude-opus-4-6",
  KNOWLEDGE_CUTOFF: "May 2025",
  GIT_STATUS: "Current branch: main\n\nStatus:\n(clean)",
};
```

**Implementation Notes**:
- The two objects differ slightly (different CWD, different MODEL_NAME). Use the more realistic one (from assemblePrompt tests) as the single source.
- The substituteTemplateVars tests only need CWD and SHELL values in their assertions — they'll work fine with the assemblePrompt values.

**Acceptance Criteria**:
- [ ] `bun test` passes
- [ ] Only one `TemplateVars` object defined in assemble.test.ts
- [ ] All substituteTemplateVars tests still verify correct behavior

---

## Implementation Order

1. **Step 1**: Extract axis validation helper (args.ts only, no dependencies)
2. **Step 2**: Extract shell exec helper (env.ts only, no dependencies)
3. **Step 3**: Extract shared CLI test runner (new file + update 2 test files)
4. **Step 4**: Use PRESET_NAMES in e2e tests (e2e.test.ts only, benefits from Step 3 being done first so you only edit the file once)
5. **Step 5**: Deduplicate TemplateVars mock (assemble.test.ts only)

Each step is independently committable and testable. Run `bun test` after each step.
