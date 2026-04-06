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

### Modifiers

- `--readonly` — Appends readonly instructions. Intended for explore-style sessions.
- `--context-pacing` — Appends context pacing instructions (opt-in).
- `--modifier <name|path>` — Appends a custom modifier fragment. Repeatable. Accepts file paths or config-defined names.
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
  "defaultModifiers": ["<name>"],
  "modifiers": { "<name>": "<path>" },
  "axes": {
    "agency": { "<name>": "<path>" },
    "quality": { "<name>": "<path>" },
    "scope": { "<name>": "<path>" }
  },
  "presets": {
    "<name>": {
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

### Fragment Order

1. `base/intro.md` — Identity, cyber risk instruction
2. `base/system.md` — Tool permissions, hooks, tags, context compression
3. `axis/agency/<value>.md` — Agency posture (skipped for `none`)
4. `axis/quality/<value>.md` — Quality standard (skipped for `none`)
5. `axis/scope/<value>.md` — Scope boundaries (skipped for `none`)
6. `base/doing-tasks.md` — Universal task instructions (read before edit, security, diagnostics)
7. `base/actions.md` — Risky action guidance (full for surgical/collaborative, relaxed for autonomous)
8. `base/tools.md` — Tool usage preferences
9. `base/tone.md` — Style guidelines
10. `modifiers/context-pacing.md` — Only if `--context-pacing` flag
11. `modifiers/readonly.md` — Only if `--readonly` flag
12. Custom modifier fragments — `defaultModifiers` + preset modifiers + `--modifier` flags, in order
13. `base/env.md` — Dynamically rendered environment info (always last)

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

### The `actions.md` Variance

The risky-actions section (`base/actions.md`) is the one base section that varies by mode. For autonomous agency, the section is softened — Claude is told it can freely create files, branches, and make structural changes without confirmation for local-only operations. For collaborative and surgical, the full cautious version is used. This is handled by having two variants: `actions-autonomous.md` and `actions-cautious.md`, selected by the agency axis value.

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
│   ├── build-prompt.ts            # main: parse args, compose, print command
│   ├── args.ts                    # CLI arg parsing → ParsedArgs
│   ├── resolve.ts                 # ParsedArgs + config → ModeConfig
│   ├── config.ts                  # config file loading, validation, collision checks
│   ├── config-cli.ts              # `claude-mode config` subcommand
│   ├── env.ts                     # shell commands for env detection
│   ├── presets.ts                 # preset → axis mapping
│   ├── assemble.ts                # reads fragments, substitutes templates, concatenates
│   └── types.ts                   # enums, types, interfaces
├── prompts/
│   ├── base/
│   │   ├── intro.md
│   │   ├── system.md
│   │   ├── doing-tasks.md         # universal task instructions (no behavioral opinions)
│   │   ├── actions-autonomous.md  # relaxed risky-action guidance
│   │   ├── actions-cautious.md    # full risky-action guidance
│   │   ├── tools.md
│   │   ├── tone.md
│   │   └── env.md                 # template with {{VAR}} placeholders
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
│       └── readonly.md
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
