# Spec

## Architecture

Two-layer design to preserve Claude Code's TUI:

```
claude-mode (bash)
  └─ bun run build-prompt.ts "$@"   → outputs full claude command
  └─ exec <command>                  → replaces process, claude owns TTY
```

The bash entry point never interacts with the terminal beyond launching. The TypeScript binary does all argument parsing, prompt assembly, and env detection, then prints a complete `claude` invocation to stdout. The bash script `exec`s it.

## CLI Interface

```
claude-mode <preset|none> [axis-overrides] [modifiers] [-- claude-flags]
```

### Presets

```
claude-mode create
claude-mode extend
claude-mode safe
claude-mode refactor
claude-mode explore
claude-mode debug
claude-mode methodical
claude-mode director
claude-mode none
```

### Axis Overrides

Override any axis from a preset's defaults:

```
claude-mode create --agency collaborative
claude-mode safe --quality pragmatic --scope adjacent
```

Flags:
- `--agency <autonomous|collaborative|surgical>`
- `--quality <architect|pragmatic|minimal>`
- `--scope <unrestricted|adjacent|narrow>`

Standalone axis composition (no preset base):

```
claude-mode --agency autonomous --quality architect --scope unrestricted
```

When no preset and not all three axes specified, defaults are: `agency=collaborative`, `quality=pragmatic`, `scope=adjacent`.

### Base Selection

- `--base <name|path>` — Selects the base prompt. Built-in: `standard` (default), `chill`. Also accepts config-defined names or directory paths containing a `base.json` manifest.

Resolution order: built-in → config → directory path heuristic. Priority chain: CLI `--base` > config `defaultBase` > preset `base` > `"standard"`.

### Modifiers

All modifiers are fragment-based — they resolve to markdown files that get inserted at the manifest's `"modifiers"` marker.

- `--readonly` — Shorthand for `--modifier readonly`. Appends readonly instructions.
- `--context-pacing` — Shorthand for `--modifier context-pacing`. Appends context pacing instructions.
- `--modifier <name|path>` — Appends a modifier fragment. Repeatable. Accepts built-in names (`readonly`, `context-pacing`, `debug`, `methodical`, `director`), config-defined names, or file paths.

Built-in modifiers: `readonly`, `context-pacing`, `debug`, `methodical`, `director`. The `debug`, `methodical`, and `director` presets include their respective modifiers automatically.
- `--append-system-prompt <text>` — Forwarded directly to `claude`.
- `--append-system-prompt-file <path>` — Forwarded directly to `claude`.

### Custom Axis Values

Axis flags (`--agency`, `--quality`, `--scope`) accept:
1. Built-in names (e.g., `autonomous`, `architect`, `narrow`)
2. Config-defined names (resolved from `.claude-mode.json`)
3. File paths (e.g., `./team-quality.md`, `/path/to/custom.md`)

