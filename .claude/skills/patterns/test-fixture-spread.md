# Pattern: Base Fixture + Spread Override

Tests define a complete base fixture object, then create test-specific variations by spreading the base and overriding only the relevant fields. This avoids repeated boilerplate and makes test intent clear.

## Rationale

Tests that inline every field on every call make it hard to see what's being varied. The spread pattern highlights the change. It also means adding a new required field to a type only requires updating the base fixture, not every test.

## Examples

### Example 1: `baseParsed` for args/resolve tests
**File**: `src/resolve.test.ts:6-13`
```typescript
const baseParsed: ParsedArgs = {
  preset: null,
  overrides: {},
  modifiers: { readonly: false, print: false, contextPacing: false },
  customModifiers: [],
  forwarded: {},
  passthroughArgs: [],
};

// Then each test specifies only what differs:
test("preset with no overrides returns preset axes", () => {
  const config = resolveConfig({ ...baseParsed, preset: "create" }, null);
  expect(config.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
});

test("--readonly flag adds readonly modifier", () => {
  const config = resolveConfig({
    ...baseParsed,
    preset: "create",
    modifiers: { readonly: true, print: false, contextPacing: false },
  }, null);
  expect(config.modifiers).toContain("modifiers/readonly.md");
});
```

### Example 2: `mockEnv` for env tests
**File**: `src/env.test.ts:41-50`
```typescript
const mockEnv: EnvInfo = {
  cwd: "/home/user/project", isGit: true, gitBranch: "main",
  gitStatus: "M src/index.ts", gitLog: "abc123 Initial commit",
  platform: "linux", shell: "bash", osVersion: "Linux 6.19.2",
};

test("returns empty GIT_STATUS when not a git repo", () => {
  const vars = buildTemplateVars({ ...mockEnv, isGit: false });
  expect(vars.GIT_STATUS).toBe("");
});
```

### Example 3: `TEST_VARS` as a module-level constant
**File**: `src/assemble.test.ts:16-26`
```typescript
const TEST_VARS: TemplateVars = {
  CWD: "/test/project", IS_GIT: "true", PLATFORM: "linux",
  SHELL: "bash", OS_VERSION: "Linux 6.0", MODEL_NAME: "Claude Opus 4.6",
  MODEL_ID: "claude-opus-4-6", KNOWLEDGE_CUTOFF: "May 2025",
  GIT_STATUS: "Current branch: main\n\nStatus:\n(clean)",
};

// Reused directly across all test functions in the file
test("assembles none mode without errors", () => {
  const result = assemblePrompt({
    mode: { axes: null, modifiers: { readonly: false, contextPacing: false, custom: [] } },
    templateVars: TEST_VARS,
    promptsDir: PROMPTS_DIR,
  });
  expect(result.length).toBeGreaterThan(0);
});
```

### Example 4: Mode config fixtures for assemble tests
**File**: `src/assemble.test.ts:66-79`
```typescript
const noneMode: ModeConfig = {
  axes: null,
  modifiers: { readonly: false, contextPacing: false, custom: [] },
};
const autonomousMode: ModeConfig = {
  axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
  modifiers: { readonly: false, contextPacing: false, custom: [] },
};
```

## When to Use

- Test functions that vary only 1-2 fields from a complete object
- When a type has many required fields and most tests only care about a subset
- Shared setup needed across multiple `describe` blocks in the same test file

## When NOT to Use

- When every test uses completely different values — base fixture adds no value
- Very simple types with only 1-2 fields — just inline them

## Common Violations

- Duplicating the full fixture inline in each test — obscures what's being tested
- Mutating the base fixture object instead of spreading — causes test interference
- Defining the same fixture in multiple test files instead of extracting to `test-helpers.ts`
