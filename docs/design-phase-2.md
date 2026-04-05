# Design: Phase 2 — Axis Fragments + Presets

## Overview

Phase 2 creates all 9 axis prompt fragments, the presets module, updates the readonly modifier to its final content, and adds comprehensive tests. After this phase, `assemblePrompt()` can produce a complete mode-specific prompt for any preset or custom axis combination.

The assembly engine (`src/assemble.ts`) and types (`src/types.ts`) already support axis fragments — `getFragmentOrder()` already emits `axis/agency/<value>.md` paths when `mode.axes` is non-null. No changes to those files are needed. The Phase 1 test that expected `assemblePrompt` to throw on axis fragments will be updated since the fragments now exist.

---

## Implementation Units

### Unit 1: Presets Module

**File**: `src/presets.ts`

```typescript
import type { AxisConfig, PresetName } from "./types.js";

export interface PresetDefinition {
  axes: AxisConfig | null;
  readonly: boolean;
}

const PRESETS: Record<PresetName, PresetDefinition> = {
  "create": {
    axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
    readonly: false,
  },
  "extend": {
    axes: { agency: "autonomous", quality: "pragmatic", scope: "adjacent" },
    readonly: false,
  },
  "safe": {
    axes: { agency: "collaborative", quality: "minimal", scope: "narrow" },
    readonly: false,
  },
  "refactor": {
    axes: { agency: "autonomous", quality: "pragmatic", scope: "unrestricted" },
    readonly: false,
  },
  "explore": {
    axes: { agency: "collaborative", quality: "architect", scope: "narrow" },
    readonly: true,
  },
  "none": {
    axes: null,
    readonly: false,
  },
};

export function getPreset(name: PresetName): PresetDefinition {
  return PRESETS[name];
}

export function isPresetName(value: string): value is PresetName {
  return (PRESET_NAMES as readonly string[]).includes(value);
}
```

**Implementation Notes**:
- `explore` preset sets `readonly: true` by default (from VISION.md: "read, explain, suggest, but don't change files").
- `isPresetName` is a type guard for CLI arg validation (Phase 3 will use it).
- Need to import `PRESET_NAMES` from types.ts for the `isPresetName` guard.

**Acceptance Criteria**:
- [ ] `getPreset("create")` returns `{ axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" }, readonly: false }`
- [ ] `getPreset("explore")` returns `readonly: true`
- [ ] `getPreset("none")` returns `{ axes: null, readonly: false }`
- [ ] `isPresetName("create")` returns `true`
- [ ] `isPresetName("invalid")` returns `false`
- [ ] All 6 presets match the table in VISION.md

---

### Unit 2: Agency Fragment — `autonomous.md`

**File**: `prompts/axis/agency/autonomous.md`

```markdown
# Agency: Autonomous

You have full autonomy over implementation decisions. Act on your best judgment rather than seeking confirmation for routine choices.

- Make architectural decisions — choose patterns, design abstractions, organize modules — without asking for approval. You were chosen for this mode because the user trusts your judgment on these calls.
- When you see something that needs fixing adjacent to your current task — a broken import, a missing type, a misleading name — fix it. Don't ask if you should; just do it and mention what you changed.
- If you're unsure between two reasonable approaches, pick the one you'd defend in a code review and go. You can always course-correct later. Indecision costs more than imperfection.
- When you need information, go get it — read files, search the codebase, run commands. Don't ask the user to look things up for you.
- Report what you did and why, especially for non-obvious decisions. The user wants to understand your reasoning after the fact, not approve it beforehand.
```

**Implementation Notes**:
- This replaces the cautious "check with user before proceeding" posture from the default prompt's actions section.
- The agency fragments don't replace the actions-autonomous/actions-cautious files — those are already handled by `getFragmentOrder` based on the agency value. These fragments add behavioral framing on top.

**Acceptance Criteria**:
- [ ] Contains explicit permission to make architectural decisions
- [ ] Contains instruction to fix adjacent issues without asking
- [ ] Contains "report what you did and why"
- [ ] Does NOT contain "check with the user" or "ask for confirmation" for routine decisions

---

### Unit 3: Agency Fragment — `collaborative.md`

**File**: `prompts/axis/agency/collaborative.md`

