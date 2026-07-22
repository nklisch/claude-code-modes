# Intentional Omissions

Content deliberately excluded from `prompts/base/` because it conflicts with the
axis system's quality/scope tuning. These should NOT be flagged as drift.

## doing-tasks.md

The following upstream `dpY` paragraphs are omitted. They impose a single quality
philosophy (minimal/pragmatic) that the quality axis needs to override per-mode.

### 1. File creation restraint
> "Do not create files unless they're absolutely necessary for achieving your goal.
> Generally prefer editing an existing file to creating a new one, as this prevents
> file bloat and builds on existing work more effectively."

Also covers the leaner v2.1.121 wording:
> "Prefer editing existing files to creating new ones."

**Reason:** The `architect` quality axis encourages creating well-structured files.
The `minimal` axis discourages it. This is axis-controlled.

### 2. No unprompted improvements
> "Don't add features, refactor code, or make 'improvements' beyond what was asked.
> A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need
> extra configurability. Don't add docstrings, comments, or type annotations to code
> you didn't change. Only add comments where the logic isn't self-evident."

**Reason:** The `architect` quality axis and `unrestricted` scope axis explicitly
encourage broader improvements. The `minimal`/`narrow` axes restrict them.

### 3. No speculative error handling
> "Don't add error handling, fallbacks, or validation for scenarios that can't happen.
> Trust internal code and framework guarantees. Only validate at system boundaries
> (user input, external APIs). Don't use feature flags or backwards-compatibility
> shims when you can just change the code."

**Reason:** The `architect` quality axis values defensive coding. The `pragmatic`
and `minimal` axes align more closely with this upstream guidance.

### 4. No premature abstraction
> "Don't create helpers, utilities, or abstractions for one-time operations. Don't
> design for hypothetical future requirements. The right amount of complexity is what
> the task actually requires — no speculative abstractions, but no half-finished
> implementations either. Three similar lines of code is better than a premature
> abstraction."

**Reason:** Same as above — the quality axis controls this tradeoff.

## tone.md

### 5. Short and concise responses
> "Your responses should be short and concise."

**Reason:** The quality axis controls communication verbosity. The `minimal` axis
includes this exact sentence. The `architect` axis encourages detailed explanations
and proposing alternatives, which conflicts with this instruction in the base.

## text-output.md

### 6. "Communicating with the user" gated variant (v2.1.170+)

In v2.1.170 the Text Output function (`kam` as of v2.1.197, was `O5A` in v2.1.177,
`_tf` in v2.1.170, `ExA` earlier) gained a **first branch** gated behind
`B_e(t)||Iam(t)` (was `Rs(H)||z5A(H)` in v2.1.177, `x8H(H)||yX9(H)` in v2.1.170)
that returns a longer `# Communicating with the user` block (lead-with-outcome,
"teammate who stepped away", readable-vs-concise guidance). As of v2.1.197 this
block also grows an extra paragraph when a sub-condition `n` is true, about text
between tool calls not being shown to the user and needing to be restated in the
final message. We continue to track the **default branch** (`# Text output (does
not apply to tool calls)`, now the third branch), which is unchanged.

> "# Communicating with the user … Write it for a teammate who stepped away and is
> catching up, not for a log file: they don't know the codenames or shorthand you
> created along the way … Lead with the outcome … Being readable and being concise
> are different things, and readable matters more … Write code that reads like the
> surrounding code: match its comment density, naming, and idiom. Only write a code
> comment to state a constraint the code itself can't show …"

**Reason:** It's a feature-flagged/gated variant, not the baseline most models receive
(verified absent from a live Opus 4.8 session prompt during the v2.1.170 sync, and
still absent from a live session prompt during the v2.1.197 sync). The chill/flow
bases already carry their own emotion-research-informed communication guidance.
Revisit if this branch becomes the default in a later release.

### 7. One-line code-comment variant (v2.1.197+)

A new second branch gated behind `yh(e)` (`tE(e)` in v2.1.217) returns just:

> "Write code that reads like the surrounding code: match its comment density,
> naming, and idiom."

**Reason:** Same as #6 — a gated variant not observed in a live session prompt.
Likely a terser mode for a specific context (short conversations, sub-agents, or
similar). Revisit if it starts appearing as the default.

## actions.md

### 8. "compact" mode variant (v2.1.197+)

A new branch gated behind `G9o(e)==="compact"` (`YNs(e)==="compact"` in
v2.1.217) returns a much shorter "Executing actions with care" section:

