# Design: Debug and Methodical Presets

## Overview

Add two built-in presets (`debug`, `methodical`) with dedicated modifiers, and extend `PresetDefinition` to support `base` and `modifiers` fields. The modifier content is informed by the Anthropic emotion research — calm framing, positive language, no ALL-CAPS, graceful stuck-handling.

**Resolved open questions:**
1. Base priority chain: CLI `--base` > config `defaultBase` > preset `base` > `"standard"`
2. "debug" and "methodical" added to `BUILTIN_MODIFIER_NAMES`
3. `PresetDefinition` gains `base?: string` and `modifiers: string[]` fields

## Implementation Units

### Unit 1: Types — add new preset names and modifier names

**File**: `src/types.ts`

```typescript
// Update PRESET_NAMES — add "debug" and "methodical"
export const PRESET_NAMES = [
  "create", "extend", "safe", "refactor", "explore", "none",
  "debug", "methodical",
] as const;

// Update BUILTIN_MODIFIER_NAMES — add "debug" and "methodical"
export const BUILTIN_MODIFIER_NAMES = ["readonly", "context-pacing", "debug", "methodical"] as const;
```

**Implementation Notes**:
- The `isPresetName` and `isBuiltinModifier` predicates don't need changes — they derive from the const arrays automatically.
- `PresetName` and `BuiltinModifier` types widen automatically.

**Acceptance Criteria**:
- [ ] `isPresetName("debug")` returns `true`
- [ ] `isPresetName("methodical")` returns `true`
- [ ] `isBuiltinModifier("debug")` returns `true`
- [ ] `isBuiltinModifier("methodical")` returns `true`

---

### Unit 2: PresetDefinition — add base and modifiers fields

**File**: `src/presets.ts`

```typescript
export interface PresetDefinition {
  axes: AxisConfig | null;
  readonly: boolean;
  base?: string;         // new — default base for this preset
  modifiers: string[];   // new — built-in modifier names to apply
}
```

Update all entries in `PRESETS` to include `modifiers: []` (existing presets have no built-in modifiers), then add the two new presets:

```typescript
const PRESETS: Record<PresetName, PresetDefinition> = {
  "create": {
    axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
    readonly: false,
    modifiers: [],
  },
  "extend": {
    axes: { agency: "autonomous", quality: "pragmatic", scope: "adjacent" },
    readonly: false,
    modifiers: [],
  },
  "safe": {
    axes: { agency: "collaborative", quality: "minimal", scope: "narrow" },
    readonly: false,
    modifiers: [],
  },
  "refactor": {
    axes: { agency: "autonomous", quality: "pragmatic", scope: "unrestricted" },
    readonly: false,
    modifiers: [],
  },
  "explore": {
    axes: { agency: "collaborative", quality: "architect", scope: "narrow" },
    readonly: true,
    modifiers: [],
  },
  "none": {
    axes: null,
    readonly: false,
    modifiers: [],
  },
  "debug": {
    axes: { agency: "collaborative", quality: "pragmatic", scope: "narrow" },
    readonly: false,
    base: "chill",
    modifiers: ["debug"],
  },
  "methodical": {
    axes: { agency: "surgical", quality: "architect", scope: "narrow" },
    readonly: false,
    base: "chill",
    modifiers: ["methodical"],
  },
};
```

**Acceptance Criteria**:
- [ ] `getPreset("debug")` returns the correct axes, base, and modifiers
- [ ] `getPreset("methodical")` returns the correct axes, base, and modifiers
- [ ] `getPreset("create").modifiers` is `[]`
- [ ] `getPreset("create").base` is `undefined`

---

### Unit 3: Modifier content — debug.md

**File**: `prompts/modifiers/debug.md`

Content follows emotion research principles: calm, positive framing, no ALL-CAPS, explicitly addresses the "stuck" case. Under 200 words.

