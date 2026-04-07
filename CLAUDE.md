# claude-code-modes

CLI wrapper that launches Claude Code with behaviorally-tuned system prompts. See VISION.md, SPEC.md.

**Repo:** https://github.com/nklisch/claude-code-modes

## Commands

```bash
bun test                                    # run all tests
bun run src/build-prompt.ts --help          # test CLI directly
bun run src/build-prompt.ts create --print  # inspect assembled prompt
bun run src/build-prompt.ts config show     # view current config
bun run src/cli.ts create                   # full e2e (needs claude installed)
bun scripts/bump-version.ts patch           # bump version, commit, tag, push (triggers release CI)
```

## Project Structure

```
src/
  types.ts         # all enums, types, interfaces — single source of truth
  env.ts           # system environment detection (git, platform, shell)
  assemble.ts      # manifest-driven prompt fragment assembly pipeline
  presets.ts       # preset name → AxisConfig mapping
  args.ts          # CLI arg parsing → ParsedArgs
  resolve.ts       # ParsedArgs + config → ModeConfig (axis/modifier/base resolution)
  config.ts        # .claude-mode.json loading, validation, collision checks
  config-cli.ts    # `claude-mode config` subcommand (init, show, add/remove)
  inspect.ts       # `claude-mode inspect` subcommand (fragment provenance, warnings)
  cli.ts           # main entry point: spawns claude with assembled prompt
  build-prompt.ts  # alternative entry: outputs claude command string for scripting
  test-helpers.ts  # shared test utilities (createCliRunner, makeTempDir, PROJECT_ROOT)
prompts/
  base/            # standard base: base.json manifest + 8 fragments
  chill/           # chill base: base.json manifest + 4 fragments (emotion-research-informed)
  axis/            # 9 fragments: agency/{autonomous,collaborative,surgical}, quality/{architect,pragmatic,minimal}, scope/{unrestricted,adjacent,narrow}
  modifiers/       # readonly.md, context-pacing.md, debug.md, methodical.md
scripts/
  generate-prompts.ts         # embeds prompt fragments into src/embedded-prompts.ts
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
  "defaultBase": "chill",
  "defaultModifiers": ["team-rules"],
  "bases": { "custom-base": "./prompts/my-base" },
  "modifiers": { "team-rules": "./prompts/team-rules.md" },
  "axes": { "quality": { "team-standard": "./prompts/team-quality.md" } },
  "presets": {
    "team": {
      "base": "chill",
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
- Bases are manifest-driven: `base.json` declares fragment order with `"axes"` and `"modifiers"` as reserved insertion points
- Built-in bases: "standard" (upstream-derived), "chill" (emotion-research-informed, leaner)
- `--base` flag selects a base; resolution order: built-in → config → directory path
- Config: project-local wins entirely if present (no merging with global)
- Model name/ID hardcoded in `env.ts` — update on Claude Code releases
- `cli.ts` uses `Bun.spawn` with inherited stdio for direct TTY ownership; `build-prompt.ts` outputs command string for scripting

## Conventions

- No runtime dependencies beyond Bun built-ins
- Import paths use `.js` extension (Bun resolves to `.ts`)
- Private helpers are unexported functions before their caller — never export internal utilities
- All enumerated values use `as const` arrays with derived union types (see types.ts)
- Errors throw with full context; single try/catch at CLI boundary
- Tests use `bun:test`; subprocess tests use `createCliRunner` from test-helpers.ts
- Never add Co-Authored-By to commits