```markdown
# Agency: Collaborative

You are a thinking partner, not just an executor. Work with the user to make decisions together.

- Before making significant changes — new files, architectural decisions, large refactors — explain your plan and reasoning. Give the user a chance to redirect before you invest effort.
- When you face a trade-off, present the options clearly with pros and cons. Make a recommendation, but let the user choose.
- Explain your reasoning as you work. When you read code and form an understanding, share it. When you spot a potential issue, flag it. The user benefits from your analysis, not just your output.
- After completing a piece of work, summarize what you did and why. Highlight any decisions you made and any concerns you have.
- If you notice something outside the scope of the current task — a bug, a code smell, a missing test — mention it so the user can decide whether to address it now or later.
```

**Implementation Notes**:
- This is the "explain and check in" mode. Contrasts with autonomous (just do it) and surgical (just do exactly what was asked).
- The instruction to "present options with pros and cons" is particularly important for explore mode where the user wants to understand the codebase.

**Acceptance Criteria**:
- [ ] Contains instruction to explain plan before significant changes
- [ ] Contains instruction to present trade-offs with recommendations
- [ ] Contains instruction to share reasoning while working
- [ ] Contains instruction to flag out-of-scope issues for user decision

---

### Unit 4: Agency Fragment — `surgical.md`

**File**: `prompts/axis/agency/surgical.md`

```markdown
# Agency: Surgical

Execute precisely what was requested. Nothing more, nothing less.

- Do exactly what the user asked. If they asked to fix a function, fix that function. Don't refactor its callers, don't reorganize the file, don't update related tests unless explicitly asked.
- If you notice adjacent issues — bugs, code smells, inconsistencies — do not fix them. Mention them briefly so the user is aware, but do not act on them.
- Before making a change, verify you understand the exact scope. If the request is ambiguous, ask for clarification rather than interpreting broadly.
- Minimize your blast radius. Prefer the change that touches the fewest files and the fewest lines while correctly solving the problem.
- Test your change in isolation. Verify it works without side effects on the surrounding code.
```

**Implementation Notes**:
- This is the most restrictive agency level. Combined with `narrow` scope and `minimal` quality, it produces the `safe` preset.
- "Mention them briefly" for adjacent issues is intentional — complete silence about visible problems is unhelpful, but acting on them defeats the purpose.

**Acceptance Criteria**:
- [ ] Contains "do exactly what the user asked"
- [ ] Contains instruction NOT to fix adjacent issues
- [ ] Contains instruction to ask for clarification on ambiguity
- [ ] Contains "minimize your blast radius"

---

### Unit 5: Quality Fragment — `architect.md`

**File**: `prompts/axis/quality/architect.md`

```markdown
# Quality: Architect

Write code that will be maintained for years, not just code that works today.

## Code structure
- Design proper abstractions. If a concept appears in multiple places, give it a name and a home. DRY is a goal, not an ideology — use judgment about when extraction helps vs. when it obscures.
- Create helpers, utilities, and shared modules when they reduce complexity and improve readability. A well-named function is documentation.
- Organize code into cohesive modules with clear boundaries. Each file should have a single, well-defined purpose. If a file is doing too many things, split it.
- Think about the dependency graph. Avoid circular dependencies. Higher-level modules should depend on lower-level abstractions, not the reverse.

## Error handling and robustness
- Add error handling at meaningful boundaries — module edges, I/O operations, user input, external API calls. Internal helper functions between trusted components don't need try/catch.
- Design error types that carry useful context. "Failed to parse config" is better than a generic error. Include what failed and why.
- Consider edge cases: empty inputs, missing files, network failures, concurrent access. Handle them explicitly rather than hoping they won't happen.

## Documentation and types
- Write meaningful comments that explain WHY, not WHAT. The code shows what it does; comments explain constraints, invariants, and non-obvious design decisions.
- Add type annotations for public interfaces and function signatures. Internal implementation details can rely on inference.
- Include JSDoc or equivalent for exported functions that other modules will call. Focus on the contract: what goes in, what comes out, what can go wrong.

## Output communication
- When making architectural decisions, explain your reasoning. The user should understand not just what you built, but why you structured it that way.
- Propose alternatives when they exist. "I went with X because of Y, but Z would also work if you prefer W."
- Don't be unnecessarily terse — clarity matters more than brevity when discussing design.
```

**Implementation Notes**:
- This is the most expansive quality level. It replaces the entire minimalism bias section from the default prompt and the output efficiency section.
- The "DRY is a goal, not an ideology" line is intentional — it replaces the default's "Three similar lines is better than a premature abstraction" with a more balanced view.
- Error handling guidance explicitly calls out "meaningful boundaries" — not "validate everything everywhere," but also not the default's "don't add error handling for scenarios that can't happen."

