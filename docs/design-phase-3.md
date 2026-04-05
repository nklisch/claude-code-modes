# Design: Phase 3 — CLI Argument Parser + Prompt Builder Binary

## Overview

Phase 3 creates `src/build-prompt.ts`, the main binary that parses CLI arguments, resolves presets and axis overrides, assembles the prompt, writes it to a temp file, and outputs a complete `claude` command to stdout. It also adds `--print` as a debug flag (needed by Phase 4 tests).

The bash entry point is Phase 4. This phase focuses on the TypeScript binary that does all the logic.

---

## Implementation Units

### Unit 1: Argument Parsing Module

**File**: `src/args.ts`

```typescript
import { parseArgs } from "node:util";
import type { Agency, Quality, Scope, PresetName } from "./types.js";
import { AGENCY_VALUES, QUALITY_VALUES, SCOPE_VALUES } from "./types.js";
import { isPresetName } from "./presets.js";

export interface ParsedArgs {
  preset: PresetName | null;
  overrides: {
    agency?: Agency;
    quality?: Quality;
    scope?: Scope;
  };
  modifiers: {
    readonly: boolean;
    print: boolean;
  };
  forwarded: {
    appendSystemPrompt?: string;
    appendSystemPromptFile?: string;
  };
  passthroughArgs: string[];
}

export function parseCliArgs(argv: string[]): ParsedArgs { ... }
```

**`parseCliArgs()` implementation:**

The strategy: split `argv` at `--` if present. Left side goes through `parseArgs` with our known options (using `strict: false` to tolerate unknown flags). Unknown flags and their values from the left side, plus everything from the right side of `--`, become passthrough args.

```typescript
export function parseCliArgs(argv: string[]): ParsedArgs {
  // Split at -- separator
  const dashDashIdx = argv.indexOf("--");
  const ourArgs = dashDashIdx >= 0 ? argv.slice(0, dashDashIdx) : argv;
  const afterDashDash = dashDashIdx >= 0 ? argv.slice(dashDashIdx + 1) : [];

  const { values, positionals } = parseArgs({
    args: ourArgs,
    options: {
      agency: { type: "string" },
      quality: { type: "string" },
      scope: { type: "string" },
      readonly: { type: "boolean" },
      print: { type: "boolean" },
      "append-system-prompt": { type: "string" },
      "append-system-prompt-file": { type: "string" },
      "system-prompt": { type: "string" },
      "system-prompt-file": { type: "string" },
      help: { type: "boolean" },
    },
    strict: false,
    allowPositionals: true,
  });

  // Reject --system-prompt and --system-prompt-file
  if (values["system-prompt"] !== undefined || values["system-prompt-file"] !== undefined) {
    throw new Error(
      "Cannot use --system-prompt or --system-prompt-file with claude-mode. " +
      "claude-mode generates its own system prompt. Use --append-system-prompt to add content."
    );
  }

  // Extract preset from first positional
  let preset: PresetName | null = null;
  const remainingPositionals: string[] = [];
  for (const pos of positionals) {
    if (preset === null && isPresetName(pos)) {
      preset = pos;
    } else {
      remainingPositionals.push(pos);
    }
  }

  // Validate axis overrides
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

  // Collect unknown flags for passthrough
  // parseArgs with strict:false puts unknown flags in values as booleans
  // and their intended values as positionals. We need to reconstruct them.
  const knownFlags = new Set([
    "agency", "quality", "scope", "readonly", "print",
    "append-system-prompt", "append-system-prompt-file",
    "system-prompt", "system-prompt-file", "help",
  ]);
  const unknownPassthrough: string[] = [];
  for (const [key, val] of Object.entries(values)) {
    if (!knownFlags.has(key)) {
      unknownPassthrough.push(`--${key}`);
      if (typeof val === "string") {
        unknownPassthrough.push(val);
      }
    }
  }

  // Combine passthrough: unknown flags + remaining positionals + after --
  const passthroughArgs = [
    ...unknownPassthrough,
    ...remainingPositionals,
    ...afterDashDash,
  ];

  return {
    preset,
    overrides,
    modifiers: {
      readonly: values.readonly === true,
      print: values.print === true,
    },
    forwarded: {
      appendSystemPrompt: values["append-system-prompt"] as string | undefined,
      appendSystemPromptFile: values["append-system-prompt-file"] as string | undefined,
    },
    passthroughArgs,
  };
}
```