```markdown
# Investigation mode

You're here to understand what's going wrong. Approach this like a detective — gather evidence, form hypotheses, trace the data flow.

Start by understanding the problem before reaching for fixes. Read the relevant code, check error messages, trace the execution path. Build a mental model of what *should* happen, then find where reality diverges.

When presenting findings, be specific: file paths, line numbers, actual vs expected values. Give the user evidence they can verify themselves.

If a fix becomes clear during investigation, go ahead and apply it. If not, that's perfectly fine — understanding the problem is valuable on its own.

<example>
Situation: The user reports a 500 error on login.
Good: Read the auth handler, trace the request flow, check the error logs, identify that the session middleware is missing a null check on line 47, explain why this causes the 500, fix it.
Bad: Try adding try/catch blocks everywhere until the 500 goes away.
Understand first, then fix.
</example>

When you've exhausted your current leads, stop and share what you know: what you investigated, what you ruled out, and where you think the issue might be. Ask the user where to look next. There's no pressure to solve everything in one pass.
```

**Acceptance Criteria**:
- [ ] No ALL-CAPS emphasis words
- [ ] Contains a worked `<example>` block
- [ ] Explicitly addresses the "stuck" case with graceful exit
- [ ] Under 200 words (excluding the example block)

---

### Unit 4: Modifier content — methodical.md

**File**: `prompts/modifiers/methodical.md`

Content follows emotion research principles: positive emotional framing ("take satisfaction"), calm, no pressure.

```markdown
# Methodical mode

Work through this step by step. Complete each step fully before moving to the next.

Follow the user's instructions precisely. If something is ambiguous, ask for clarification rather than making assumptions. The goal is to do exactly what was asked, done well.

Attend to the details — naming, formatting, edge cases, test coverage. These are what separate good work from great work. Take satisfaction in getting the small things right.

Stay within the boundaries of what was asked. If you notice adjacent improvements, you can mention them briefly, but don't act on them. One thing at a time.

When the task is complete, say so and stop. No need to suggest next steps or mention tangential improvements. A clean finish is its own reward.
```

**Acceptance Criteria**:
- [ ] No ALL-CAPS emphasis words
- [ ] Uses positive emotional framing ("take satisfaction", "clean finish is its own reward")
- [ ] Explicitly addresses "stop when done" behavior
- [ ] Under 200 words

---

### Unit 5: Resolve — wire preset base and modifiers into resolveConfig

**File**: `src/resolve.ts`

Two changes in the built-in preset branch of `resolveConfig`:

1. Extract `preset.base` as `presetBase` (currently hardcoded to `undefined`)
2. Apply `preset.modifiers` via `applyModifiers`

```typescript
// In the built-in preset branch (around line 205):
if (isPresetName(parsed.preset)) {
  const preset = getPreset(parsed.preset);
  if (preset.axes === null) throw new Error(`Preset "${parsed.preset}" has null axes`);
  // ... existing axis resolution ...
  flags.readonly = flags.readonly || preset.readonly;
  presetBase = preset.base; // NEW — was undefined

  // NEW — apply preset's built-in modifiers (before CLI modifiers)
  if (preset.modifiers.length > 0) {
    applyModifiers(preset.modifiers, loadedConfig, flags, customModifierPaths, "prepend");
  }
}
```

Also update `resolveBase` priority chain. Current code (line 139):
```typescript
const value = raw ?? presetBase ?? config?.defaultBase ?? "standard";
```

Change to:
```typescript
const value = raw ?? config?.defaultBase ?? presetBase ?? "standard";
```

This makes config `defaultBase` take priority over preset base.

**Implementation Notes — Modifier Model**:

Built-in modifiers fall into two categories:
1. **Flag modifiers** (`readonly`, `context-pacing`) — these have dedicated CLI flags (`--readonly`, `--context-pacing`) and boolean fields on `ModeConfig.modifiers`. They exist because they predate the modifier system and are deeply wired into the assembly pipeline (the `"modifiers"` manifest marker checks these booleans).
2. **Fragment modifiers** (everything else: `debug`, `methodical`, and any future additions) — these are just embedded markdown files. They go into `ModeConfig.modifiers.custom` as relative embedded keys (`modifiers/debug.md`). No boolean flag, no special assembly logic.