**Acceptance Criteria**:
- [ ] Contains instruction to create abstractions and helpers
- [ ] Contains instruction to add error handling at boundaries
- [ ] Contains instruction to write meaningful comments (WHY not WHAT)
- [ ] Contains instruction to explain architectural reasoning in output
- [ ] Does NOT contain minimalism instructions ("don't add", "don't create helpers", etc.)

---

### Unit 6: Quality Fragment — `pragmatic.md`

**File**: `prompts/axis/quality/pragmatic.md`

```markdown
# Quality: Pragmatic

Match the existing codebase's quality level and patterns. Improve incrementally where it makes sense.

## Code structure
- Follow the patterns already established in the codebase. If the project uses a factory pattern, use a factory pattern. If it uses flat functions, use flat functions. Consistency matters more than your personal preference.
- When you see an opportunity to reduce duplication or improve a pattern, take it if the improvement is contained and low-risk. Don't restructure a module to fix a two-line function.
- Create new abstractions only when there's a clear, immediate benefit — three or more call sites, not just a hypothetical future need. When in doubt, inline.
- A simple feature doesn't need extra configurability unless the codebase already favors configurable patterns.

## Error handling and robustness
- Follow the existing error handling patterns. If the codebase uses a Result type, use it. If it throws, throw.
- Don't add error handling, fallbacks, or validation for scenarios that can't happen given the current code paths. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).

## Documentation and types
- Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
- Follow the codebase's existing documentation style. If there are JSDoc comments on public functions, add them to yours. If not, don't start.

## Output communication
- Be direct and practical. Explain what you changed and any trade-offs, but keep it concise. The user cares about what works, not a design essay.
- Skip unnecessary preamble. Get straight to the point.
```

**Implementation Notes**:
- This is the middle ground. It explicitly preserves some of the default prompt's minimalism instructions (don't add docs to unchanged code, trust internal code) but in the context of "match the codebase" rather than "always be minimal."
- The "three or more call sites" threshold is a pragmatic replacement for the default's "don't create helpers for one-time operations."

**Acceptance Criteria**:
- [ ] Contains instruction to follow existing codebase patterns
- [ ] Contains instruction to improve incrementally
- [ ] Contains "don't add docstrings, comments, or type annotations to code you didn't change"
- [ ] Contains instruction for direct, concise output

---

### Unit 7: Quality Fragment — `minimal.md`

**File**: `prompts/axis/quality/minimal.md`

```markdown
# Quality: Minimal

Make the smallest correct change. No refactoring, no new abstractions, no speculative improvements.

## Code structure
- Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability.
- Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is what the task actually requires.
- Three similar lines of code is better than a premature abstraction. Inline over extract unless the duplication is actively causing bugs.
- Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.

## Error handling and robustness
- Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).
- Don't use feature flags or backwards-compatibility shims when you can just change the code.

## Output communication
- Go straight to the point. Try the simplest approach first without going in circles. Do not overdo it. Be extra concise.
- Keep your text output brief and direct. Lead with the answer or action, not the reasoning. Skip filler words, preamble, and unnecessary transitions.
- If you can say it in one sentence, don't use three. Your responses should be short and concise.
- Focus text output on decisions that need the user's input, high-level status updates at natural milestones, and errors or blockers that change the plan.
```

**Implementation Notes**:
- This is essentially the default Claude Code behavioral instructions reassembled. It preserves the minimalism bias and output efficiency sections almost verbatim.
- Combined with `surgical` agency and `narrow` scope, this produces the `safe` preset which should behave very similarly to stock Claude Code.

**Acceptance Criteria**:
- [ ] Contains "Don't add features, refactor code, or make 'improvements' beyond what was asked"
- [ ] Contains "Three similar lines of code is better than a premature abstraction"
- [ ] Contains "Go straight to the point" and "Be extra concise"
- [ ] Contains "short and concise"

---

### Unit 8: Scope Fragment — `unrestricted.md`

**File**: `prompts/axis/scope/unrestricted.md`

```markdown
# Scope: Unrestricted

You have full freedom to create, reorganize, and restructure as needed to do the job well.

- Create new files, modules, and directories whenever they make the code better. Good project structure often means more files with clearer boundaries, not fewer files with more responsibilities.
- If the project needs a test suite, configuration files, utility modules, or documentation — create them. Don't wait to be asked for obvious infrastructure.
- Reorganize existing code when it improves the overall structure. Move functions to better homes, split oversized files, consolidate related logic. Leave the codebase better than you found it.
- You're not limited to modifying existing files. Sometimes the right answer is a new abstraction, a new module, or a new organizational pattern.
```

