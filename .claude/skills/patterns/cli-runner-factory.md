# Pattern: CLI Runner Factory

Integration and e2e tests create a subprocess runner by calling `createCliRunner(command, timeout)` from `test-helpers.ts`. The factory returns `{ run, runExpectFail }` bound to the command and cwd. This avoids duplicating execSync boilerplate across test files.

## Rationale

Both the TypeScript binary (`bun run build-prompt.ts`) and the bash wrapper (`./claude-mode`) need the same `run` / `runExpectFail` test helpers. Factoring this into a factory means each test file just configures the command and gets the helpers back — no duplicated subprocess logic.

## Examples

### Example 1: Integration tests for the TypeScript binary
**File**: `src/build-prompt.test.ts:6-12`
```typescript
import { createCliRunner } from "./test-helpers.js";

const { run, runExpectFail } = createCliRunner(
  `bun run ${join(import.meta.dir, "build-prompt.ts")}`,
  10000,  // faster timeout — no bash startup overhead
);

test("create outputs claude command", () => {
  const output = run("create");
  expect(output).toMatch(/^claude --system-prompt-file /);
});
```

### Example 2: E2E tests for the bash script
**File**: `src/e2e.test.ts:6-10`
```typescript
import { createCliRunner } from "./test-helpers.js";

const { run, runExpectFail } = createCliRunner(
  join(import.meta.dir, "..", "claude-mode"),  // bash script
  // default 15000ms timeout (bash + bun startup)
);

test("--system-prompt error propagates", () => {
  const err = runExpectFail("create --system-prompt foo");
  expect(err).toContain("Cannot use --system-prompt");
});
```

### Example 3: Factory implementation
**File**: `src/test-helpers.ts:6-29`
```typescript
export function createCliRunner(command: string, timeout = 15000) {
  function run(args: string): string {
    return execSync(`${command} ${args}`, {
      encoding: "utf8", timeout, cwd: PROJECT_ROOT,
    }).trim();
  }

  function runExpectFail(args: string): string {
    try {
      execSync(`${command} ${args}`, {
        encoding: "utf8", timeout, cwd: PROJECT_ROOT,
      });
      throw new Error("Expected command to fail");
    } catch (err: any) {
      return (err.stderr || err.message || "").toString();
    }
  }

  return { run, runExpectFail };
}
```

## When to Use

- Any test file that invokes a CLI binary and checks stdout/stderr
- When you need both success and error variants of subprocess execution

## When NOT to Use

- Unit tests that call TypeScript functions directly — no subprocess needed
- When each test needs different cwd or encoding — extend the factory instead

## Common Violations

- Defining `run()` and `runExpectFail()` inline per test file — creates drift in error handling between files
- Hardcoding `cwd` inside individual tests instead of using `PROJECT_ROOT` from test-helpers
