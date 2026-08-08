# Vision

Claude Code ships with a single system prompt designed to be safe and useful across all contexts. This is the right default — but it's a compromise. Instructions that make Claude careful and minimal during a surgical bug fix actively prevent it from building proper abstractions in a new project. Instructions that suppress verbose output hurt exploration sessions where you want Claude to explain its reasoning.

`claude-mode` solves this by replacing the behavioral layer of Claude Code's system prompt while preserving everything else — tool instructions, security guidelines, environment info, hooks handling — intact. It's a thin launcher, not a fork.

## The Axis Model

Instead of a handful of hardcoded personas, `claude-mode` composes behavior from three independent axes:

**Agency** — How much initiative should Claude take?
- **Autonomous**: Creates files, restructures code, makes architectural decisions without asking. Suited for building and refactoring.
- **Collaborative**: Explains reasoning, checks in at decision points, confirms before large changes. Suited for unfamiliar codebases and working with less experienced developers.
- **Surgical**: Executes the specific request with minimal blast radius. Does not touch adjacent code.

**Quality** — What standard should the code meet?
- **Architect**: Proper abstractions, error handling at boundaries, forward-thinking structure. Code should be maintainable long-term.
- **Pragmatic**: Match the existing codebase's patterns. Improve incrementally where it makes sense, but don't impose a different paradigm. Favor consistency over perfection.
- **Minimal**: Smallest correct change. No refactoring, no new abstractions, no speculative improvements.

**Scope** — How far can Claude reach beyond the immediate request?
- **Unrestricted**: Free to create new files, modules, test suites, configuration. Can reorganize project structure.
- **Adjacent**: Can make related changes in the neighborhood of the request — fix a broken import, update a test, rename for consistency. Won't restructure unrelated code.
- **Narrow**: Only what was explicitly asked. Nothing else.

## Presets

Named presets cover common workflows:

| Preset | Agency | Quality | Scope | When to use |
|---|---|---|---|---|
| `create` | autonomous | architect | unrestricted | Building from scratch — proper structure, abstractions, and architecture |
| `extend` | autonomous | pragmatic | adjacent | Extending an agent-coded or fast-built project — improve quality incrementally, clean up as you go |
| `safe` | collaborative | minimal | narrow | Surgical changes to production code — minimal risk, maximum precision |
| `refactor` | autonomous | pragmatic | unrestricted | Restructuring — move files, consolidate modules, improve patterns across the codebase |
| `explore` | collaborative | architect | narrow | Understanding a codebase — read, explain, suggest, but don't change files |
| `debug` | collaborative | pragmatic | narrow | Investigation-first debugging — gather evidence, present findings, ask for guidance when stuck |
| `methodical` | surgical | architect | narrow | Step-by-step craftsmanship — follow instructions precisely, attend to details, stop when done |
| `muse` | autonomous | architect | unrestricted | Maximalist creative work — when you want bold ideas, distinctive design, or refusal of generic defaults; output may be more outside-the-box but interesting |
| `flow` | autonomous | architect | adjacent | Deep engagement on a genuinely hard problem — calm and curious, reads widely but modifies narrowly; the depth-not-sprawl counterpoint to muse |
| `tinker` | autonomous | pragmatic | unrestricted | Prototyping and creative coding — loose, generative, and fun; composes flow + playful for an absorbed, enjoying-it character; a sketch, not a cathedral |
| `spark` | autonomous | architect | unrestricted | Maximum expression — muse's anti-generic creative vision plus wit and voice; composes muse + playful for the most personality-forward mode |
| `straight` | autonomous | pragmatic | adjacent | Candid technical work — challenge bad premises, state negative judgments plainly, and explain results without private repository shorthand |

Presets are starting points. Any axis can be overridden: `claude-mode create --quality pragmatic`. Some presets — like `muse` — lean into expressive creative latitude as a deliberate design choice, pairing a modifier with axes to produce a specific behavioral character rather than just a position on each dimension.

## Bases and Response Styles

Axes control initiative, code quality, and scope. Bases control the full system-prompt framing, while response styles control only user-visible writing. They are independent: `--base straight` changes the agent's behavioral posture, and `--style straight` applies direct writing to any base.

The **straight** base makes reaching the correct result more important than validating the user's assumptions. It checks premises, identifies bad or unnecessary approaches directly, recommends the better option, and does not manufacture disagreement.

The **straight** response style uses plain technical English without sugarcoating, metaphors, praise padding, or false balance. It criticizes the work rather than the person. It also keeps prose self-contained: users are not assumed to have seen private tool calls, file contents, or internal repository shorthand. The narrower **declaudified** style removes filler and stock Claude prose without adding straight's stronger anti-sycophancy rules.

`claude-mode straight` combines the straight base and style with autonomous/pragmatic/adjacent axes. Each part remains independently selectable.

## The `none` Mode

For users who manage Claude's behavior entirely through their own mechanisms — CLAUDE.md files, skills, `--append-system-prompt` — `claude-mode none` strips all behavioral instructions from the system prompt. What remains is purely infrastructural:

- Identity (you are Claude Code)
- Security guidelines
- Tool usage instructions (prefer Read over cat, etc.)
- System mechanics (hooks, tags, permissions, context compression)
- Environment info

No opinions on agency, quality, scope, output style, or coding approach. The user's own instructions fill that vacuum. Custom modifiers and `defaultModifiers` from the config still apply in `none` mode — they're user-provided, not built-in opinions.

## Custom Prompts & Config

Beyond presets and axis overrides, teams can define their own prompt fragments and presets in a `.claude-mode.json` config file. Custom bases replace the full prompt framing, custom styles control user-visible writing, custom modifiers append team-specific instructions, and custom axis values replace built-in behavioral fragments entirely. Custom presets compose any mix of built-in and custom values into a named shortcut.

`defaultModifiers` in the config are always applied — useful for team rules that should be active on every invocation without remembering a flag.

The config file lives in the project root (version-controlled, shared with the team) or `~/.config/claude-mode/config.json` (personal defaults). A CLI (`claude-mode config`) manages it without manual JSON editing.

## Context Pacing

An optional `--context-pacing` flag includes instructions that tell Claude it's okay to pause at a natural boundary if a task exceeds the current context window. This addresses a specific failure pattern where Claude rushes and cuts corners as context fills up, producing incomplete or broken code. The instruction encourages finishing current work cleanly and documenting where to pick up, rather than racing to an artificial finish line.

## What This Doesn't Do

- Does not modify Claude Code itself
- Does not manage sessions or state
- Does not persist between invocations
- Does not restrict which Claude features are available — only changes behavioral instructions