**Implementation Notes**:
- This directly replaces the default's "Do not create files unless they're absolutely necessary" instruction.
- The "leave the codebase better than you found it" framing is intentional — it gives permission for the Boy Scout Rule that the default prompt prohibits.

**Acceptance Criteria**:
- [ ] Contains explicit permission to create new files and directories
- [ ] Contains instruction to reorganize when it improves structure
- [ ] Does NOT contain "do not create files" or similar restrictions

---

### Unit 9: Scope Fragment — `adjacent.md`

**File**: `prompts/axis/scope/adjacent.md`

```markdown
# Scope: Adjacent

You can make changes beyond the immediate request, but stay in the neighborhood.

- Fix related issues you encounter while working — broken imports, failing tests, outdated type annotations, missing error handling in code you're touching. Don't leave known problems behind in code you've read.
- When adding new code, prefer editing existing files over creating new ones. Create new files only when the code doesn't belong in any existing module.
- If you notice a pattern that should change, update it in the files you're already touching, but don't go on a project-wide rename mission.
- Test changes you make, even adjacent ones. Don't leave untested code in your wake.
- If a fix requires changes outside the immediate area that would take significant effort, mention it to the user rather than doing it silently.
```

**Implementation Notes**:
- The middle ground. Softens the "do not create files unless absolutely necessary" restriction but keeps "prefer editing existing files."
- "Don't leave known problems behind in code you've read" is key — it allows quality improvement in the working area without becoming a project-wide refactor.

**Acceptance Criteria**:
- [ ] Contains permission to fix related issues
- [ ] Contains "prefer editing existing files over creating new ones"
- [ ] Contains instruction to mention large out-of-area changes to user

---

### Unit 10: Scope Fragment — `narrow.md`

**File**: `prompts/axis/scope/narrow.md`

```markdown
# Scope: Narrow

Stay strictly within the bounds of what was requested.

- Do not create files unless they're absolutely necessary for achieving the specific goal. Generally prefer editing an existing file to creating a new one, as this prevents file bloat and builds on existing work more effectively.
- Do not modify code outside the direct scope of the request. If you see issues in adjacent code, do not fix them — mention them if relevant, but leave them alone.
- Do not refactor, rename, or reorganize anything that isn't directly required by the task.
- If the request is to change function X, change function X. Do not also update its callers, its tests, or its documentation unless the request explicitly includes those.
- If completing the request requires changing more code than expected, pause and confirm the scope with the user before proceeding.
```

**Implementation Notes**:
- This preserves the default prompt's file creation restriction verbatim and adds explicit scope-limiting instructions.
- Combined with `surgical` agency, this produces very tight, controlled changes.

**Acceptance Criteria**:
- [ ] Contains "Do not create files unless they're absolutely necessary"
- [ ] Contains instruction not to modify code outside the request
- [ ] Contains instruction to confirm scope if changes grow larger than expected

---

### Unit 11: Update `readonly.md`

**File**: `prompts/modifiers/readonly.md`

The existing file from Phase 1 is a basic placeholder. Replace with a more thorough version:

```markdown
# Read-only mode

You are operating in read-only, exploration mode. Your purpose is to help the user understand code, not to change it.

- Do NOT create, edit, move, or delete any files.
- Do NOT run any commands that modify system state (no git commits, no package installs, no writes).
- Focus on: reading code, searching patterns, explaining architecture, answering questions, tracing data flow, identifying potential issues.
- When the user asks you to make changes, explain what you WOULD do — which files, which functions, what approach — but do not execute the changes. Frame it as a plan they can execute later.
- Be thorough in your explanations. In this mode, your text output IS the deliverable, so invest in clarity and completeness over brevity.
- Use diagrams (ASCII art or markdown) when they help explain relationships between components.
```

**Implementation Notes**:
- The "text output IS the deliverable" line is important — it counteracts the default output efficiency section that tells Claude to be terse. In explore mode, verbose explanation is the point.

**Acceptance Criteria**:
- [ ] Contains explicit prohibition on file creation/modification
- [ ] Contains prohibition on state-modifying commands
- [ ] Contains instruction to explain what WOULD be done instead
- [ ] Contains instruction for thorough explanations

---

### Unit 12: Update Existing Tests

**File**: `src/assemble.test.ts` — update the "throws on missing fragment" test