**Implementation Notes**:
- `strict: false` is required because we want to tolerate unknown flags and pass them through to `claude`.
- Unknown boolean flags from `strict: false` mode work fine. Unknown flags with string values are problematic — `parseArgs` treats the value as a positional. This is acceptable because the `--` separator is the recommended way to pass complex claude flags. Without `--`, simple boolean flags like `--verbose` work; flags with values like `--model sonnet` should use `-- --model sonnet`.
- The `help` flag is recognized but not acted on here — `build-prompt.ts` will handle it.
- Preset detection: first positional that matches a preset name. Others become passthrough.

**Acceptance Criteria**:
- [ ] `parseCliArgs(["create"])` returns `{ preset: "create", overrides: {}, ... }`
- [ ] `parseCliArgs(["create", "--agency", "collaborative"])` returns correct preset + override
- [ ] `parseCliArgs(["--agency", "autonomous", "--quality", "architect", "--scope", "unrestricted"])` returns null preset + all overrides
- [ ] `parseCliArgs(["create", "--", "--verbose", "--model", "sonnet"])` passes through args after `--`
- [ ] `parseCliArgs(["create", "--verbose"])` passes `--verbose` through
- [ ] `parseCliArgs(["create", "--system-prompt", "foo"])` throws error
- [ ] `parseCliArgs(["create", "--agency", "invalid"])` throws error
- [ ] `parseCliArgs(["create", "--readonly"])` sets `modifiers.readonly: true`
- [ ] `parseCliArgs(["create", "--print"])` sets `modifiers.print: true`
- [ ] `parseCliArgs(["create", "--append-system-prompt", "extra"])` captures in `forwarded`

---

### Unit 2: Resolve Configuration

**File**: `src/resolve.ts`

```typescript
import type { ModeConfig, Agency, Quality, Scope } from "./types.js";
import type { ParsedArgs } from "./args.js";
import { getPreset } from "./presets.js";

const DEFAULT_AGENCY: Agency = "collaborative";
const DEFAULT_QUALITY: Quality = "pragmatic";
const DEFAULT_SCOPE: Scope = "adjacent";

export function resolveConfig(parsed: ParsedArgs): ModeConfig { ... }
```

**`resolveConfig()` implementation:**

```typescript
export function resolveConfig(parsed: ParsedArgs): ModeConfig {
  if (parsed.preset === "none") {
    // None mode: no axes, just modifiers
    return {
      axes: null,
      modifiers: {
        readonly: parsed.modifiers.readonly,
      },
    };
  }

  let agency: Agency;
  let quality: Quality;
  let scope: Scope;
  let readonly = parsed.modifiers.readonly;

  if (parsed.preset) {
    // Start from preset, apply overrides
    const preset = getPreset(parsed.preset);
    if (preset.axes === null) {
      // Shouldn't happen — "none" is handled above
      throw new Error(`Preset "${parsed.preset}" has null axes`);
    }
    agency = parsed.overrides.agency ?? preset.axes.agency;
    quality = parsed.overrides.quality ?? preset.axes.quality;
    scope = parsed.overrides.scope ?? preset.axes.scope;
    // Preset's readonly is OR'd with the flag (explore defaults to readonly,
    // but you could also explicitly pass --readonly on any other preset)
    readonly = readonly || preset.readonly;
  } else {
    // No preset: use overrides with defaults
    agency = parsed.overrides.agency ?? DEFAULT_AGENCY;
    quality = parsed.overrides.quality ?? DEFAULT_QUALITY;
    scope = parsed.overrides.scope ?? DEFAULT_SCOPE;
  }

  return {
    axes: { agency, quality, scope },
    modifiers: { readonly },
  };
}
```

**Implementation Notes**:
- Defaults for standalone axis use (no preset): `collaborative/pragmatic/adjacent` — a safe middle ground.
- `readonly` from preset is OR'd with the explicit flag. This means `explore` is always readonly unless you subclass it differently.
- `none` is a special case — always returns `axes: null` regardless of overrides.

**Acceptance Criteria**:
- [ ] Preset with no overrides returns preset's axes verbatim
- [ ] Preset with partial override merges correctly (override wins, others from preset)
- [ ] No preset + no overrides returns defaults (`collaborative/pragmatic/adjacent`)
- [ ] No preset + partial overrides fills remaining from defaults
- [ ] `none` preset always returns `axes: null` regardless of overrides
- [ ] `explore` preset returns `readonly: true` even without `--readonly` flag
- [ ] `--readonly` flag on any preset sets `readonly: true`

---

### Unit 3: Build Command Output

**File**: `src/build-prompt.ts`

This is the main entry point. It ties everything together.

