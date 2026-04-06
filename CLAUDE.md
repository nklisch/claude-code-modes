# claude-code-modes

CLI wrapper that launches Claude Code with behaviorally-tuned system prompts. See VISION.md, SPEC.md.

**Repo:** https://github.com/nklisch/claude-code-modes

## Commands

```bash
bun test                                    # run all tests
bun run src/build-prompt.ts --help          # test CLI directly
bun run src/build-prompt.ts create --print  # inspect assembled prompt
bun run src/build-prompt.ts config show     # view current config
./claude-mode create                        # full e2e (needs claude installed)
```

## Project Structure

```
src/
  types.ts         # all enums, types, interfaces — single source of truth
  env.ts           # system environment detection (git, platform, shell)
  assemble.ts      # prompt fragment assembly pipeline
  presets.ts       # preset name → AxisConfig mapping
  args.ts          # CLI arg parsing → ParsedArgs
  resolve.ts       # ParsedArgs + config → ModeConfig (axis/modifier resolution)
  config.ts        # .claude-mode.json loading, validation, collision checks
  config-cli.ts    # `claude-mode config` subcommand (init, show, add/remove)
  build-prompt.ts  # main binary: orchestrates pipeline, outputs claude command
  test-helpers.ts  # shared test utilities (createCliRunner, makeTempDir, PROJECT_ROOT)
prompts/
  base/            # 9 fragments: intro, system, doing-tasks, actions-*, tools, tone, session-guidance, env
  axis/            # 9 fragments: agency/{autonomous,collaborative,surgical}, quality/{architect,pragmatic,minimal}, scope/{unrestricted,adjacent,narrow}
  modifiers/       # context-pacing.md, readonly.md
scripts/
  extract-upstream-prompt.ts  # downloads CC npm package, extracts system prompt functions
upstream-prompts/             # (gitignored) extracted upstream prompts for diffing
```

## Pipeline

```
Parse (args.ts) → Load config (config.ts) → Resolve (resolve.ts) → Detect env (env.ts) → Assemble (assemble.ts)
```

- **Parse**: extracts raw strings from argv — no validation, no I/O
- **Load config**: reads `.claude-mode.json` from CWD or `~/.config/claude-mode/config.json`
- **Resolve**: validates axis values, resolves custom names against config, merges presets + overrides
- **Detect env**: shell commands for git, platform, shell
- **Assemble**: reads fragments, substitutes template vars, writes temp file

## Config File

`.claude-mode.json` in project root (or `~/.config/claude-mode/config.json` globally):

```json
{
  "defaultModifiers": ["team-rules"],
  "modifiers": { "team-rules": "./prompts/team-rules.md" },
  "axes": { "quality": { "team-standard": "./prompts/team-quality.md" } },
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

Managed via `claude-mode config` subcommand (init, show, add/remove for defaults, modifiers, axes, presets).

## Upstream Tracking

**Validated against:** Claude Code v2.1.92

Run `bun run scripts/extract-upstream-prompt.ts [version]` to extract upstream prompts for diffing.

## Key Decisions

- `--system-prompt-file` replaces Claude Code's full system prompt — axis fragments layer on top of base
- `explore` preset defaults to `readonly: true`
- `none` mode strips all behavioral instructions, leaving only infrastructure
- Axis values accept built-in names, config-defined names, or file paths — resolution order: built-in → config → path
- Custom agency file path defaults to cautious actions variant
- Config: project-local wins entirely if present (no merging with global)
- Model name/ID hardcoded in `env.ts` — update on Claude Code releases
- bash `exec $CMD` gives claude direct TTY ownership; TTY check enables both interactive and test use

## Conventions

- No runtime dependencies beyond Bun built-ins
- Import paths use `.js` extension (Bun resolves to `.ts`)
- Private helpers are unexported functions before their caller — never export internal utilities
- All enumerated values use `as const` arrays with derived union types (see types.ts)
- Errors throw with full context; single try/catch at CLI boundary
- Tests use `bun:test`; subprocess tests use `createCliRunner` from test-helpers.ts
- Never add Co-Authored-By to commits
