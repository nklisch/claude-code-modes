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

A new second branch gated behind `yh(e)` returns just:

> "Write code that reads like the surrounding code: match its comment density,
> naming, and idiom."

**Reason:** Same as #6 — a gated variant not observed in a live session prompt.
Likely a terser mode for a specific context (short conversations, sub-agents, or
similar). Revisit if it starts appearing as the default.

## actions.md

### 8. "compact" mode variant (v2.1.197+)

A new branch gated behind `G9o(e)==="compact"` returns a much shorter
"Executing actions with care" section:

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

A new branch gated behind `$I()` returns guidance about the task tool only,
omitting the Bash-vs-dedicated-tools and parallel-tool-use bullets present in the
default branch.

**Reason:** Gated variant, not observed in a live session prompt during the
v2.1.197 sync — content depends on session state we couldn't trigger. Revisit if
it starts appearing as the default.

## session-guidance.md

### 10. Unidentified gated branch `qam(n)` (v2.1.197+)

The Session Guidance function (`Vam` in v2.1.197) has a branch gated behind
`e.has(is)` that calls an unextracted helper `qam(n)`. It did not fire in the live
session prompt used during the v2.1.197 sync, so its content is unknown.

**Reason:** Not a documented omission so much as an open question — flagged here
so future syncs know to investigate rather than assume it's unchanged. If it fires
in a future sync, extract `qam`'s body and classify properly.

## env.md

### 11. Unidentified new field `NRn()??null` (v2.1.197+)

The Environment Info function (`elm` in v2.1.197) inserts a new field between
"OS Version" and the model-name line, guarded by `NRn()??null`. It did not fire
in the live session prompt used during the v2.1.197 sync (produced no visible
output), so its content is unknown.

**Reason:** Same as #10 — flagged as an open question rather than a settled
omission. Investigate if it starts appearing in a live session prompt.

## How to maintain this file

When a new intentional omission is decided during a sync:
1. Add a numbered entry under the relevant fragment heading.
2. Include the exact upstream text (quoted) so future diffs can match against it.
3. Include a one-line reason explaining why it's excluded.