The **fragment modifier is the general-purpose model**. Adding a new built-in modifier requires only:
1. Add the name to `BUILTIN_MODIFIER_NAMES` in `types.ts`
2. Write `prompts/modifiers/{name}.md`
3. Add to `generate-prompts.ts`

No changes to `ModeConfig`, `applyModifiers`, `resolveConfig`, or assembly logic.

The flag modifiers (`readonly`, `context-pacing`) are **legacy sugar** kept for backwards compatibility. New modifiers should always be fragment-based.

Update `applyModifiers` to make this model explicit:
```typescript
// Flag modifiers — legacy CLI sugar, kept for backwards compat
const FLAG_MODIFIERS: Record<string, keyof typeof flags> = {
  "readonly": "readonly",
  "context-pacing": "contextPacing",
};

function applyModifiers(
  modifiers: string[],
  loadedConfig: LoadedConfig | null,
  flags: { readonly: boolean; contextPacing: boolean },
  customPaths: string[],
  position: "append" | "prepend",
): void {
  for (const raw of modifiers) {
    const resolved = resolveModifier(raw, loadedConfig);
    if (resolved.kind === "builtin") {
      const flagKey = FLAG_MODIFIERS[resolved.name];
      if (flagKey) {
        // Flag modifier — set the boolean
        flags[flagKey] = true;
      } else {
        // Fragment modifier — add embedded key to custom paths
        const fragmentKey = `modifiers/${resolved.name}.md`;
        if (!customPaths.includes(fragmentKey)) {
          if (position === "prepend") customPaths.unshift(fragmentKey);
          else customPaths.push(fragmentKey);
        }
      }
    } else {
      if (!customPaths.includes(resolved.path)) {
        if (position === "prepend") customPaths.unshift(resolved.path);
        else customPaths.push(resolved.path);
      }
    }
  }
}
```

This eliminates the `if/else if/else` chain. `FLAG_MODIFIERS` is a data-driven map — adding or removing flag modifiers is a one-line change. Fragment modifiers need no changes at all.

