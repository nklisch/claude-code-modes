# Pattern: Parse → Resolve → Assemble Pipeline

The CLI data flow is a strict one-way pipeline: raw argv is parsed into a typed struct, resolved into a config, then assembled into output. Each stage is a pure function that receives the previous stage's output.

## Rationale

Separating parsing from business logic from output assembly means each layer can be tested independently and evolved without touching the others. The entry point (`build-prompt.ts`) is just an orchestrator — it owns no logic, only sequencing.

## Examples

### Example 1: The four pipeline stages
**File**: `src/build-prompt.ts:82-118`
```typescript
// Stage 1: Parse raw input → ParsedArgs
let parsed;
try {
  parsed = parseCliArgs(argv);
} catch (err) {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
}

// Stage 1b: Load config from disk (between parse and resolve)
let loadedConfig;
try {
  loadedConfig = loadConfig();
} catch (err) {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
}

// Stage 2: Resolve into final config → ModeConfig (pure, receives loaded config)
const config = resolveConfig(parsed, loadedConfig);

// Stage 2b: Detect and format environment → TemplateVars
const env = detectEnv();
const templateVars = buildTemplateVars(env);

// Stage 3: Assemble → complete prompt string
const prompt = assemblePrompt({ mode: config, templateVars, promptsDir });
```

### Example 2: Parse stage produces flat, typed output
**File**: `src/args.ts:3-21`
```typescript
export interface ParsedArgs {
  preset: string | null;
  overrides: { agency?: string; quality?: string; scope?: string; };
  modifiers: { readonly: boolean; print: boolean; contextPacing: boolean; };
  customModifiers: string[];
  forwarded: { appendSystemPrompt?: string; appendSystemPromptFile?: string; };
  passthroughArgs: string[];
}
```

### Example 3: Resolve stage merges with defaults, no I/O
**File**: `src/resolve.ts`
```typescript
export function resolveConfig(
  parsed: ParsedArgs,
  loadedConfig: LoadedConfig | null,
): ModeConfig {
  // No side effects except reading loadedConfig (already loaded by caller)
  const modifierPaths: string[] = [];
  if (config?.defaultModifiers) {
    applyModifiers(config.defaultModifiers, loadedConfig, modifierPaths, "append");
  }
  // CLI boolean flags → inject as modifier names
  if (parsed.modifiers.readonly) applyModifiers(["readonly"], loadedConfig, modifierPaths, "append");
  applyModifiers(parsed.customModifiers, loadedConfig, modifierPaths, "append");
  // ... axis resolution ...
  return { base, axes: { agency, quality, scope }, modifiers: modifierPaths };
}
```

### Example 4: Assemble stage reads files and substitutes variables
**File**: `src/assemble.ts:106-132`
```typescript
export function assemblePrompt(options: AssembleOptions): string {
  const { mode, templateVars, promptsDir } = options;
  const fragmentPaths = getFragmentOrder(mode);
  const sections: string[] = [];
  for (const fragPath of fragmentPaths) {
    const fullPath = isAbsolute(fragPath) ? fragPath : resolve(promptsDir, fragPath);
    let content: string | null;
    try { content = readFileSync(fullPath, "utf8"); } catch { content = null; }
    if (content === null) throw new Error(`Missing prompt fragment: ${fragPath}`);
    sections.push(content.trim());
  }
  return substituteTemplateVars(sections.join("\n\n"), templateVars);
}
```

## When to Use

- Any new CLI command that takes user input, applies logic, and produces output
- When adding a new transformation step — add a new stage rather than embedding logic in an existing stage

## When NOT to Use

- Simple read-only operations that don't need config resolution
- One-off utilities with no input→logic→output shape

## Common Violations

- Adding business logic to `parseCliArgs` (parsing should be dumb — just extract values)
- Doing I/O in `resolveConfig` (resolution is pure — no files, no network, no process.env)
- Mixing `assemblePrompt` with CLI concerns like stderr or process.exit
