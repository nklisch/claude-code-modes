# Changelog

## v0.1.3

**Fixes**

- Release workflow: remove broken npm self-upgrade step that prevented npm publish

## v0.1.2

**Fixes**

- npm OIDC publish: add explicit `id-token: write` permission to publish job and upgrade npm before publishing

**Chill base**

- Context pacing baked in by default — no `--context-pacing` flag needed when using `--base chill`
- Added warm, grounding tone: opening affirmation, failures reframed as information, pacing section says "you have time to do this well"
- Actions section opens with permission to act freely, reserves caution for genuinely risky operations

## v0.1.1

**Fixes**

- CI: generate embedded prompts before typecheck step (fixes build failure on fresh checkout)

## v0.1.0

**Features**

- Pluggable base prompt system — `--base <name|path>` flag selects the foundational prompt layer. Built-in bases: `standard` (upstream-derived) and `chill` (emotion-research-informed, ~65% the size, calm framing, worked examples, priority hierarchy)
- Manifest-driven base assembly — bases declare fragment order via `base.json` flat JSON arrays with `"axes"` and `"modifiers"` as reserved insertion points
- `--base` config support — `defaultBase` and `bases` fields in `.claude-mode.json`; preset definitions can specify a default base
- Inspect subcommand — `claude-mode inspect [--print]` shows fragment assembly plan with provenance classification and security warnings
- Config management CLI — `claude-mode config init/show/add-*/remove-*` for managing `.claude-mode.json` without manual JSON editing
- Custom prompt extensibility — custom modifiers, axis values, and presets via config file
- Single binary distribution — compiled Bun binary via `install.sh` with SHA-256 checksum verification
- `cli.ts` entry point — spawns claude directly with inherited stdio; `build-prompt.ts` outputs command string for scripting

**Internal**

- Typed predicates (`isBuiltinBase`, `isBuiltinModifier`, `isPresetName`, `isBuiltinAxisValue`) replacing repeated `as readonly string[]` casts
- Shared `printUsage()` extracted to `usage.ts`
- Config validation helpers (`validateStringRecord`, `validateStringArray`)
- `src/embedded-prompts.ts` gitignored (generated at build/publish time)
- CI: type checking step (`bunx tsc --noEmit`) added before tests
