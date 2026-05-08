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
claude-mode partner
claude-mode none
```

### Axis Overrides

Override any axis from a preset's defaults:

```
claude-mode create --agency collaborative
claude-mode safe --quality pragmatic --scope adjacent
```

Flags:
- `--agency <autonomous|collaborative|surgical|partner>`
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
- `--modifier <name|path>` — Appends a modifier fragment. Repeatable. Accepts built-in names (`readonly`, `context-pacing`, `debug`, `methodical`, `director`, `bold`, `speak-plain`, `tdd`), config-defined names, or file paths.

Built-in modifiers: `readonly`, `context-pacing`, `debug`, `methodical`, `director`, `bold`, `speak-plain`, `tdd`. The `debug`, `methodical`, `director`, and `partner` presets include their respective modifiers automatically.
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

### Version Flag

- `--version` — Prints `claude-mode <version>` and exits 0. When the binary was compiled from a git checkout (forks, dev builds), additional provenance lines follow: `repo`, `branch`, `commit` (with a `(dirty)` suffix if the worktree was modified). Release builds print only the single version line.

Standalone-only: combining `--version` with any other argument exits with a non-zero status. To forward `--version` to `claude` itself, use the `--` escape hatch:

```
claude-mode -- --version
```

Implemented in `src/version.ts` (formatting) and `scripts/generate-build-info.ts` (build-time provenance capture into `src/build-info.ts`).

### Update Subcommand

Updates the installed binary in place from GitHub Releases. Implemented in `src/update.ts`; routed from `src/cli.ts`.

```
claude-mode update [version] [flags]
```

**Positional:**
- `[version]` — target release tag, e.g. `0.2.5` or `v0.2.5`; omit for latest

**Flags:**
- `--check` — check for updates without installing (prints status, exits 0)
- `--force` — reinstall the same version (repair a corrupt binary)
- `--dry-run` — show what would happen without writing anything

**Mechanism:** fetches release metadata from `https://api.github.com/repos/nklisch/claude-code-modes/releases/...`, downloads the platform binary (`claude-mode-{linux,darwin}-{x64,arm64}`) and `checksums.txt`, verifies SHA-256, then atomically replaces `process.execPath` (write to `${path}.new`, chmod 0755, drop macOS quarantine xattr, rename).

**Refusal cases** (with guidance printed to stderr):
- Running via bun runtime (source mode) → `"use git pull && bun install"`
- `BUILD_INFO.dirty === true` → `"commit or revert local changes"`
- `BUILD_INFO.repo` set and ≠ `https://github.com/nklisch/claude-code-modes.git` → `"update via your fork's release process"`

Upstream repo constant: `https://github.com/nklisch/claude-code-modes`

### Auto Update-Check

When `claude-mode` launches `claude` (any preset or axis-driven invocation), it also performs a background check against GitHub Releases. If a newer release is available, a one-line nag is printed to stderr and the launcher pauses for 1.5 s before spawning `claude`:

```
claude-mode update available: 0.2.10 -> 0.2.11. Run `claude-mode update` to install.
```

Behavior:
- The check honors a 24-hour cache at `$XDG_CACHE_HOME/claude-mode/version-check.json` (or `~/.cache/claude-mode/version-check.json`).
- The check is skipped on the `update` subcommand, on `--version`, and when stderr is not a TTY.
- Set `CLAUDE_MODE_NO_UPDATE_CHECK=1` (or `=true`) to disable the check entirely.
- When the cache is stale or missing and a network call is needed, a one-line `Checking for newer versions of claude-mode...` notice is printed to stderr so a slow GitHub request doesn't read as a hang. The fresh-cache path is silent.
- Network failures are swallowed silently; the launcher always proceeds to spawn `claude`.

Implemented in `src/version-check.ts`; wired into `src/cli.ts`.

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
- `axis/agency/partner.md` tells Claude to commit decisively on execution choices while deferring to the user on direction

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
│   ├── update.ts                  # `claude-mode update` subcommand
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
│   │   │   ├── surgical.md
│   │   │   └── partner.md
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
│       ├── director.md
│       ├── bold.md
│       ├── speak-plain.md
│       └── tdd.md
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