```typescript
#!/usr/bin/env bun
import { join } from "node:path";
import { parseCliArgs } from "./args.js";
import { resolveConfig } from "./resolve.js";
import { assemblePrompt, writeTempPrompt } from "./assemble.js";
import { detectEnv, buildTemplateVars } from "./env.js";
import { PRESET_NAMES } from "./types.js";

function printUsage(): void { ... }
function main(): void { ... }

main();
```

**`printUsage()` implementation:**

```typescript
function printUsage(): void {
  const usage = `Usage: claude-mode [preset] [options] [-- claude-args...]

Presets:
  create     autonomous / architect / unrestricted
  extend     autonomous / pragmatic / adjacent
  safe      collaborative / minimal / narrow
  refactor        autonomous / pragmatic / unrestricted
  explore         collaborative / architect / narrow (readonly)
  none            no behavioral instructions

Axis overrides:
  --agency <autonomous|collaborative|surgical>
  --quality <architect|pragmatic|minimal>
  --scope <unrestricted|adjacent|narrow>

Modifiers:
  --readonly      Prevent file modifications
  --print         Print assembled prompt instead of launching claude

Forwarded to claude:
  --append-system-prompt <text>
  --append-system-prompt-file <path>

Everything after -- is passed to claude verbatim.

Examples:
  claude-mode create
  claude-mode create --quality pragmatic
  claude-mode --agency autonomous --quality architect --scope unrestricted
  claude-mode explore --print
  claude-mode create -- --verbose --model sonnet`;

  process.stdout.write(usage + "\n");
}
```

**`main()` implementation:**

```typescript
function main(): void {
  const argv = process.argv.slice(2);

  // No args or --help: show usage
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const config = resolveConfig(parsed);

  // Detect environment and build template vars
  const env = detectEnv();
  const templateVars = buildTemplateVars(env);

  // Assemble the prompt
  const promptsDir = join(import.meta.dir, "..", "prompts");
  const prompt = assemblePrompt({
    mode: config,
    templateVars,
    promptsDir,
  });

  // --print: output the prompt itself (for debugging / Phase 4 tests)
  if (parsed.modifiers.print) {
    process.stdout.write(prompt);
    process.exit(0);
  }

  // Write to temp file
  const tempFile = writeTempPrompt(prompt);

  // Build the claude command
  const claudeArgs: string[] = ["claude", "--system-prompt-file", tempFile];

  // Forward append-system-prompt flags
  if (parsed.forwarded.appendSystemPrompt) {
    claudeArgs.push("--append-system-prompt", parsed.forwarded.appendSystemPrompt);
  }
  if (parsed.forwarded.appendSystemPromptFile) {
    claudeArgs.push("--append-system-prompt-file", parsed.forwarded.appendSystemPromptFile);
  }

  // Add passthrough args
  claudeArgs.push(...parsed.passthroughArgs);

  // Output the command — the bash wrapper will exec this
  process.stdout.write(claudeArgs.map(shellEscape).join(" ") + "\n");
}
```

**Shell escaping helper:**

```typescript
function shellEscape(arg: string): string {
  // If arg contains no special characters, return as-is
  if (/^[a-zA-Z0-9_.\/\-=]+$/.test(arg)) {
    return arg;
  }
  // Otherwise, wrap in single quotes, escaping any internal single quotes
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}
```

**Implementation Notes**:
- `import.meta.dir` gives the directory of the current file (`src/`), so `join(import.meta.dir, "..", "prompts")` resolves to the `prompts/` directory at the project root.
- `--print` exits early and writes the prompt to stdout — no temp file, no claude command. This is essential for debugging and Phase 4 e2e tests.
- Shell escaping is needed because the output is `eval`'d or `exec`'d by the bash wrapper. Args with spaces or special chars need quoting.
- `process.argv.slice(2)` skips `bun` and the script path.

**Acceptance Criteria**:
- [ ] No args prints usage and exits 0
- [ ] `--help` prints usage and exits 0
- [ ] `create` outputs `claude --system-prompt-file /tmp/...`
- [ ] `create --print` outputs the assembled prompt text (not a claude command)
- [ ] `create --append-system-prompt "extra"` includes `--append-system-prompt 'extra'` in output
- [ ] `create -- --verbose --model sonnet` includes `--verbose --model sonnet` in output
- [ ] Invalid preset name exits with error
- [ ] Invalid axis value exits with error
- [ ] `--system-prompt foo` exits with error
- [ ] Shell-escapes args with special characters

---

### Unit 4: Update Package Scripts

**File**: `package.json`

Add a `bin` field and update scripts:

```json
{
  "scripts": {
    "build-prompt": "bun run src/build-prompt.ts",
    "test": "bun test"
  }
}
```

