# claude-code-modes

Take control of how Claude Code behaves. The default system prompt is a one-size-fits-all compromise — it makes Claude cautious, minimal, and terse in situations where you actually want it to be bold, thorough, and opinionated. This tool fixes that.

`claude-mode` is a CLI wrapper that launches Claude Code with a replacement system prompt. It keeps everything Claude Code needs to function (tool instructions, security, environment detection) and swaps out the behavioral layer — the part that controls how much initiative Claude takes, what code quality standard it targets, and how far beyond your request it's willing to go.

## Install

```bash
git clone https://github.com/nklisch/claude-code-modes.git
cd claude-code-modes
bun install
bun link        # adds `claude-mode` to your PATH
```

Requires [Bun](https://bun.sh/) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude` on your PATH).

> **Alternative:** symlink manually if `bun link` doesn't work for your setup:
> ```bash
> ln -s "$(pwd)/claude-mode" ~/.local/bin/claude-mode
> ```

## Usage

Pick a preset that matches your task:

```bash
claude-mode create      # Build from scratch with proper architecture
claude-mode extend      # Extend a fast-built project, improve incrementally
claude-mode safe       # Surgical precision, minimal risk
claude-mode refactor         # Restructure freely across the codebase
claude-mode explore          # Read-only — understand code without changing it
claude-mode none             # Strip all behavioral opinions, use your own CLAUDE.md
```

| Preset | Agency | Quality | Scope | Use when... |
|---|---|---|---|---|
| `create` | autonomous | architect | unrestricted | Building from scratch — proper structure and abstractions |
| `extend` | autonomous | pragmatic | adjacent | Extending agent-coded projects — improve quality as you go |
| `safe` | collaborative | minimal | narrow | Surgical changes to production code |
| `refactor` | autonomous | pragmatic | unrestricted | Move files, consolidate modules, improve patterns |
| `explore` | collaborative | architect | narrow | Read, explain, suggest — no file modifications |
| `none` | — | — | — | Strip all behavioral instructions, use your own |

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
  base/         Infrastructure prompts (tools, security, env detection)
  axis/         Behavioral prompts organized by three axes
  modifiers/    Optional additions (readonly, context pacing)
```

The base infrastructure prompts (`prompts/base/`) are pulled directly from Claude Code's source — tool names, security instructions, environment detection, and session guidance all match the real system prompt. Only the behavioral instructions are replaced with the axis fragments.

The behavioral layer is composed from three independent axes — **agency** (how much initiative), **quality** (what code standard), and **scope** (how far beyond the request). Presets are just named combinations of these three values.

When you run `claude-mode create`, the tool:
1. Resolves the preset to axis values (autonomous / architect / unrestricted)
2. Reads the base infrastructure fragments + the matching axis fragments
3. Detects your environment (git status, platform, shell)
4. Writes the assembled prompt to a temp file
5. Execs `claude --system-prompt-file /tmp/claude-mode-xxx.md` with your TTY

The bash script `exec`s the final command so Claude Code gets direct TTY ownership — no wrapper process sitting in between.

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

Add modifiers:

```bash
claude-mode create --readonly              # Prevent file modifications
claude-mode create --context-pacing        # Include context pacing prompt
claude-mode create --append-system-prompt "Use Rust, not TypeScript"
```

Pass flags through to Claude Code:

```bash
claude-mode create -- --verbose --model sonnet
```

Debug the assembled prompt:

```bash
claude-mode explore --print
```

## The axis model

**Agency** — How much initiative should Claude take?
- **autonomous** — Makes decisions, creates files, restructures without asking
- **collaborative** — Explains reasoning, checks in at decision points
- **surgical** — Executes exactly what was asked, nothing more

**Quality** — What code standard should it target?
- **architect** — Proper abstractions, error handling, forward-thinking structure
- **pragmatic** — Match existing patterns, improve incrementally
- **minimal** — Smallest correct change, no speculative improvements

**Scope** — How far beyond the request can it go?
- **unrestricted** — Free to create, reorganize, restructure
- **adjacent** — Fix related issues in the neighborhood
- **narrow** — Only what was explicitly asked

## Context pacing

Use `--context-pacing` to include a modifier that tells Claude it's okay to pause at a natural stopping point rather than rushing to finish as context fills up. This addresses a real failure pattern: as context gets long, Claude starts cutting corners, skipping error handling, and leaving broken code.

## Why this matters

Anthropic's recent interpretability research ([Emotion Concepts and their Function in a Large Language Model](https://transformer-circuits.pub/2026/emotions/index.html)) found that Claude has internal emotion-like representations that causally influence its behavior — including misaligned behaviors like sycophancy and reward hacking. Situational pressure (impossible constraints, urgency framing) activates states like "desperation" that directly increase bad outputs.

System prompt instructions create exactly this kind of situational context. When the default prompt tells Claude to "be concise" and "make the smallest change," it's not just a suggestion — it's shaping internal states that cause Claude to suppress reasoning and cut scope even when the task requires more. `claude-mode` gives you control over that framing.

## Development

```bash
bun test                                          # Run all tests
bun run src/build-prompt.ts create --print   # Inspect assembled prompt
./claude-mode explore --print | head -20          # Test full e2e pipeline
```

## License

MIT
