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

In v2.1.170 the Text Output function (`XM_` as of v2.1.220; was `Ra_` in v2.1.217,
`kam` in v2.1.197, `O5A` in v2.1.177, `_tf` in v2.1.170, `ExA` earlier) gained a **first branch** gated behind
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

### 7. One-line code-comment variant — **this is the lean path** (identified v2.1.220)

The second branch, gated behind `vE(e)` (was `tE` in v2.1.217, `yh` in v2.1.197),
returns just:

> "Write code that reads like the surrounding code: match its comment density,
> naming, and idiom."

`vE` was resolved during the v2.1.220 sync: it is the **lean-prompt predicate**, not
a terser mode for short conversations. It is true whenever the session model carries
the `lean_prompt` capability. So this line is what every lean-path session gets in
place of the whole `# Text output` section.

**Reason (still omitted, new grounds):** the lean base now exists at `prompts/lean/`,
but this particular line is quality-axis territory — matching the surrounding code's
*comment density* caps the `architect` axis, which explicitly asks for JSDoc on
exported functions and comments that explain WHY. Same call as omissions #1–#4.

## actions.md

### 8. "compact" mode variant (v2.1.197+)

A new branch gated behind `G9o(e)==="compact"` (`YNs` in v2.1.217 → `Eqs` in
v2.1.220) returns a much shorter "Executing actions with care" section:

> "Read, search, and investigate freely — looking is not acting. For actions that
> are hard to reverse, affect shared systems, or are otherwise risky (deleting
> data, force-pushing, sending messages, modifying shared infrastructure), confirm
> with the user before proceeding unless durably authorized. Approval in one
> context doesn't extend to the next."

**Reason:** `Eqs(e)` was resolved during the v2.1.220 sync — it is the
investigate-first setting, and it returns anything other than `"off"` **only for
`claude-opus-4-7`** (via `CLAUDE_CODE_INVESTIGATE_FIRST` or `tengu_slate_harrier`).
So this branch is reachable on exactly one model, in an experiment. We continue to
track the default (cautious, full-length) branch, which matches `actions.md`
verbatim.

Note this is *not* the lean action-caution text — that comes from a separate
lean-only function (`JM_`) and is tracked at `prompts/lean/actions.md`.

## tools.md

### 9. Task-tool-only variant (v2.1.197+)

A new branch gated behind `$I()` (`uO()` in v2.1.217 → `i1()` in v2.1.220) returns guidance about the
task tool only, omitting the Bash-vs-dedicated-tools and parallel-tool-use
bullets present in the default branch.

**Reason:** Gated variant, not observed in a live session prompt. `i1()` is
unrelated to the lean predicate — the lean path drops the tools section entirely in
favour of one `# Harness` bullet, which `prompts/lean/core.md` carries.

## session-guidance.md

### 10. Sub-agent guidance helper `qam(n)` → `Ka_(r)` (identified in v2.1.217)

The Session Guidance function has a branch gated on the Agent tool being present
that calls a helper (`qam` in v2.1.197, `Ka_` in v2.1.217, `fO_` in v2.1.220). Resolved during the
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
model-name line, guarded by `NRn()??null` (v2.1.197) / `joo()??null` (v2.1.217) /
`Ddo()??null` (v2.1.220).
It has not fired in any live session prompt observed so far. Binary context in
v2.1.217 shows `joo()` returns a variable set alongside cloud/remote-session
strings ("Never push to main/master, force-push, or merge.", draft-PR
instructions), suggesting it is remote/cloud-environment guidance that never
fires in local CLI sessions.

**Reason:** Environment-gated content not applicable to local sessions.
Investigate further only if it starts appearing in a local session prompt.

### 12. Gated `<system-reminder>` bullet variant in System Rules (v2.1.217+)

Since v2.1.217 the `<system-reminder>` bullet in System Rules comes from a helper
(`Pjd` in v2.1.217 → `Qep` in v2.1.220), called as `(e,"standard")`. The standard branch returns the same text local system.md
carries. A gated branch (`Djd(e)` → `Jep(e)` in v2.1.220) instead returns:

> "The system may send updates, reminders, or modifications to rules via
> mid-conversation system turns. These are system-controlled, unlike function
> results."

