# Base Format Specification

A base is a directory containing a `base.json` manifest and markdown fragment files.

## Manifest Format

`base.json` is a flat JSON array of strings:

```json
[
  "core.md",
  "axes",
  "actions.md",
  "tools.md",
  "modifiers",
  "env.md"
]
```

### Reserved words
- `"axes"` — where axis fragments (agency/quality/scope) are inserted
- `"modifiers"` — where modifier fragments are inserted

Both must appear exactly once. Everything else is a filename relative to the base directory.

### Assembly order
The assembler walks the array top to bottom:
1. Plain strings → reads the fragment file from the base directory
2. `"axes"` → inserts the resolved agency, quality, scope fragments (skipped for `none` mode)
3. `"modifiers"` → inserts all modifier fragment paths (built-in and custom) in order

### Fragment files
- Markdown files with `.md` extension
- Template variables (`{{CWD}}`, `{{PLATFORM}}`, etc.) are substituted at assembly time
- Only the `env.md` fragment typically uses template variables

## Available Template Variables

| Variable | Source |
|---|---|
| `{{CWD}}` | Current working directory |
| `{{IS_GIT}}` | "true" or "false" |
| `{{PLATFORM}}` | "linux", "darwin", etc. |
| `{{SHELL}}` | "bash", "zsh", etc. |
| `{{OS_VERSION}}` | Full OS version string |
| `{{MODEL_NAME}}` | e.g., "Claude Opus 4.6" |
| `{{MODEL_ID}}` | e.g., "claude-opus-4-6" |
| `{{KNOWLEDGE_CUTOFF}}` | e.g., "May 2025" |
| `{{GIT_STATUS}}` | Branch, status, recent commits |

## Built-in Bases

- **standard** (`prompts/base/`) — derived from upstream Claude Code, 8 fragments
- **chill** (`prompts/chill/`) — emotion-research-informed alternative, 4 fragments, ~65% the size

## Registering a Custom Base

In `.claude-mode.json`:
```json
{
  "bases": { "my-base": "./path/to/base/dir" },
  "defaultBase": "my-base"
}
```

Or via CLI: `claude-mode create --base ./path/to/base/dir`
