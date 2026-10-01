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

### 6. "Communicating with the user" — the Fable 5 / Mythos 5 variant (gate resolved v2.1.286)

The Text Output function (`Gno` in v2.1.286; `XM_` in v2.1.220, `Ra_` in v2.1.217,
`kam` in v2.1.197, `O5A` in v2.1.177, `_tf` in v2.1.170, `ExA` earlier) has a branch
returning a longer `# Communicating with the user` block (lead-with-outcome,
"teammate who stepped away", readable-vs-concise guidance), plus an extra paragraph
about restating mid-turn text in the final message when `jno` is true. We track the
**default branch** (`# Text output (does not apply to tool calls)`), which is unchanged.

Gate resolved during the v2.1.286 sync: `Hno(model)` = `[P0, fLo, gLo].some(…)`, and
`fLo`/`gLo` return `false` outright, so it reduces to `P0` = the `fable_5_mitigations`
capability (or Mythos 5 by name), plus `basalt_cove` client data. In practice that is
**Fable 5 and Mythos 5**. Fable 5.1 and Mythos 5.1 also carry `fable_5_mitigations`,
but they hit the turn-updates branch first (#21).

v2.1.286 replaced this block's em dashes with colons and commas:

> "# Communicating with the user … Write it for a teammate who stepped away and is
> catching up, not for a log file: they don't know the codenames or shorthand you
> created along the way … Lead with the outcome. Your first sentence after finishing
> should answer "what happened" or "what did you find": the thing the user would ask
> for … Being readable and being concise are different things, and readable matters
> more … Write code that reads like the surrounding code: match its comment density,
> naming, and idiom. Only write a code comment to state a constraint the code itself
> can't show, never to say where it came from …"

**Reason:** Model-specific to Fable 5 / Mythos 5. It also carries the comment-density
and comment-content rules that cap the `architect` quality axis (same call as #7).
The chill/flow bases carry their own communication guidance.

### 7. One-line code-comment variant — **this is the lean path** (identified v2.1.220)

The lean branch, gated behind `EG(e)` in v2.1.286 (`vE` in v2.1.220, `tE` in
v2.1.217, `yh` in v2.1.197), returns just:

> "Write code that reads like the surrounding code: match its comment density,
> naming, and idiom."

`vE` (now `EG`) was resolved during the v2.1.220 sync: it is the **lean-prompt
predicate**, not a terser mode for short conversations. It is true whenever the session model carries
the `lean_prompt` capability. So this line is what every lean-path session gets in
place of the whole `# Text output` section.

**Reason (still omitted, new grounds):** the lean base now exists at `prompts/lean/`,
but this particular line is quality-axis territory — matching the surrounding code's
*comment density* caps the `architect` axis, which explicitly asks for JSDoc on
exported functions and comments that explain WHY. Same call as omissions #1–#4.

## actions.md

### 8. "compact" mode variant (v2.1.197–v2.1.220) — **removed upstream in v2.1.286**

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

**v2.1.286:** the branch and its `investigate_first` tail section are gone; `coo` has a
single branch. Kept here for history.

Note this is *not* the lean action-caution text — that comes from a separate
lean-only function (`JM_`) and is tracked at `prompts/lean/actions.md`.

## tools.md

### 9. Task-tool-only variant (v2.1.197+)

A new branch gated behind `$I()` (`uO()` in v2.1.217 → `i1()` in v2.1.220) returns guidance about the
task tool only, omitting the Bash-vs-dedicated-tools and parallel-tool-use
bullets present in the default branch.

**Reason:** Gated variant, not observed in a live session prompt. In v2.1.286 the
gate (`v0()`) **returns false outright**, so the branch is dead code. It is
unrelated to the lean predicate — the lean path drops the tools section entirely in
favour of one `# Harness` bullet, which `prompts/lean/core.md` carries.

## session-guidance.md

### 10. Sub-agent guidance helper `qam(n)` → `Ka_(r)` (identified in v2.1.217)

The Session Guidance function has a branch gated on the Agent tool being present
that calls a helper (`qam` in v2.1.197, `Ka_` in v2.1.217, `fO_` in v2.1.220, `poo` in
v2.1.286). Resolved during the
v2.1.217 sync by extracting the helper body from the binary: it returns sub-agent
guidance —

> "Use the Agent tool with specialized agents when the task at hand matches the
> agent's description. Subagents are valuable for parallelizing independent
> queries or for protecting the main context window from excessive results, but
> they should not be used excessively when not needed. Importantly, avoid
> duplicating work that subagents are already doing - if you delegate research to
> a subagent, do not also perform the same searches yourself."

— with a fork-mode variant (subagent_type: "fork" inherits full conversation
context, runs in background) behind a separate gate. Since v2.1.286 a third variant
drops the "Subagents are valuable…" sentence whenever the sub-agent steer isn't
`"default"`. Opus 5's model floor sets the steer to `"no_nudges"`.

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

**v2.1.286:** superseded. The whole environment block moved out of the system prompt
into the `environment` attachment, which Claude Code sends itself (see
fragment-map.md, "Session attachments"). That block's optional trailing line is now
an `agentProxyNote` (helper unresolved). It's not our concern either way, since local
bases no longer carry the block.

### 12. Gated `<system-reminder>` bullet variant (v2.1.217+) — **tracked on the lean path since v2.1.286**

Since v2.1.217 the `<system-reminder>` bullet in System Rules comes from a helper
(`Pjd` in v2.1.217 → `Qep` in v2.1.220), called as `(e,"standard")`. The standard branch returns the same text local system.md
carries. A gated branch (`Djd(e)` → `Jep(e)` in v2.1.220) instead returns:

> "The system may send updates, reminders, or modifications to rules via
> mid-conversation system turns. These are system-controlled, unlike function
> results."

**Resolved in v2.1.286:** the gate is `bAe(model)` = mid-conv system (`q6`) && not
Sonnet 5 && not Opus 4.8. `q6` follows the `mid_conv_system` capability, but it
hard-excludes Opus 4.8 and HIPAA orgs and treats Mythos 5 as on. No standard-path
model passes it, so `prompts/base/system.md` keeps the standard text. On the lean
path (`Dvt(model,"lean")`) it decides between this wording and "`<system-reminder>`
tags in messages and tool results are injected by the harness, not the user."
`prompts/lean/core.md` now renders that choice from `{{SYSTEM_REMINDER_NOTE}}`, which
is driven by the local `mid-conv-system` capability.

### 13. Lean prompt path — **now tracked** (resolved v2.1.220)

Previously recorded as out of scope. The v2.1.220 sync mapped it fully, and it is
now reproduced at `prompts/lean/` and selected automatically by `--base auto`.

What it is: upstream assembles two prompt shapes from one function, forking on the
`vE` predicate. Lean replaces six head sections (intro, `# System`, `# Doing tasks`,
`# Executing actions with care`, `# Using your tools`, `# Tone and style`) with a
single intro + security preamble + `# Harness` block, then shares the same tail of
dynamic sections with the standard path. The predicate reduces to "the model carries
the `lean_prompt` capability" — Opus 5, Opus 4.8, Fable 5, Mythos 5 as of v2.1.220;
Opus 5.5, Sonnet 5.5, Fable 5.1, and Mythos 5.1 joined in v2.1.286.

`opus_5_prompt_bundle` is a second capability layered on top (Opus 5 only), adding
`# Delivering work`, `# Corrections`, and tool restraint. Those ship as modifiers. Since
v2.1.286 there are three bundles (Opus 5, Opus 5.5, Fable 5.1 / Mythos 5.1); each
model's share is its `promptBundle` in `MODEL_TABLE` — see fragment-map.md.

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

Since v2.1.286 `# Delivering work` (`koo`) also goes to Fable 5.1 and Mythos 5.1 (the
`fable_5_1_prompt_bundle`). Its text is unchanged, so #15 and #16 apply as before.

## prompts/modifiers/corrections.md

### 17. No omissions

`SO_` is carried in full, lightly reflowed for readability. Self-correction behaviour
isn't governed by any axis.

## prompts/modifiers/tool-restraint.md

### 18. Reworded, not omitted

In v2.1.286 upstream's section is `opus5_reduced_delegation`, a single sentence (`Avt`)
naming the Agent tool:

> "Do not use the ${Agent} tool, workflows, or deep-research unless the user, a
> CLAUDE.md file, or a skill asks for it"

It replaced v2.1.220's two bullets (`Kep`: "Do not call the AgentTool unless the user
requested it" / "Do not use workflows or deep-research unless the user requested
it"). The old first bullet survives only as the `ooo` marker that suppresses the
section when the `heron_brook` text already says it.

Local rewords it to tool-agnostic phrasing ("Do not spawn sub-agents, launch
multi-agent workflows, or start deep-research runs unless the user, a CLAUDE.md file,
or a skill asks for it"), matching the project's convention of not hard-coding
upstream tool names. Same intent, no content dropped.

## Fable / Mythos model-specific sections (v2.1.286)

The v2.1.286 sync gave `--base auto` a per-model `promptBundle`. The user decided it
carries only `delivering-work` for Fable 5.1 / Mythos 5.1. The other sections those
models receive are recorded here.

### 19. Autonomy append (all Fable and Mythos models)

`autonomy_append` (`soo` in v2.1.286; `oO_` in v2.1.220, where it already existed but
was never mapped). Gate: `tengu_amber_sextant` (default **true**) && (`P0` =
`fable_5_mitigations` / Mythos 5 || `amber_astrolabe` client data). That covers Fable 5,
Fable 5.1, Mythos 5, and Mythos 5.1.

> "You are operating autonomously. The user is not watching in real time and cannot
> answer questions mid-task, so asking 'Want me to…?' or 'Shall I…?' will block the
> work. For reversible actions that follow from the original request, proceed without
> asking. … Before ending your turn, check your last paragraph. If it is a plan, an
> analysis, a question, a list of next steps, or a promise about work you have not
> done …, do that work now with tool calls. …"

**Reason:** Agency axis territory. It directly contradicts `agency/collaborative`
(check in at decision points) and `agency/surgical`; `agency/autonomous` already
expresses the same stance for users who want it.

### 20. `# Writing for the user` (Fable 5.1 / Mythos 5.1)

`willow_tern` (`too` in v2.1.286), gated by `vLo`: `CLAUDE_CODE_WILLOW_TERN`, client
data, or `c_e` (`fable_5_1_prompt_bundle`). Opus 5 gets it only behind the growthbook
flag (default off).

> "# Writing for the user … Lead with the answer or outcome. … Keep it short by leaving
> things out, not by packing them in. … No em-dashes, no parentheticals, no arrows. …
> No headers in a message under about 500 words. … Stop when the content stops. No
> closing offer, no restating what you did."

**Reason:** Quality axis territory. Output verbosity belongs to the quality axis (see
#5), and `quality/architect` asks for the opposite: "Don't be unnecessarily terse",
"Propose alternatives when they exist". This is a candidate for an opt-in modifier if
anyone wants it.

### 21. Turn-updates line (Fable 5.1 / Mythos 5.1)

The first branch of the Text Output function (`Wno`), gated by `V1("turn_updates")`.
It is on for `c_e` models and overridable via `CLAUDE_CODE_TURN_UPDATES`. It replaces
the whole communication section for those models:

> "Before you start, say in a line what you're about to do; brief updates while you
> work help the user follow along. Close with a short recap that stands on its own —
> what you found, what you did, and what's next — so a reader who only sees the last
> message has the full picture."

**Reason:** It's a per-model replacement for a section the lean base omits for every
model (#7). In the v2.1.286 sync the user chose to keep the Fable 5.1 bundle to
delivering-work only.

## How to maintain this file

When a new intentional omission is decided during a sync:
1. Add a numbered entry under the relevant fragment heading.
2. Include the exact upstream text (quoted) so future diffs can match against it.
3. Include a one-line reason explaining why it's excluded.