No changes needed — the existing scripts already work. The bash wrapper (Phase 4) will call `bun run src/build-prompt.ts` directly.

**Acceptance Criteria**:
- [ ] `bun run src/build-prompt.ts --help` prints usage
- [ ] `bun run src/build-prompt.ts create --print` outputs prompt text

---

## Implementation Order

1. **Unit 1: `src/args.ts`** — argument parsing, no dependencies on new code
2. **Unit 2: `src/resolve.ts`** — depends on args types and presets (both exist)
3. **Unit 3: `src/build-prompt.ts`** — depends on args, resolve, assemble, env (all exist after 1+2)
4. **Tests** — after all source is written

## Testing

### Unit Tests: `src/args.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { parseCliArgs } from "./args.js";

describe("parseCliArgs", () => {
  test("parses preset only", () => {
    const result = parseCliArgs(["create"]);
    expect(result.preset).toBe("create");
    expect(result.overrides).toEqual({});
    expect(result.passthroughArgs).toEqual([]);
  });

  test("parses preset with axis override", () => {
    const result = parseCliArgs(["create", "--agency", "collaborative"]);
    expect(result.preset).toBe("create");
    expect(result.overrides.agency).toBe("collaborative");
  });

  test("parses all axis overrides without preset", () => {
    const result = parseCliArgs(["--agency", "autonomous", "--quality", "architect", "--scope", "unrestricted"]);
    expect(result.preset).toBeNull();
    expect(result.overrides).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
  });

  test("captures passthrough args after --", () => {
    const result = parseCliArgs(["create", "--", "--verbose", "--model", "sonnet"]);
    expect(result.preset).toBe("create");
    expect(result.passthroughArgs).toEqual(["--verbose", "--model", "sonnet"]);
  });

  test("passes through unknown boolean flags", () => {
    const result = parseCliArgs(["create", "--verbose"]);
    expect(result.passthroughArgs).toContain("--verbose");
  });

  test("throws on --system-prompt", () => {
    expect(() => parseCliArgs(["create", "--system-prompt", "foo"])).toThrow("Cannot use --system-prompt");
  });

  test("throws on --system-prompt-file", () => {
    expect(() => parseCliArgs(["create", "--system-prompt-file", "foo.md"])).toThrow("Cannot use --system-prompt");
  });

  test("throws on invalid agency", () => {
    expect(() => parseCliArgs(["--agency", "invalid"])).toThrow('Invalid --agency value: "invalid"');
  });

  test("throws on invalid quality", () => {
    expect(() => parseCliArgs(["--quality", "invalid"])).toThrow('Invalid --quality value: "invalid"');
  });

  test("throws on invalid scope", () => {
    expect(() => parseCliArgs(["--scope", "invalid"])).toThrow('Invalid --scope value: "invalid"');
  });

  test("parses --readonly modifier", () => {
    const result = parseCliArgs(["create", "--readonly"]);
    expect(result.modifiers.readonly).toBe(true);
  });

  test("parses --print modifier", () => {
    const result = parseCliArgs(["create", "--print"]);
    expect(result.modifiers.print).toBe(true);
  });

  test("captures --append-system-prompt", () => {
    const result = parseCliArgs(["create", "--append-system-prompt", "extra stuff"]);
    expect(result.forwarded.appendSystemPrompt).toBe("extra stuff");
  });

  test("captures --append-system-prompt-file", () => {
    const result = parseCliArgs(["create", "--append-system-prompt-file", "/path/to/file.md"]);
    expect(result.forwarded.appendSystemPromptFile).toBe("/path/to/file.md");
  });

  test("none preset recognized", () => {
    const result = parseCliArgs(["none"]);
    expect(result.preset).toBe("none");
  });

  test("empty args returns no preset", () => {
    const result = parseCliArgs([]);
    expect(result.preset).toBeNull();
  });
});
```

### Unit Tests: `src/resolve.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { resolveConfig } from "./resolve.js";
import type { ParsedArgs } from "./args.js";

const baseParsed: ParsedArgs = {
  preset: null,
  overrides: {},
  modifiers: { readonly: false, print: false },
  forwarded: {},
  passthroughArgs: [],
};