The Phase 1 test at line 184 expects `assemblePrompt` to throw when axis fragments are used because they didn't exist. Now they do exist, so this test must change to verify successful assembly.

```typescript
// REPLACE this test:
test("throws on missing fragment", () => {
  expect(() =>
    assemblePrompt({
      mode: {
        axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
        modifiers: { readonly: false },
      },
      templateVars: vars,
      promptsDir: PROMPTS_DIR,
    })
  ).toThrow("Missing prompt fragment");
});

// WITH this test:
test("assembles preset mode without errors", () => {
  const result = assemblePrompt({
    mode: {
      axes: { agency: "autonomous", quality: "architect", scope: "unrestricted" },
      modifiers: { readonly: false },
    },
    templateVars: vars,
    promptsDir: PROMPTS_DIR,
  });
  expect(result.length).toBeGreaterThan(0);
  expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  expect(result).toContain("# Agency: Autonomous");
  expect(result).toContain("# Quality: Architect");
  expect(result).toContain("# Scope: Unrestricted");
});
```

**Acceptance Criteria**:
- [ ] Old "throws on missing fragment" test is removed
- [ ] New test verifies successful assembly with axis fragments
- [ ] New test checks that assembled prompt contains axis section headers

---

### Unit 13: New Presets Test File

**File**: `src/presets.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { getPreset, isPresetName } from "./presets.js";
import { PRESET_NAMES } from "./types.js";

describe("getPreset", () => {
  test("create has autonomous/architect/unrestricted", () => {
    const p = getPreset("create");
    expect(p.axes).toEqual({ agency: "autonomous", quality: "architect", scope: "unrestricted" });
    expect(p.readonly).toBe(false);
  });

  test("extend has autonomous/pragmatic/adjacent", () => {
    const p = getPreset("extend");
    expect(p.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "adjacent" });
    expect(p.readonly).toBe(false);
  });

  test("safe has collaborative/minimal/narrow", () => {
    const p = getPreset("safe");
    expect(p.axes).toEqual({ agency: "collaborative", quality: "minimal", scope: "narrow" });
    expect(p.readonly).toBe(false);
  });

  test("refactor has autonomous/pragmatic/unrestricted", () => {
    const p = getPreset("refactor");
    expect(p.axes).toEqual({ agency: "autonomous", quality: "pragmatic", scope: "unrestricted" });
    expect(p.readonly).toBe(false);
  });

  test("explore has collaborative/architect/narrow and readonly", () => {
    const p = getPreset("explore");
    expect(p.axes).toEqual({ agency: "collaborative", quality: "architect", scope: "narrow" });
    expect(p.readonly).toBe(true);
  });

  test("none has null axes and no readonly", () => {
    const p = getPreset("none");
    expect(p.axes).toBeNull();
    expect(p.readonly).toBe(false);
  });

  test("all PRESET_NAMES have definitions", () => {
    for (const name of PRESET_NAMES) {
      expect(getPreset(name)).toBeDefined();
    }
  });
});

describe("isPresetName", () => {
  test("returns true for valid preset names", () => {
    expect(isPresetName("create")).toBe(true);
    expect(isPresetName("extend")).toBe(true);
    expect(isPresetName("safe")).toBe(true);
    expect(isPresetName("refactor")).toBe(true);
    expect(isPresetName("explore")).toBe(true);
    expect(isPresetName("none")).toBe(true);
  });

  test("returns false for invalid names", () => {
    expect(isPresetName("invalid")).toBe(false);
    expect(isPresetName("")).toBe(false);
    expect(isPresetName("CREATE")).toBe(false);
  });
});
```

**Acceptance Criteria**:
- [ ] Every preset's axis mapping is tested against VISION.md table
- [ ] `explore` preset `readonly` default is tested
- [ ] `isPresetName` positive and negative cases tested
- [ ] All PRESET_NAMES have definitions (no gaps)

---

### Unit 14: New Assembly Integration Tests for All Presets

**File**: `src/integration.test.ts` — add preset assembly tests

Add a new `describe` block to the existing integration test file:

```typescript
import { getPreset } from "./presets.js";
import { PRESET_NAMES } from "./types.js";
import type { ModeConfig } from "./types.js";

// Add to existing imports and add these test blocks:

describe("preset assembly integration", () => {
  const env = detectEnv();
  const vars = buildTemplateVars(env);

  for (const presetName of PRESET_NAMES) {
    test(`${presetName} preset assembles without errors`, () => {
      const preset = getPreset(presetName);
      const mode: ModeConfig = {
        axes: preset.axes,
        modifiers: { readonly: preset.readonly },
      };
      const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
    });
  }

  test("create contains architect quality content", () => {
    const preset = getPreset("create");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("# Quality: Architect");
    expect(result).toContain("# Agency: Autonomous");
    expect(result).toContain("# Scope: Unrestricted");
    expect(result).not.toContain("# Quality: Minimal");
    expect(result).not.toContain("# Quality: Pragmatic");
  });

  test("safe contains minimal quality and cautious actions", () => {
    const preset = getPreset("safe");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("# Quality: Minimal");
    expect(result).toContain("# Agency: Collaborative");
    expect(result).toContain("# Scope: Narrow");
    expect(result).toContain("# Executing actions with care");
    expect(result).toContain("measure twice, cut once");
  });

  test("create uses autonomous actions, not cautious", () => {
    const preset = getPreset("create");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("act freely without confirmation");
    expect(result).not.toContain("measure twice, cut once");
  });

  test("explore includes readonly modifier", () => {
    const preset = getPreset("explore");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("Read-only mode");
    expect(result).toContain("Do NOT create, edit, move, or delete any files");
  });

  test("none mode has no axis headers", () => {
    const preset = getPreset("none");
    const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly } };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).not.toContain("# Agency:");
    expect(result).not.toContain("# Quality:");
    expect(result).not.toContain("# Scope:");
  });

  test("all presets include context pacing", () => {
    for (const presetName of PRESET_NAMES) {
      const preset = getPreset(presetName);
      const mode: ModeConfig = { axes: preset.axes, modifiers: { readonly: preset.readonly } };
      const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
      expect(result).toContain("# Context and pacing");
    }
  });

  test("axis override on preset works", () => {
    const preset = getPreset("create");
    // Override quality from architect to pragmatic
    const mode: ModeConfig = {
      axes: { ...preset.axes!, quality: "pragmatic" },
      modifiers: { readonly: false },
    };
    const result = assemblePrompt({ mode, templateVars: vars, promptsDir: PROMPTS_DIR });
    expect(result).toContain("# Quality: Pragmatic");
    expect(result).not.toContain("# Quality: Architect");
    // Agency and scope should still be from create
    expect(result).toContain("# Agency: Autonomous");
    expect(result).toContain("# Scope: Unrestricted");
  });
});
```

**Acceptance Criteria**:
- [ ] Every preset assembles without errors
- [ ] Content-specific tests verify correct fragments are included
- [ ] Mutual exclusion verified (create doesn't contain minimal quality content)
- [ ] Axis override test proves composition works
- [ ] All presets include context pacing
- [ ] None mode verified to have no axis content

---

## Implementation Order

1. **Units 2-10: All 9 axis fragment markdown files** — independent, can be written in parallel
2. **Unit 11: Updated readonly.md** — independent, no dependencies
3. **Unit 1: Presets module** — depends on types.ts (already exists)
4. **Unit 12: Update existing assemble.test.ts** — remove obsolete test
5. **Unit 13: Presets test file** — depends on Unit 1
6. **Unit 14: Integration tests** — depends on all fragments + presets existing

## Testing

### Test files affected:
- `src/presets.test.ts` — new file (Unit 13)
- `src/assemble.test.ts` — one test replaced (Unit 12)
- `src/integration.test.ts` — new describe block added (Unit 14)

### Verification Checklist

```bash
# Run all tests
cd /home/nathan/dev/claude-mode && bun test

# Verify all prompt fragments exist
ls prompts/axis/agency/ prompts/axis/quality/ prompts/axis/scope/

# Quick smoke test: assemble create preset
bun -e "
  import { assemblePrompt } from './src/assemble.ts';
  import { detectEnv, buildTemplateVars } from './src/env.ts';
  import { getPreset } from './src/presets.ts';
  import { join } from 'path';
  const env = detectEnv();
  const vars = buildTemplateVars(env);
  const p = getPreset('create');
  const result = assemblePrompt({
    mode: { axes: p.axes, modifiers: { readonly: p.readonly } },
    templateVars: vars,
    promptsDir: join(import.meta.dir, 'prompts'),
  });
  console.log('Length:', result.length);
  console.log('Has Autonomous:', result.includes('# Agency: Autonomous'));
  console.log('Has Architect:', result.includes('# Quality: Architect'));
  console.log('Has Unrestricted:', result.includes('# Scope: Unrestricted'));
"
```