**Reason:** Gated variant (likely tied to the `mid_conv_system` model
capability), not the standard path. Revisit if it becomes the default.

### 13. Lean prompt path — **now tracked** (resolved v2.1.220)

Previously recorded as out of scope. The v2.1.220 sync mapped it fully, and it is
now reproduced at `prompts/lean/` and selected automatically by `--base auto`.

What it is: upstream assembles two prompt shapes from one function, forking on the
`vE` predicate. Lean replaces six head sections (intro, `# System`, `# Doing tasks`,
`# Executing actions with care`, `# Using your tools`, `# Tone and style`) with a
single intro + security preamble + `# Harness` block, then shares the same tail of
dynamic sections with the standard path. The predicate reduces to "the model carries
the `lean_prompt` capability" — Opus 5, Opus 4.8, Fable 5, Mythos 5 as of v2.1.220.

`opus_5_prompt_bundle` is a second capability layered on top (Opus 5 only), adding
`# Delivering work`, `# Corrections`, and the two tool-restraint bullets. Those ship
as modifiers.

See fragment-map.md for the per-fragment mapping. The extraction script still does
not extract these sections — they were mapped by grepping the binary directly.

## context-management.md (both bases)

### 14. Act-don't-re-derive: recommendation-over-survey clause

The shared `_O_` constant reads in full:

> "When you have enough information to act, act. Do not re-derive facts already
> established in the conversation, re-litigate a decision the user has already made,
> or narrate options you will not pursue. If you are weighing a choice, give a
> recommendation, not an exhaustive survey"

All four bases keep the first two clauses and omit "or narrate options you will not
pursue" and the recommendation sentence. `chill`/`flow` additionally reword the rest
into their own voice, as they do for every fragment.

**Reason:** Agency and quality axis territory. `agency/collaborative` asks Claude to
"present the options clearly with pros and cons… let the user choose", and
`quality/architect` asks it to "propose alternatives when they exist". Suppressing
option surveys in the base would cap both.

## prompts/modifiers/delivering-work.md

### 15. Scope-setting sentences in `# Delivering work`

Omitted from `bO_`:

> "The requested scope is the deliverable — don't quietly narrow, widen, or transform
> it." … "Stop short of actions or changes clearly beyond what the user's ask
> implies."

**Reason:** Directly scope-axis controlled. `scope/unrestricted` tells Claude to
"create them… don't wait to be asked for obvious infrastructure" and to reorganize
freely; `scope/adjacent` tells it to fix related issues it encounters. A base-level
"don't widen the scope" would override both.

### 16. Ambiguity and blocking-question guidance in `# Delivering work`

Omitted from `bO_`:

> "Interpret ambiguity the way a careful colleague would: make routine judgment calls
> yourself, and check in only when different readings would lead to materially
> different work." … "Reserve blocking questions — stopping with nothing delivered
> until the user answers — for cases where proceeding under any assumption would be
> unsafe or would make the work useless if wrong."

**Reason:** Agency axis territory. `agency/surgical` says "if the request is
ambiguous, ask for clarification rather than interpreting broadly", and
`agency/partner` says "ask one sharp question rather than picking an interpretation
silently". Both are the opposite of the omitted default.

## prompts/modifiers/corrections.md

### 17. No omissions

`SO_` is carried in full, lightly reflowed for readability. Self-correction behaviour
isn't governed by any axis.

## prompts/modifiers/tool-restraint.md

### 18. Reworded, not omitted

Upstream's `Kep` is two literal bullets naming Claude Code internals:

> "Do not call the AgentTool unless the user requested it"
> "Do not use workflows or deep-research unless the user requested it"

Local rewords these to tool-agnostic phrasing ("Do not spawn sub-agents…", "Do not
launch multi-agent workflows or deep-research runs…") to match the project's
convention of not hard-coding upstream tool names. Same intent, no content dropped.

## How to maintain this file

When a new intentional omission is decided during a sync:
1. Add a numbered entry under the relevant fragment heading.
2. Include the exact upstream text (quoted) so future diffs can match against it.
3. Include a one-line reason explaining why it's excluded.
