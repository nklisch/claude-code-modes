# claude-code-modes

CLI launcher for Claude Code with behaviorally-tuned system prompts. See VISION.md, SPEC.md.

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
  update.ts        # `claude-mode update` subcommand (self-update from GitHub Releases)
  version-check.ts # auto update-check fired on cli.ts entry
  cli.ts           # main entry point: spawns claude with assembled prompt
  build-prompt.ts  # alternative entry: outputs claude command string for scripting
  test-helpers.ts  # shared test utilities (createCliRunner, makeTempDir, PROJECT_ROOT)
prompts/
  base/            # standard base: base.json manifest + 10 fragments
  chill/           # chill base: base.json manifest + 6 fragments (emotion-research-informed)
  flow/            # flow base: base.json manifest + 6 fragments (chill's calm + restored engagement)
  lean/            # lean base: base.json manifest + 6 fragments (upstream's lean assembly)
  axis/            # 10 fragments: agency/{autonomous,collaborative,surgical,partner}, quality/{architect,pragmatic,minimal}, scope/{unrestricted,adjacent,narrow}
  modifiers/       # readonly.md, context-pacing.md, debug.md, methodical.md, director.md, bold.md, speak-plain.md, tdd.md, muse.md, flow.md, playful.md, delivering-work.md, corrections.md, tool-restraint.md
scripts/
  generate-prompts.ts         # embeds prompt fragments into src/embedded-prompts.ts
  extract-upstream-prompt.ts  # downloads CC npm package, extracts system prompt functions
upstream-prompts/             # (gitignored) extracted upstream prompts for diffing
```

## Pipeline

```
Parse (args.ts) → Load config (config.ts) → Resolve model (env.ts) → Resolve (resolve.ts) → Detect env (env.ts) → Assemble (assemble.ts)
```

- **Parse**: extracts raw strings from argv — no validation, no I/O
- **Load config**: reads `.claude-mode.json` from CWD or `~/.config/claude-mode/config.json`
- **Resolve model**: `resolveSessionModel` applies Claude Code's own precedence (`--model` → `ANTHROPIC_MODEL` → settings files); runs before Resolve because `--base auto` keys off the result
- **Resolve**: validates axis values, resolves custom names against config, merges presets + overrides, selects the base
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

**Validated against:** Claude Code v2.1.220

Run `bun run scripts/extract-upstream-prompt.ts [version]` to extract upstream prompts for diffing.

## Key Decisions

- `--system-prompt-file` replaces Claude Code's full system prompt — axis fragments layer on top of base
- `explore` preset defaults to `readonly: true`
- `none` mode strips all behavioral instructions, leaving only infrastructure
- Axis values accept built-in names, config-defined names, or file paths — resolution order: built-in → config → path
- Bases are manifest-driven: `base.json` declares fragment order with `"axes"` and `"modifiers"` as reserved insertion points
- Built-in bases: "standard" (upstream-derived), "chill" (emotion-research-informed, leaner), "flow" (chill's calm floor + restored engagement/appetite), "lean" (upstream's lean assembly)
- `--base` flag selects a base; resolution order: `auto` → built-in → config → directory path
- `auto` is the default: it picks the base Claude Code itself would assemble for the session model — "lean" when the model carries the `lean-prompt` capability (Opus 5, Opus 4.8, Fable 5, Mythos 5), "standard" otherwise. Models with `prompt-bundle` (Opus 5) additionally get the delivering-work, corrections, and tool-restraint modifiers. An explicit `--base` opts out of both, since the user has chosen the shape themselves
- Model prompt capabilities live in `MODEL_TABLE` in `env.ts`, mirroring the binary's `lean_prompt` / `opus_5_prompt_bundle`
- Upstream's shared tail (pronouns, context-management, act-don't-re-derive) is emitted for every model regardless of prompt shape, so all four bases carry it — standard/lean verbatim, chill/flow reworked into their own voice
- Config: project-local wins entirely if present (no merging with global)
- Model metadata resolved dynamically in `env.ts`: `--model` flag (or after-`--` peek) → `ANTHROPIC_MODEL` → Claude settings files, against a model table extracted from the Claude Code binary (fallback: newest model) — update the table on Claude Code releases
- `cli.ts` uses `Bun.spawn` with inherited stdio for direct TTY ownership; `build-prompt.ts` outputs command string for scripting

## Conventions

- No runtime dependencies beyond Bun built-ins
- Import paths use `.js` extension (Bun resolves to `.ts`)
- Private helpers are unexported functions before their caller — never export internal utilities
- All enumerated values use `as const` arrays with derived union types (see types.ts)
- Errors throw with full context; single try/catch at CLI boundary
- Tests use `bun:test`; subprocess tests use `createCliRunner` from test-helpers.ts
- Never add Co-Authored-By to commits
