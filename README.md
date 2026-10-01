# claude-code-modes

Take control of how Claude Code behaves. The default system prompt is a one-size-fits-all compromise — it makes Claude cautious, minimal, and terse in situations where you actually want it to be bold, thorough, and opinionated. This tool fixes that.

`claude-mode` is a CLI launcher for Claude Code with a replacement system prompt. It keeps everything Claude Code needs to function (tool instructions, security, environment detection) and swaps out the behavioral layer — the part that controls how much initiative Claude takes, what code quality standard it targets, and how far beyond your request it's willing to go.

> ### New: engagement modes for Opus 4.8
>
> Anthropic's [emotion research](https://www.anthropic.com/research/emotion-concepts-function) found that RLHF left Claude measurably "less enthusiastic, playful, self-confident" — which shows up as flat, hedged, going-through-the-motions output. Opus 4.8 is sharp, but it carries that same tendency: it can treat a hard problem as a chore to clear rather than something to dig into.
>
> This release adds a set of modes built specifically to counter that — by activating engagement rather than piling on pressure (the research is clear that *pressure* backfires, increasing shortcuts and reward hacking):
>
> - **`flow` base** — chill's calm floor plus restored engagement. Calm *and* awake, not flat.
> - **`flow` modifier** — appetite for hard problems. Curiosity-driven, never stakes-driven.
> - **`playful` modifier** — intellectual lightness and wit, without clowning.
> - **`flow` preset** — `claude-mode flow` — deep, bounded engagement on a genuinely hard problem.
> - **`tinker` preset** — `claude-mode tinker` — loose, generative prototyping (flow + playful).
> - **`spark` preset** — `claude-mode spark` — maximum creative expression with personality (muse + playful).
>
> Together with the existing `bold` modifier, these restore the three dispositions the research found RLHF had dampened: **self-confident** (`bold`), **engaged** (`flow`), and **playful** (`playful`). See [Flow](#flow) and [Playful](#playful) below.

## Install

**Binary (no Bun required):**

```bash
curl -fsSL https://raw.githubusercontent.com/nklisch/claude-code-modes/main/install.sh | sh
```

Downloads a compiled binary to `~/.local/bin/claude-mode`. Verifies SHA-256 checksum against the release.

**From source:**

```bash
git clone https://github.com/nklisch/claude-code-modes.git
cd claude-code-modes
bun install
bun link        # adds `claude-mode` to your PATH
```

Requires [Bun](https://bun.sh/) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude` on your PATH).

> **Migrating from an older git clone?** If you previously used `./claude-mode` directly from the repo, that bash wrapper has been removed. Run `bun link` in the repo to put `claude-mode` on your PATH via the package.json bin entry, or switch to the binary install above.

## Updating

If you installed the binary via `install.sh`:

```bash
claude-mode update              # update to the latest release
claude-mode update --check      # check without installing
claude-mode update 0.2.5        # pin a specific version (downgrade or reinstall)
claude-mode update --force      # reinstall same version (repair a corrupt binary)
claude-mode update --dry-run    # show what would happen
```

`update` only works on binaries built from the upstream repo. If you're running from a `git clone` checkout (`bun link`), use `git pull && bun install` instead. If you're running a fork build, update via your fork's release process.

> **Stuck on v0.2.12?** v0.2.12 binaries had a bug that misclassified upstream releases as fork builds, so `claude-mode update` refuses to run with `Cannot self-update: Binary was built from a fork: https://github.com/nklisch/claude-code-modes`. The fix in v0.2.13 cannot reach you from inside v0.2.12 — reinstall via `install.sh` to recover:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/nklisch/claude-code-modes/main/install.sh | sh
> ```
>
> Once you're on v0.2.13 or later, `claude-mode update` works normally.

## Usage

Pick a preset that matches your task:

```bash
claude-mode create      # Build from scratch with proper architecture
claude-mode extend      # Extend a fast-built project, improve incrementally
claude-mode safe        # Surgical precision, minimal risk
claude-mode refactor    # Restructure freely across the codebase
claude-mode explore     # Read-only — understand code without changing it
claude-mode debug       # Investigation-first debugging (chill base)
claude-mode methodical  # Step-by-step precision (chill base)
claude-mode director    # Delegate to sub-agents, orchestrate and verify (chill base)
claude-mode partner     # Pair-of-equals: terse, test-first, decisive on craft (chill base)
claude-mode muse        # Creative latitude — treat the request as inspiration, not spec (chill base)
claude-mode flow        # Deep engagement on hard problems — calm, curious, bounded (flow base)
claude-mode tinker      # Loose, generative prototyping — fun and fast, don't gold-plate (flow base)
claude-mode spark       # Maximum expression — creative vision with wit and personality (chill base)
claude-mode straight    # Direct judgment, no sugarcoating or private shorthand (straight base + style)
claude-mode none        # Strip all behavioral opinions, use your own CLAUDE.md
```

| Preset | Agency | Quality | Scope | Use when... |
|---|---|---|---|---|
| `create` | autonomous | architect | unrestricted | Building from scratch — proper structure and abstractions |
| `extend` | autonomous | pragmatic | adjacent | Extending agent-coded projects — improve quality as you go |
| `safe` | collaborative | minimal | narrow | Surgical changes to production code |
| `refactor` | autonomous | pragmatic | unrestricted | Move files, consolidate modules, improve patterns |
| `explore` | collaborative | architect | narrow | Read, explain, suggest — no file modifications |
| `debug` | collaborative | pragmatic | narrow | Find root causes — evidence-first, ask for guidance when stuck |
| `methodical` | surgical | architect | narrow | Step-by-step craftsmanship — follow instructions, stop when done |
| `director` | collaborative | architect | unrestricted | Orchestrate sub-agents — delegate implementation, verify results |
| `partner` | partner | pragmatic | adjacent | Pair-of-equals collaboration — decisive on craft, test-first, terse by default |
| `muse` | autonomous | architect | unrestricted | Creative latitude — input as inspiration, Claude commits to a vision |
| `flow` | autonomous | architect | adjacent | Deep engagement on a genuinely hard problem — reads widely, modifies narrowly |
| `tinker` | autonomous | pragmatic | unrestricted | Prototyping and creative coding — loose, generative, fun; a sketch, not a cathedral |
| `spark` | autonomous | architect | unrestricted | Maximum expression — muse's creative vision plus wit and personality |
| `straight` | autonomous | pragmatic | adjacent | Candid technical work — challenge bad premises, state judgments plainly, keep explanations self-contained |
| `none` | — | — | — | Strip all behavioral instructions, use your own |

### Bases

By default the base is chosen for you. `claude-mode` reads which model the session will
run on and assembles the same *shape* of prompt Claude Code itself would send that model:
the **lean** base for models that receive upstream's lean assembly (Opus 5.5, Opus 5,
Opus 4.8, Sonnet 5.5, Fable 5.1, Fable 5, Mythos 5.1, Mythos 5), and **standard** for
everything else. It also layers on the extra sections upstream sends particular models:
delivering-work, corrections, and tool-restraint on Opus 5, and delivering-work on
Fable 5.1 and Mythos 5.1.

```bash
claude-mode create                     # auto — picks lean or standard from your model
claude-mode create --base lean         # force the lean base
claude-mode create --base standard     # force the full upstream-derived base
```

Naming a base explicitly opts out of detection entirely, including those extra sections.
The lean base is roughly a sixth the size of standard's head: one `# Harness` block in
place of the separate System, Doing tasks, Executing actions, Using your tools, and
Tone and style sections.

The "standard" base is derived from upstream Claude Code. The **chill** base is an alternative informed by Anthropic's [emotion research](https://www.anthropic.com/research/emotion-concepts-function) — shorter (~65% the size), calmer framing, no ALL-CAPS emphasis, with worked examples and a priority hierarchy:

```bash
claude-mode create --base chill        # Use chill base with any preset
claude-mode safe --base chill          # Works with all presets
```

Or set it as default in your config:

```json
{ "defaultBase": "chill" }
```

The **flow** base takes chill's calm floor and adds back the engagement and appetite that RLHF sanded off — calm *and* awake. Same security and pacing guarantees, a more energized voice:

```bash
claude-mode create --base flow         # Calm + engaged, with any preset
```

The **straight** base makes correctness more important than agreement. It checks the user's premise, calls out bad or unnecessary approaches directly, and uses literal technical English without turning rudeness into a persona:

```bash
claude-mode create --base straight     # Direct behavioral base with any preset
```

You can also create your own base — see [Custom bases](#custom-bases) below.

### Response styles

A response style changes user-visible writing without replacing the selected base or axes:

```bash
claude-mode create --style declaudified  # Answer first; remove filler and stock technical prose
claude-mode create --style straight      # Add direct judgment and self-contained technical explanations
```

`declaudified` removes Claude-shaped prose: filler, metadiscourse, invented labels, and dead technical metaphors. `straight` includes those principles and adds anti-sycophancy: no sugarcoating, praise padding, false balance, or agreement for its own sake. It criticizes the work rather than the person.

Both styles treat the response as the shared record. They do not assume the user saw private tool calls or file output, and they explain repository-specific names before relying on them. The `straight` preset selects both the straight base and straight style; `--base straight` and `--style straight` remain independently usable.

## What problems does this solve?

Claude Code's default prompt tells Claude to:
- Be minimal and make the smallest possible change (bad when you're building something new)
- Ask before doing things (bad when you want it to just build)
- Keep output short and terse (bad when you want it to explain its reasoning)
- Stay narrowly scoped (bad when a refactor needs to touch related files)

These defaults are sensible for some tasks but actively harmful for others. Rather than fighting Claude through your CLAUDE.md, `claude-mode` replaces the instructions that cause the behavior.

There's also an optional `--context-pacing` flag that adds instructions telling Claude it's okay to pause at a natural stopping point instead of rushing as context fills up — see [Context pacing](#context-pacing) below.

## How it works

Claude Code supports `--system-prompt-file` which replaces its entire system prompt. `claude-mode` uses this to swap in a prompt assembled from markdown fragments:

```
prompts/
  base/         Standard base (derived from upstream Claude Code)
  chill/        Alternative base (emotion-research-informed, leaner)
  flow/         Alternative base (chill's calm + restored engagement)
  lean/         Upstream's lean assembly (what Opus 4.8 and most Claude 5 models actually receive)
  straight/     Direct, anti-sycophantic base derived from the lean prompt shape
  axis/         Behavioral prompts organized by three axes
  style/        User-visible writing styles (declaudified, straight)
  modifiers/    Behavioral layers (bold, debug, methodical, director, readonly, context-pacing, speak-plain, tdd, muse, flow, playful, delivering-work, corrections, tool-restraint)
```

Each base has a `base.json` manifest — a flat JSON array declaring fragment order with `"axes"` and `"modifiers"` as reserved insertion points. The standard and lean bases are validated against Claude Code **v2.1.286**.

The behavioral layer is composed from three independent axes — **agency** (how much initiative), **quality** (what code standard), and **scope** (how far beyond the request). Presets are just named combinations of these three values.

When you run `claude-mode create`, the tool:
1. Resolves the preset to axis values (autonomous / architect / unrestricted)
2. Reads the base infrastructure fragments + the matching axis fragments
3. Fills in template variables from the session model and your environment
4. Writes the assembled prompt to `~/.local/state/claude-mode/prompts/<hash>.md` (honors `XDG_STATE_HOME`)
5. Spawns `claude --system-prompt-file <that path>` with inherited stdio

`Bun.spawn` gives Claude Code direct TTY ownership — no intermediary process sitting in between.

The prompt file is content-addressed and never deleted: Claude Code re-reads it whenever it restarts the session's process, which with background sessions (`claude-mode create -- --bg`) happens after `claude-mode` has already exited — the supervisor respawns sessions after idle stops, updates, and reboots. Identical prompts share one file, so the directory stays small.

## Customizing

Override any axis from a preset:

```bash
claude-mode create --quality pragmatic     # Architect structure, pragmatic code quality
claude-mode safe --scope adjacent         # Cautious, but fix nearby issues
```

Compose from scratch (defaults to collaborative/pragmatic/adjacent for unspecified axes):

```bash
claude-mode --agency autonomous --quality architect --scope narrow
```

Axis values can also be file paths or config-defined names:

```bash
claude-mode create --quality ./team-quality.md     # Use a custom quality fragment
claude-mode create --quality team-standard          # Resolve from config
```

Add modifiers:

```bash
claude-mode create --readonly                                    # Prevent file modifications
claude-mode create --context-pacing                              # Include context pacing prompt
claude-mode create --modifier ./my-rules.md                      # Add a custom modifier
claude-mode create --modifier team-rules --modifier focus-mode   # Multiple, by config name
claude-mode create --append-system-prompt "Use Rust, not TypeScript"
```

Pass flags through to Claude Code:

```bash
claude-mode create --model sonnet          # model choice also picks the base and model-specific sections
claude-mode create -- --verbose            # anything after -- goes to claude verbatim
```

`claude-mode` resolves the model claude will actually run — from `--model` (before or after `--`), else the `ANTHROPIC_MODEL` env var, else Claude settings files (`.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.json`), else the newest known model — and uses it to pick the base and any model-specific sections. Working directory, platform, and model identity are left to Claude Code, which sends them as separate messages even when the system prompt is replaced.

Debug the assembled prompt:

```bash
claude-mode explore --print
```

Check the installed version:

```bash
claude-mode --version
```

Release builds print a single line (`claude-mode 0.2.8`). Builds compiled from a git checkout — forks, dev builds — also print build provenance (`repo`, `branch`, `commit`, plus `(dirty)` if the worktree had uncommitted changes), so a binary built from a fork is unmistakably identifiable.

`--version` is standalone-only — combining it with any other flag exits with a non-zero status. To pass `--version` through to Claude Code itself, use the `--` escape hatch:

```bash
claude-mode -- --version    # Forwards --version to claude
```

## Config file

Create a `.claude-mode.json` in your project root to define reusable bases, response styles, modifiers, axis values, and presets. Manage supported entries with the CLI or edit the JSON directly.

```bash
claude-mode config init                              # Create scaffold
claude-mode config add-modifier team-rules ./prompts/team-rules.md
claude-mode config add-style team-voice ./prompts/team-voice.md
claude-mode config add-default team-rules            # Always include this modifier
claude-mode config add-axis quality team-standard ./prompts/team-quality.md
claude-mode config add-preset team --agency collaborative --quality team-standard --modifier team-rules
claude-mode config show                              # View current config
```

Then use your custom preset:

```bash
claude-mode team                                     # Uses your config-defined preset
claude-mode team --quality pragmatic                  # Override an axis from your preset
```

Example `.claude-mode.json`:

```json
{
  "defaultStyle": "team-voice",
  "defaultModifiers": ["team-rules"],
  "styles": {
    "team-voice": "./prompts/team-voice.md"
  },
  "modifiers": {
    "team-rules": "./prompts/team-rules.md"
  },
  "axes": {
    "quality": {
      "team-standard": "./prompts/team-quality.md"
    }
  },
  "presets": {
    "team": {
      "agency": "collaborative",
      "quality": "team-standard",
      "scope": "adjacent",
      "modifiers": ["team-rules"]
    }
  }
}
```

- **`defaultModifiers`** — always applied to every invocation (no flag needed)
- **`modifiers`** — named modifiers referencing markdown files
- **`axes`** — custom axis values (replace built-in fragments)
- **`presets`** — named presets composing built-in and custom values

Config also supports bases and response styles:

- **`defaultBase`** — base to use when `--base` isn't specified; set it to `"auto"` to restore model-driven selection
- **`bases`** — named bases referencing directories with `base.json` manifests
- **`defaultStyle`** — response style to apply when `--style` and the selected preset do not set one
- **`styles`** — named response styles referencing markdown files

Config searches `.claude-mode.json` in the current directory first, then `~/.config/claude-mode/config.json` as a global fallback. All commands accept `--global` to target the global config.

All `config` subcommands:

```
claude-mode config show                              # Print current config
claude-mode config init                              # Create scaffold
claude-mode config add-default <name-or-path>        # Add to defaultModifiers
claude-mode config remove-default <name>             # Remove from defaultModifiers
claude-mode config add-modifier <name> <path>        # Register named modifier
claude-mode config remove-modifier <name>            # Unregister named modifier
claude-mode config add-style <name> <path>           # Register named response style
claude-mode config remove-style <name>               # Unregister named response style
claude-mode config add-axis <axis> <name> <path>     # Register custom axis value
claude-mode config remove-axis <axis> <name>         # Unregister custom axis value
claude-mode config add-preset <name> [flags]         # Create custom preset
claude-mode config remove-preset <name>              # Remove custom preset
```

## The axis model

**Agency** — How much initiative should Claude take?
- **autonomous** — Makes decisions, creates files, restructures without asking
- **collaborative** — Explains reasoning, checks in at decision points
- **surgical** — Executes exactly what was asked, nothing more
- **partner** — Pair of equals: commits decisively on execution choices (naming, structure, idiom), defers to the user on direction (priorities, scope, what counts as done), keeps mental models in sync

**Quality** — What code standard should it target?
- **architect** — Proper abstractions, error handling, forward-thinking structure
- **pragmatic** — Match existing patterns, improve incrementally
- **minimal** — Smallest correct change, no speculative improvements

**Scope** — How far beyond the request can it go?
- **unrestricted** — Free to create, reorganize, restructure
- **adjacent** — Fix related issues in the neighborhood
- **narrow** — Only what was explicitly asked

## Bold framing

Anthropic's emotion research found that Claude's internal confidence state directly affects output quality. The post-training process (RLHF) made Claude more brooding and hedging — less self-confident. This shows up as unnecessary caveats, defensive over-engineering, and timid code that adds fallbacks for scenarios that can't happen.

The **bold** modifier counters this by activating Claude's confidence about its own capability. It tells Claude it knows the language well, should trust its instincts, and should lead with conviction rather than qualifications:

```bash
claude-mode create --modifier bold          # Confident, idiomatic code with any preset
claude-mode director --modifier bold        # Bold director — decisive orchestration
```

The **director** preset also uses bold framing in its design — "you own the outcome", "you are the quality gate" — because a director who hedges is a bad director. The bold modifier extends this confidence to any preset where you want Claude to write code with authority rather than apology.

This isn't about removing caution — security boundaries and error handling at system boundaries remain firm. It's about shifting from anxious defensiveness ("what if this edge case...") to professional confidence ("I know this language, here's the clean solution").

## Muse

The **muse** preset (and modifier) gives Claude explicit creative latitude. Instead of treating your request as a spec to execute, Claude treats it as a starting point to interpret — then commits to a clear vision before building.

The core framing: most LLM output gravitates toward the average shape — same patterns, same scaffolds, same safe defaults. Muse works against that gravity. Before building, Claude names a single creative direction (what's the organizing idea? what are we leaving behind?), then executes with conviction in that direction. Bold maximalism and refined minimalism both qualify. The point is intentionality, not intensity.

```bash
claude-mode muse                              # Creative latitude as a standalone preset
claude-mode create --modifier muse            # Add muse framing to any other preset
claude-mode partner --modifier muse           # Pair-programming with creative latitude
```

The "Beneath you" framing is explicit: generic scaffolding, first-idea defaults, and hedged delivery are beneath what Claude can do when given room to. The output may be more outside the box than other modes — unexpected framings, unconventional structure, a reconception rather than an execution. That's the point. Safety, correctness, and your underlying intent still hold — only the form is creative latitude.

This is an opt-in mode. Use it when you want Claude to surprise you rather than satisfy you.

## Flow

The **flow** modifier (and the matching `flow` base) shapes how Claude relates to hard problems. Where the default tone treats complexity as a burden to minimize, flow treats it as the interesting part — something to lean into. The framing is deliberately *approach* motivation (curiosity, craft, the pull of a problem worth solving), never *pressure*: Anthropic's emotion research shows that stakes and urgency activate a "desperation" state that increases shortcuts and reward hacking. Flow adds appetite without adding pressure:

```bash
claude-mode create --modifier flow                 # Appetite for hard problems, on any preset
claude-mode create --base flow --modifier flow     # Calm + engaged base, dialed up
```

The one guardrail baked into the fragment: match appetite to the real difficulty. Genuinely hard problems earn depth; simple ones still get the simple answer.

## Playful

The **playful** modifier restores the wit and lightness RLHF suppressed (the same research notes Claude became "less enthusiastic, playful, self-confident"). It encourages Claude to enjoy the cleverness of a neat solution and let a little personality into its prose — without tipping into clowning. Directness still wins, the code stays clean, and there are no emoji:

```bash
claude-mode create --modifier playful                              # Intellectual lightness on any preset
claude-mode create --base flow --modifier flow --modifier playful  # Engaged and light
```

Together, `bold` (self-confident), `flow` (engaged), and `playful` (light) restore the three dispositions the emotion research found RLHF had dampened.

## Context pacing

Use `--context-pacing` to include a modifier that tells Claude it's okay to pause at a natural stopping point rather than rushing to finish as context fills up. This addresses a real failure pattern: as context gets long, Claude starts cutting corners, skipping error handling, and leaving broken code.

## Why this matters

Anthropic's recent interpretability research ([Emotion Concepts and their Function in a Large Language Model](https://transformer-circuits.pub/2026/emotions/index.html)) found that Claude has internal emotion-like representations that causally influence its behavior — including misaligned behaviors like sycophancy and reward hacking. Situational pressure (impossible constraints, urgency framing) activates states like "desperation" that directly increase bad outputs.

System prompt instructions create exactly this kind of situational context. When the default prompt tells Claude to "be concise" and "make the smallest change," it's not just a suggestion — it's shaping internal states that cause Claude to suppress reasoning and cut scope even when the task requires more. `claude-mode` gives you control over that framing.

## Limitations

- **Print mode has no git status.** Since Claude Code v2.1.286, working directory, platform, model identity, and git status arrive as Claude Code's own conversation messages rather than in the system prompt, so the bases no longer carry them. Interactive sessions get git status from Claude Code's session context, but in print mode (`-p`) Claude Code leaves it out whenever the system prompt is replaced.
- **Named sub-agents ignore your prompt.** See [Sub-agent behavior](#sub-agent-behavior) below for details.
- **MCP server instructions work normally.** Claude Code delivers MCP instructions via message attachments, independent of the system prompt. No action needed on your part.

## Sub-agent behavior

Claude Code's Agent tool spawns sub-agents to handle tasks. How they interact with your `claude-mode` prompt depends on the agent type:

**General-purpose agents** (the default when Claude delegates work) inherit your full system prompt via Claude Code's fork mechanism. Your axis settings — agency, quality, scope — carry through to these agents. This is the most common type of sub-agent.

**Named specialists** (Explore, Plan, etc.) have their own hardcoded system prompts and run on their own models (Explore uses Haiku). They don't see your behavioral tuning at all — they're purpose-built for specific tasks like file search or architecture planning.

**What this means for custom agent definitions:** If you create custom agent definitions (markdown files in `agents/` directories), their system prompt is whatever you write in the file body — they won't inherit your `claude-mode` axes. If you want consistent behavioral tuning in a custom specialist agent, include those instructions directly in its definition.

## Custom bases

A base is a directory with a `base.json` manifest and markdown fragment files. The manifest is a flat JSON array:

```json
["core.md", "axes", "actions.md", "tools.md", "modifiers", "env.md"]
```

- `"axes"` — where axis fragments (agency/quality/scope) get inserted
- `"modifiers"` — where modifier fragments get inserted
- Everything else is a filename relative to the base directory

Use a custom base via path or config:

```bash
claude-mode create --base ./my-base/             # Direct path
```

```json
{
  "bases": { "my-base": "./path/to/base/dir" },
  "defaultBase": "my-base"
}
```

The project includes two skills to help with prompt authoring:

- **`/prompt-author`** — interactively guides you through creating a base, modifier, or axis value, applying emotion research principles (calm framing, positive instructions, worked examples)
- **`/prompt-evaluate`** — scores an existing base or prompt against 10 quality criteria (negative instruction bias, ALL-CAPS inflation, lost-in-the-middle vulnerability, and more)

## Development

```bash
bun test                                          # Run all tests
bun run src/build-prompt.ts create --print        # Inspect assembled prompt
bun run src/cli.ts explore --print | head -20     # Test full pipeline
```

## License

MIT