Resolution order: built-in → config → file path heuristic. A value is treated as a file path if it contains `/`, `\`, or ends with `.md`.

### Config File

Loaded from `.claude-mode.json` in CWD, falling back to `~/.config/claude-mode/config.json`. Project-local wins entirely if present (no merging).

```json
{
  "defaultBase": "<name>",
  "defaultModifiers": ["<name>"],
  "bases": { "<name>": "<directory-path>" },
  "modifiers": { "<name>": "<path>" },
  "axes": {
    "agency": { "<name>": "<path>" },
    "quality": { "<name>": "<path>" },
    "scope": { "<name>": "<path>" }
  },
  "presets": {
    "<name>": {
      "base": "<name>",
      "agency": "<value>",
      "quality": "<value>",
      "scope": "<value>",
      "modifiers": ["<name>"],
      "readonly": true,
      "contextPacing": true
    }
  }
}
```

Custom preset names must not collide with built-in presets. Custom modifier names must not collide with `readonly` or `context-pacing`. Config paths are relative to the config file's directory.

### Config Management CLI

```
claude-mode config <subcommand> [args] [--global]
```

Subcommands: `show`, `init`, `add-default`, `remove-default`, `add-modifier`, `remove-modifier`, `add-axis`, `remove-axis`, `add-preset`, `remove-preset`. Defaults to project-local config; `--global` targets `~/.config/claude-mode/config.json`.

### Claude Passthrough

Everything after `--` is forwarded to `claude` verbatim:

```
claude-mode create -- --verbose --model sonnet
```

Flags not recognized by `claude-mode` are also forwarded:

```
claude-mode create --verbose --model sonnet
```

`--system-prompt` and `--system-prompt-file` are intercepted and rejected with an error — they conflict with claude-mode's purpose.

## Prompt Assembly

### Manifest-Driven Fragment Order

Each base has a `base.json` manifest — a flat JSON array of strings. Two reserved words control insertion:
- `"axes"` — where axis fragments (agency/quality/scope) are inserted (skipped for `none` mode)
- `"modifiers"` — where modifier fragments are inserted (context-pacing, readonly, custom)

**Standard base manifest** (`prompts/base/base.json`):
```json
["intro.md", "system.md", "axes", "doing-tasks.md", "actions.md", "tools.md", "tone.md", "session-guidance.md", "modifiers", "env.md"]
```

**Chill base manifest** (`prompts/chill/base.json`):
```json
["core.md", "axes", "actions.md", "tools.md", "modifiers", "env.md"]
```

Fragment filenames are relative to the base directory. The assembler walks the manifest top to bottom, expanding `"axes"` and `"modifiers"` entries into the appropriate fragments based on the resolved mode config.

### Template Variables

`base/env.md` contains template variables replaced at runtime:

| Variable | Source |
|---|---|
| `{{CWD}}` | `pwd` |
| `{{IS_GIT}}` | `git rev-parse --is-inside-work-tree` |
| `{{PLATFORM}}` | `uname -s`, lowercased |
| `{{SHELL}}` | `basename $SHELL` |
| `{{OS_VERSION}}` | `uname -sr` |
| `{{MODEL_NAME}}` | Hardcoded, updated on Claude Code releases |
| `{{MODEL_ID}}` | Hardcoded, updated on Claude Code releases |
| `{{KNOWLEDGE_CUTOFF}}` | Hardcoded lookup by model |
| `{{GIT_STATUS}}` | `git status --short` + `git log --oneline -5` (if git repo) |

### The `none` Mode

Assembles only: intro, system, doing-tasks, actions, tools, tone, context-pacing, env. No axis fragments. No output efficiency section. Behavioral vacuum for user-provided instructions to fill.

### Actions and Agency

Each base has a single `actions.md` that lists what constitutes risky actions (destructive, hard-to-reverse, externally visible). The behavioral difference — whether to act freely or check with the user — is handled by the agency axis fragments:
- `axis/agency/autonomous.md` tells Claude to act freely on local, reversible actions
- `axis/agency/collaborative.md` tells Claude to check in at decision points
- `axis/agency/surgical.md` tells Claude to execute exactly what was asked

## Environment Detection

TypeScript calls shell commands via `Bun.spawn` or `execSync`:

```typescript
const cwd = process.cwd()
const isGit = execSync('git rev-parse --is-inside-work-tree 2>/dev/null').toString().trim() === 'true'
const platform = execSync('uname -s').toString().trim().toLowerCase()
const shell = path.basename(process.env.SHELL || 'bash')
const osVersion = execSync('uname -sr').toString().trim()
```

Git status snapshot (if git repo):
```typescript
const gitBranch = execSync('git branch --show-current').toString().trim()
const gitStatus = execSync('git status --short').toString().trim()
const gitLog = execSync('git log --oneline -5').toString().trim()
```

## File Structure

```
claude-code-modes/
├── claude-mode                    # bash entry point (~5 lines)
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts                     # main entry: spawns claude with assembled prompt
│   ├── build-prompt.ts            # alternative entry: outputs claude command string
│   ├── args.ts                    # CLI arg parsing → ParsedArgs
│   ├── resolve.ts                 # ParsedArgs + config → ModeConfig (axis/modifier/base)
│   ├── config.ts                  # config file loading, validation, collision checks
│   ├── config-cli.ts              # `claude-mode config` subcommand
│   ├── inspect.ts                 # `claude-mode inspect` subcommand
│   ├── env.ts                     # shell commands for env detection
│   ├── presets.ts                 # preset → axis mapping
│   ├── assemble.ts                # manifest-driven fragment assembly
│   ├── embedded-prompts.ts        # auto-generated: built-in fragments as strings
│   └── types.ts                   # enums, types, interfaces
├── prompts/
│   ├── base/                      # standard base
│   │   ├── base.json              # manifest
│   │   ├── intro.md
│   │   ├── system.md
│   │   ├── doing-tasks.md
│   │   ├── actions.md             # neutral risky-actions guidance
│   │   ├── tools.md
│   │   ├── tone.md
│   │   ├── session-guidance.md
│   │   └── env.md                 # template with {{VAR}} placeholders
│   ├── chill/                     # chill base (emotion-research-informed)
│   │   ├── base.json              # manifest
│   │   ├── core.md                # consolidated intro+system+tasks+tone+session
│   │   ├── actions.md
│   │   ├── tools.md
│   │   └── env.md
│   ├── axis/
│   │   ├── agency/
│   │   │   ├── autonomous.md
│   │   │   ├── collaborative.md
│   │   │   └── surgical.md
│   │   ├── quality/
│   │   │   ├── architect.md
│   │   │   ├── pragmatic.md
│   │   │   └── minimal.md
│   │   └── scope/
│   │       ├── unrestricted.md
│   │       ├── adjacent.md
│   │       └── narrow.md
│   └── modifiers/
│       ├── context-pacing.md
│       ├── readonly.md
│       ├── debug.md
│       ├── methodical.md
│       └── director.md
├── VISION.md
├── SPEC.md
└── PROMPT-AUDIT.md
```

## Temp File Management

The assembled prompt is written to a temp file in `$TMPDIR` or `/tmp`:

```
/tmp/claude-mode-<pid>.md
```

Cleanup: the bash script traps EXIT to remove the file after claude exits. If claude is killed, the file remains for debugging — `/tmp` cleanup handles it eventually.

## Dependencies

- **Bun** — runtime for TypeScript binary
- **No npm dependencies** — use `node:util/parseArgs` for arg parsing, `node:child_process` for env detection, `node:fs` for file I/O