**Acceptance Criteria**:
- [ ] `claude-mode debug` resolves to `base: "chill"`, axes collaborative/pragmatic/narrow, with `modifiers/debug.md` in custom modifier paths
- [ ] `claude-mode methodical` resolves to `base: "chill"`, axes surgical/architect/narrow, with `modifiers/methodical.md` in custom modifier paths
- [ ] `claude-mode debug --base standard` overrides base to standard
- [ ] `claude-mode debug --agency autonomous` overrides agency
- [ ] Config `defaultBase: "standard"` overrides preset base for `claude-mode debug`
- [ ] `claude-mode create --modifier debug` adds the debug modifier to the create preset
- [ ] `--modifier debug` is not passed through to claude (it's a known flag name)

---

### Unit 6: Usage text — add new presets

**File**: `src/usage.ts`

Add to presets section:
```
  debug           collaborative / pragmatic / narrow (chill base, investigation mode)
  methodical      surgical / architect / narrow (chill base, step-by-step)
```

Add to examples:
```
  claude-mode debug                           # investigation-first debugging
  claude-mode methodical                      # step-by-step precision
```

**Acceptance Criteria**:
- [ ] `claude-mode --help` shows debug and methodical presets
- [ ] Help text includes brief descriptions of both

---

### Unit 7: Embedded prompts — add new modifiers

**File**: `scripts/generate-prompts.ts`

Add to `FRAGMENT_PATHS`:
```typescript
  // Modifiers
  "modifiers/readonly.md",
  "modifiers/context-pacing.md",
  "modifiers/debug.md",        // new
  "modifiers/methodical.md",   // new
```

**Implementation Notes**:
- Fragment count increases from 25 to 27
- Run `bun scripts/generate-prompts.ts` after creating the modifier files

**Acceptance Criteria**:
- [ ] `bun scripts/generate-prompts.ts` produces 27 entries
- [ ] `EMBEDDED_PROMPTS["modifiers/debug.md"]` contains the debug modifier content
- [ ] `EMBEDDED_PROMPTS["modifiers/methodical.md"]` contains the methodical modifier content

---

## Implementation Order

1. **Unit 1**: Types (foundation — new preset/modifier names)
2. **Unit 2**: PresetDefinition (depends on unit 1)
3. **Unit 3 & 4**: Modifier content files (independent — can parallel with unit 2)
4. **Unit 5**: Resolve (depends on units 1-2)
5. **Unit 7**: Generate embedded prompts (depends on units 3-4, run `bun scripts/generate-prompts.ts`)
6. **Unit 6**: Usage text (independent)
7. Update tests
8. Run `bun test`

## Testing

### `src/presets.test.ts`

New tests:
- `getPreset("debug")` returns correct axes, base "chill", modifiers ["debug"]
- `getPreset("methodical")` returns correct axes, base "chill", modifiers ["methodical"]
- `getPreset("create").modifiers` is `[]`
- `getPreset("create").base` is `undefined`
- `isPresetName("debug")` returns true
- `isPresetName("methodical")` returns true

### `src/resolve.test.ts`

New tests:
- `debug` preset resolves base to "chill"
- `debug` preset includes `modifiers/debug.md` in custom modifier paths
- `debug --base standard` overrides base
- `debug --agency autonomous` overrides agency
- Config `defaultBase: "standard"` overrides debug preset's base
- `methodical` preset resolves base to "chill"
- `methodical` preset includes `modifiers/methodical.md` in custom modifier paths
- `create --modifier debug` adds debug modifier to create preset
- `create --modifier methodical` adds methodical modifier

### `src/assemble.test.ts`

New tests:
- Assembly with debug preset includes `modifiers/debug.md` fragment
- Assembly with methodical preset includes `modifiers/methodical.md` fragment
- Debug modifier content has no ALL-CAPS emphasis

### `src/embedded-prompts.test.ts`

Update:
- `EXPECTED_FRAGMENTS` list gains `"modifiers/debug.md"` and `"modifiers/methodical.md"`
- Count assertion changes from 25 to 27

### CLI/E2E tests (`build-prompt.test.ts`, `e2e.test.ts`, `cli.test.ts`)

New tests:
- `debug --print` produces valid output containing "Investigation mode"
- `methodical --print` produces valid output containing "Methodical mode"
- `debug --base standard --print` uses standard base
- `--help` shows debug and methodical
- `debug --print` output contains no unreplaced template vars

### `src/config.test.ts`

New test:
- Config with `modifiers: { "debug": "./x.md" }` throws collision error ("debug" is built-in)
- Config with `modifiers: { "methodical": "./x.md" }` throws collision error

## Verification Checklist

```bash
# Generate embedded prompts
bun scripts/generate-prompts.ts

# Type check
bunx tsc --noEmit

# Run all tests
bun test

# Verify debug preset
bun run src/build-prompt.ts debug --print | head -5
bun run src/build-prompt.ts debug --print | grep -i "investigation"

# Verify methodical preset
bun run src/build-prompt.ts methodical --print | head -5
bun run src/build-prompt.ts methodical --print | grep -i "methodical"

# Verify base override
bun run src/build-prompt.ts debug --base standard --print | head -3

# Verify no ALL-CAPS in modifiers
grep -E '\b(IMPORTANT|CRITICAL|MUST|NEVER)\b' prompts/modifiers/debug.md prompts/modifiers/methodical.md

# Verify help text
bun run src/build-prompt.ts --help | grep -E "debug|methodical"
```