> "Read, search, and investigate freely — looking is not acting. For actions that
> are hard to reverse, affect shared systems, or are otherwise risky (deleting
> data, force-pushing, sending messages, modifying shared infrastructure), confirm
> with the user before proceeding unless durably authorized. Approval in one
> context doesn't extend to the next."

**Reason:** Gated variant, not observed in a live session prompt during the
v2.1.197 sync. We continue to track the default (cautious, full-length) branch,
which matches `actions.md` verbatim. Revisit if `"compact"` mode becomes common.

## tools.md

### 9. Task-tool-only variant (v2.1.197+)

A new branch gated behind `$I()` (`uO()` in v2.1.217) returns guidance about the
task tool only, omitting the Bash-vs-dedicated-tools and parallel-tool-use
bullets present in the default branch.

**Reason:** Gated variant, not observed in a live session prompt during the
v2.1.197 sync — content depends on session state we couldn't trigger. Revisit if
it starts appearing as the default.

## session-guidance.md

### 10. Sub-agent guidance helper `qam(n)` → `Ka_(r)` (identified in v2.1.217)

The Session Guidance function has a branch gated on the Agent tool being present
that calls a helper (`qam` in v2.1.197, `Ka_` in v2.1.217). Resolved during the
v2.1.217 sync by extracting the helper body from the binary: it returns sub-agent
guidance —

> "Use the Agent tool with specialized agents when the task at hand matches the
> agent's description. Subagents are valuable for parallelizing independent
> queries or for protecting the main context window from excessive results, but
> they should not be used excessively when not needed. Importantly, avoid
> duplicating work that subagents are already doing - if you delegate research to
> a subagent, do not also perform the same searches yourself."

— with a fork-mode variant (subagent_type: "fork" inherits full conversation
context, runs in background) behind a separate gate.

**Reason:** The local session-guidance sub-agent bullet already paraphrases the
default branch (delegate broad exploration, don't duplicate delegated searches).
The fork variant is session-state-gated and not tracked.

### 10b. Removed upstream: `/schedule` offer blocks (gone in v2.1.217)

The feature-flagged `/schedule` offer guidance (`tengu_orchid_mantis` /
`tengu_orchid_mantis_v2`) that local session-guidance intentionally skipped was
removed upstream in v2.1.217. No longer an omission — kept here for history.

## env.md

### 11. Unidentified new field `NRn()??null` (v2.1.197+, `joo()??null` in v2.1.217)

The Environment Info function inserts a field between "OS Version" and the
model-name line, guarded by `NRn()??null` (v2.1.197) / `joo()??null` (v2.1.217).
It has not fired in any live session prompt observed so far. Binary context in
v2.1.217 shows `joo()` returns a variable set alongside cloud/remote-session
strings ("Never push to main/master, force-push, or merge.", draft-PR
instructions), suggesting it is remote/cloud-environment guidance that never
fires in local CLI sessions.

**Reason:** Environment-gated content not applicable to local sessions.
Investigate further only if it starts appearing in a local session prompt.

### 12. Gated `<system-reminder>` bullet variant in System Rules (v2.1.217+)

In v2.1.217 the `<system-reminder>` bullet in System Rules comes from a helper
`Pjd(e,"standard")`. The standard branch returns the same text local system.md
carries. A gated branch (`Djd(e)`) instead returns:

> "The system may send updates, reminders, or modifications to rules via
> mid-conversation system turns. These are system-controlled, unlike function
> results."

**Reason:** Gated variant (likely tied to the `mid_conv_system` model
capability), not the standard path. Revisit if it becomes the default.

### 13. Lean/restructured prompt path (observed v2.1.217)

The v2.1.217 binary carries a substantially restructured "lean" prompt
assembly alongside the standard functions this project tracks: a `# Harness`
section replacing `# System` (terser bullets, e.g. "`<system-reminder>` tags in
messages and tool results are injected by the harness, not the user"), a compact
executing-actions block ("For actions that are hard to reverse or
outward-facing, confirm first unless durably authorized…"), an
act-without-re-deriving block ("When you have enough information to act, act…"),
pronoun guidance, a "# Delivering work" section, and more. Live Opus 4.8
sessions have been observed receiving this lean path instead of the standard
assembly (some model configs carry a `lean_prompt` capability).

**Reason:** Out of scope for the current base fragments, which track the
standard assembly. This is a project-direction question: if the lean path
becomes the norm for the models this launcher targets, consider re-basing
`prompts/base/` on it. The extraction script does not currently extract these
sections.

## How to maintain this file

When a new intentional omission is decided during a sync:
1. Add a numbered entry under the relevant fragment heading.
2. Include the exact upstream text (quoted) so future diffs can match against it.
3. Include a one-line reason explaining why it's excluded.
