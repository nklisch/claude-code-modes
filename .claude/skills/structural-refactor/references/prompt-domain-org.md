# Rule: Prompt Domain Organization

> Prompts are organized by domain concept (base infrastructure, axis values, modifiers) — not by implementation layer or file type.

## Motivation

The prompt directory structure mirrors the domain model: three axes (agency, quality, scope)
with three values each, plus base infrastructure and modifiers. This makes it intuitive to
find and edit fragments — you think "I want to change the collaborative agency behavior" and
navigate to `prompts/axis/agency/collaborative.md`. The structure is self-documenting.

## Before / After

### From this codebase: domain-organized prompts (correct)

**Before:** (current — already follows the rule)
```
prompts/
  base/                    # standard base: manifest + 8 fragments
    base.json              # manifest declaring fragment order
    intro.md
    system.md
    doing-tasks.md
    actions.md             # neutral risky-actions guidance
    tools.md
    tone.md
    session-guidance.md
    env.md
  chill/                   # chill base: manifest + 4 fragments (emotion-research-informed)
    base.json
    core.md                # consolidated intro+system+tasks+tone+session
    actions.md
    tools.md
    env.md
  axis/                    # organized by domain axis
    agency/
      autonomous.md
      collaborative.md
      surgical.md
    quality/
      architect.md
      pragmatic.md
      minimal.md
    scope/
      unrestricted.md
      adjacent.md
      narrow.md
  modifiers/               # optional behavior toggles
    context-pacing.md
    readonly.md
    debug.md
    methodical.md
    director.md
```

### Synthetic example: implementation-organized prompts (anti-pattern)

**Before:**
```
prompts/
  fragments/
    all-fragments.md       # everything in one file
  templates/
    base-template.md
    axis-template.md
```

**After:**
```
prompts/
  base/                    # what every mode gets
  axis/{agency,quality,scope}/  # per-axis fragments
  modifiers/               # optional toggles
```

Organization follows the domain (axes, modifiers) not the implementation (templates, fragments).

## Exceptions

- Custom user prompts (from config `--modifier path`) live outside prompts/ — that's by design
- If a new axis is added, create a new subdirectory under `axis/`

## Scope

- Applies to: `prompts/` directory
- Does NOT apply to: `src/` (code structure), `.claude/skills/` (skill structure)
