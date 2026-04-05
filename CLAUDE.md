# claude-code-modes

CLI wrapper that launches Claude Code with behaviorally-tuned system prompts. See VISION.md, SPEC.md.

**Repo:** https://github.com/nklisch/claude-code-modes

## Commands

```bash
bun test                                    # run all tests
bun run src/build-prompt.ts --help          # test CLI directly
bun run src/build-prompt.ts create --print  # inspect assembled prompt
./claude-mode create                   # full e2e (needs claude installed)
```

## Project Structure

```
src/
  types.ts         # all enums, types, interfaces — single source of truth
  env.ts           # system environment detection (git, platform, shell)
  assemble.ts      # prompt fragment assembly pipeline
  presets.ts       # preset name → AxisConfig mapping
  args.ts          # CLI arg parsing → ParsedArgs
  resolve.ts       # ParsedArgs → ModeConfig (pure, no I/O)
  build-prompt.ts  # main binary: orchestrates pipeline, outputs claude command
  test-helpers.ts  # shared test utilities (createCliRunner, PROJECT_ROOT)
prompts/
  base/            # 9 fragments: intro, system, doing-tasks, actions-*, tools, tone, session-guidance, env
  axis/            # 9 fragments: agency/{autonomous,collaborative,surgical}, quality/{architect,pragmatic,minimal}, scope/{unrestricted,adjacent,narrow}
  modifiers/       # context-pacing.md (all modes), readonly.md
```

## Key Decisions

- `--system-prompt-file` replaces Claude Code's full system prompt — axis fragments layer on top of base
- `explore` preset defaults to `readonly: true`
- `none` mode strips all behavioral instructions, leaving only infrastructure
- Model name/ID hardcoded in `env.ts:63-66` — update on Claude Code releases
- bash `exec $CMD` gives claude direct TTY ownership; TTY check enables both interactive and test use

## Conventions

- No runtime dependencies beyond Bun built-ins
- Import paths use `.js` extension (Bun resolves to `.ts`)
- Private helpers are unexported functions before their caller — never export internal utilities
- All enumerated values use `as const` arrays with derived union types (see types.ts)
- Errors throw with full context; single try/catch at CLI boundary
- Tests use `bun:test`; subprocess tests use `createCliRunner` from test-helpers.ts
- Never add Co-Authored-By to commits