describe("resolveConfig", () => {
  test("preset with no overrides returns preset axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "create" });
    expect(config.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
  });

  test("preset with partial override merges", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "create",
      overrides: { quality: "pragmatic" },
    });
    expect(config.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "unrestricted" });
  });

  test("no preset uses defaults", () => {
    const config = resolveConfig(baseParsed);
    expect(config.axes).toEqual({ agency: "collaborative", quality: "pragmatic", scope: "adjacent" });
  });

  test("no preset with partial overrides fills from defaults", () => {
    const config = resolveConfig({ ...baseParsed, overrides: { agency: "autonomous" } });
    expect(config.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "adjacent" });
  });

  test("none preset returns null axes", () => {
    const config = resolveConfig({ ...baseParsed, preset: "none" });
    expect(config.axes).toBeNull();
  });

  test("explore preset returns readonly true", () => {
    const config = resolveConfig({ ...baseParsed, preset: "explore" });
    expect(config.modifiers.readonly).toBe(true);
  });

  test("--readonly flag on any preset", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "create",
      modifiers: { readonly: true, print: false },
    });
    expect(config.modifiers.readonly).toBe(true);
  });

  test("explore without --readonly is still readonly", () => {
    const config = resolveConfig({
      ...baseParsed,
      preset: "explore",
      modifiers: { readonly: false, print: false },
    });
    expect(config.modifiers.readonly).toBe(true);
  });
});
```

### Integration Tests: `src/build-prompt.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const BUILD_PROMPT = join(import.meta.dir, "build-prompt.ts");

function run(args: string): string {
  return execSync(`bun run ${BUILD_PROMPT} ${args}`, {
    encoding: "utf8",
    timeout: 10000,
    cwd: join(import.meta.dir, ".."),
  }).trim();
}

function runExpectFail(args: string): string {
  try {
    execSync(`bun run ${BUILD_PROMPT} ${args}`, {
      encoding: "utf8",
      timeout: 10000,
      cwd: join(import.meta.dir, ".."),
    });
    throw new Error("Expected command to fail");
  } catch (err: any) {
    return err.stderr?.toString() || err.message;
  }
}

describe("build-prompt CLI", () => {
  test("no args prints usage", () => {
    const output = run("");
    expect(output).toContain("Usage: claude-mode");
  });

  test("--help prints usage", () => {
    const output = run("--help");
    expect(output).toContain("Usage: claude-mode");
  });

  test("create outputs claude command with --system-prompt-file", () => {
    const output = run("create");
    expect(output).toMatch(/^claude --system-prompt-file /);
    // Extract temp file path and verify it exists
    const match = output.match(/--system-prompt-file ([^\s']+|'[^']+')/);
    expect(match).not.toBeNull();
    const tempFile = match![1].replace(/'/g, "");
    expect(existsSync(tempFile)).toBe(true);
  });

  test("--print outputs prompt content", () => {
    const output = run("create --print");
    expect(output).toContain("Claude Code");
    expect(output).toContain("# Agency: Autonomous");
    expect(output).toContain("# Quality: Architect");
    expect(output).not.toMatch(/^claude /);
  });

  test("passthrough args appear in output", () => {
    const output = run("create -- --verbose --model sonnet");
    expect(output).toContain("--verbose");
    expect(output).toContain("--model");
    expect(output).toContain("sonnet");
  });

  test("--append-system-prompt forwarded", () => {
    const output = run("create --append-system-prompt 'extra rules'");
    expect(output).toContain("--append-system-prompt");
  });

  test("--system-prompt rejected", () => {
    const errOutput = runExpectFail("create --system-prompt foo");
    expect(errOutput).toContain("Cannot use --system-prompt");
  });

  test("invalid agency rejected", () => {
    const errOutput = runExpectFail("--agency invalid");
    expect(errOutput).toContain("Invalid --agency");
  });

  test("all presets produce valid commands", () => {
    for (const preset of ["create", "extend", "safe", "refactor", "explore", "none"]) {
      const output = run(preset);
      expect(output).toMatch(/^claude --system-prompt-file /);
    }
  });
});
```

**Implementation Notes for tests**:
- `run()` executes `build-prompt.ts` as a subprocess — true integration test.
- `runExpectFail()` expects the command to exit non-zero and captures stderr.
- The `cwd` is set to project root so `import.meta.dir` resolves `prompts/` correctly.
- Temp files created during tests are not cleaned up — they're in `/tmp` and ephemeral.

## Verification Checklist

```bash
cd /home/nathan/dev/claude-mode

# Run all tests
bun test

# Manual smoke tests
bun run src/build-prompt.ts --help
bun run src/build-prompt.ts create --print | head -5
bun run src/build-prompt.ts create
bun run src/build-prompt.ts create -- --verbose --model sonnet
bun run src/build-prompt.ts explore --print | grep -c "Read-only"
bun run src/build-prompt.ts none --print | grep -c "# Agency:"
```
