export function printUsage(): void {
  const usage = `Usage: claude-mode [preset] [options] [-- claude-args...]

Subcommands:
  config            Manage configuration
  inspect [--print] Show prompt assembly plan with provenance and warnings
  update [version]  Update the installed binary from GitHub Releases

Update flags (passed after the "update" subcommand):
  --check           Check for updates without installing
  --force           Reinstall the same version (repair a corrupted install)
  --dry-run         Show what would happen without writing anything
  <version>         Install a specific release tag (e.g. "0.2.5"); default is latest

Info:
  --version         Print claude-mode version and exit
  --help, -h        Show this help

Presets:
  create          autonomous / architect / unrestricted
  extend          autonomous / pragmatic / adjacent
  safe            collaborative / minimal / narrow
  refactor        autonomous / pragmatic / unrestricted
  explore         collaborative / architect / narrow (readonly)
  none            no behavioral instructions
  debug           collaborative / pragmatic / narrow (chill base, investigation mode)
  methodical      surgical / architect / narrow (chill base, step-by-step)
  director        collaborative / architect / unrestricted (chill base, agent delegation)
  partner         partner / pragmatic / adjacent (chill base, speak-plain + tdd)
  muse            autonomous / architect / unrestricted (chill base, maximalist creative)
  flow            autonomous / architect / adjacent (flow base, deep focus — depth not sprawl)
  tinker          autonomous / pragmatic / unrestricted (flow base, loose playful prototyping)
  spark           autonomous / architect / unrestricted (chill base, maximalist creative + wit)

Base:
  --base <name|path>      Built-in: standard, chill, flow
  Base can also be a config-defined name or a directory path.

Axis overrides:
  --agency <value>        Built-in: autonomous, collaborative, surgical, partner
  --quality <value>       Built-in: architect, pragmatic, minimal
  --scope <value>         Built-in: unrestricted, adjacent, narrow
  Axis values can also be config-defined names or file paths (.md files).

Style:
  --style <value>         Writing style for output. Built-in: declaudified
  Style can also be a config-defined name or a file path (.md file).
  No style is applied unless set via --style, config defaultStyle, or a preset.

Modifiers:
  --readonly              Prevent file modifications
  --context-pacing        Include context pacing prompt
  --modifier <name|path>  Add a custom modifier (repeatable)
  --print                 Print assembled prompt instead of launching claude

Forwarded to claude:
  --append-system-prompt <text>
  --append-system-prompt-file <path>
  --model <alias|id>      Also sets the model info in the prompt's environment section.
  Without --model, model info comes from ANTHROPIC_MODEL or Claude settings files.

Config: .claude-mode.json (project) or ~/.config/claude-mode/config.json (global)

Everything after -- is passed to claude verbatim.

Examples:
  claude-mode create
  claude-mode create --base chill             # use the chill base
  claude-mode create --quality pragmatic
  claude-mode create --style declaudified      # lead-with-the-answer writing, no filler
  claude-mode create --modifier ./my-rules.md
  claude-mode --agency autonomous --quality ./team-quality.md
  claude-mode team-default                    # custom preset from config
  claude-mode explore --print
  claude-mode debug                           # investigation-first debugging
  claude-mode methodical                      # step-by-step precision
  claude-mode director                        # delegate to sub-agents
  claude-mode partner                         # equal-pair: speak plainly, TDD by default
  claude-mode create --modifier bold          # confident, idiomatic code
  claude-mode muse                            # maximalist creative — your best version of the work
  claude-mode create --modifier muse          # layer maximalist creative onto any preset
  claude-mode flow                            # deep focus — go deep where it counts, no sprawl
  claude-mode tinker                          # loose, playful prototyping / creative coding
  claude-mode spark                           # maximalist creative with wit and voice
  claude-mode create -- --verbose --model sonnet
  claude-mode update                          # update to the latest release
  claude-mode update --check                  # check for updates without installing
  claude-mode update 0.2.5                    # pin to a specific version (downgrade or reinstall)
  claude-mode update --force                  # reinstall the same version (repair)`;

  process.stdout.write(usage + "\n");
}
