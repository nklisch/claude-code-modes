# Fragment Map

Maps each local file to its upstream counterpart in the extracted system prompt.

## How to use

The **Marker** column contains a unique string that appears in the upstream function
body. Search the extracted file for this marker to find the right section. The
**Function** column is the minified name as of the last validated version — it will
change between releases but the marker should remain stable.

## Prompt fragments

| Local file | Upstream section | Marker | Function (v2.1.220) | Expected diff |
|---|---|---|---|---|
| `prompts/base/intro.md` | Intro | `an interactive agent that helps users` | `aO_` | Verbatim match (local prepends "You are Claude Code...") |
| `prompts/base/system.md` | System Rules | `rendered in a monospace font using the CommonMark specification` | `cO_` | Verbatim match. Since v2.1.217 the `<system-reminder>` bullet comes from a helper (`Pjd` in v2.1.217 → `Qep` in v2.1.220, called as `(e,"standard")`) and the hooks bullet from `$a_()` → `rO_()` — both verified in the binary to return the same text as before on the standard path; the reminder helper has a gated variant (see intentional-omissions.md #12) |
| `prompts/base/doing-tasks.md` | Doing Tasks | `primarily request you to perform software engineering tasks` | `uO_` | Intentional omissions (see intentional-omissions.md); local additions for read-before-edit, no-time-estimates, diagnose-failures, verified-vs-assumed (upstream gates the last behind `tengu_verified_vs_assumed`, local carries it unconditionally) |
| `prompts/base/actions.md` | Executing Actions with Care | `Carefully consider the reversibility and blast radius` | `dO_` | Merged from upstream cautious variant; autonomous variant removed (agency axis handles behavioral difference). v2.1.198 added the reversible-step and git-status-before-discard passages to the final paragraph; v2.1.217 added the secrets-check sentence ("And when staging or committing…") — all applied locally. Gated `"compact"` branch (`YNs` in v2.1.217 → `Eqs` in v2.1.220) still not tracked (see intentional-omissions.md) |
| `prompts/base/tools.md` | Using Your Tools | `Prefer dedicated tools over` | `pO_` | Local paraphrase — same intent as upstream but rewritten for tool-agnostic phrasing. Gated branch (`$I()` → `uO()` → `i1()` in v2.1.220) returning task-tool-only guidance — not tracked (see intentional-omissions.md). Note: the old marker "planning your work and helping the user track your progress" now only appears in the gated branch |
| `prompts/base/tone.md` | Tone and Style | `file_path:line_number to allow the user to easily navigate` | `hO_` | Intentional omission: "short and concise" (see intentional-omissions.md) |
| `prompts/base/text-output.md` | Text Output | `Assume users can't see most tool calls` | `XM_` | Verbatim match against the **default branch** (the third/final branch). Two gated variants exist ahead of it and are deliberately not tracked (see intentional-omissions.md): the long "Communicating with the user" block (first branch), and a one-line gated branch (`tE(e)` in v2.1.217 → `vE(e)` in v2.1.220) ("Write code that reads like the surrounding code...") |
| `prompts/base/session-guidance.md` | Session Guidance | `Session-specific guidance` | `mO_` | Local paraphrase. The formerly-unknown gated helper (`qam` in v2.1.197 → `Yfm` in v2.1.198 → `Ka_` in v2.1.217 → `fO_` in v2.1.220) is now identified: sub-agent guidance ("Use the Agent tool with specialized agents… avoid duplicating work subagents are already doing") with a fork-mode variant — the local sub-agent bullet paraphrases it. The feature-flagged `/schedule` offer blocks were removed upstream in v2.1.217 |
| `prompts/base/env.md` | Environment Info | `You have been invoked in the following environment` | `vO_` | Local additions: gitStatus block, tool-result note. Worktree notice via `{{WORKTREE_NOTICE}}` — since v2.1.198 it has a second line (shared stash-stack warning, `lgc` in v2.1.198 / `Ojd` in v2.1.217 / `etp` in v2.1.220), tracked in `src/env.ts`. Model-family line tracks upstream — it is generated from `latest_per_family` (helper `Ljd` in v2.1.217 → `Xep` in v2.1.220), so it changes whenever a family gets a new flagship (v2.1.220: Opus 4.8 → Opus 5). Unknown field (`NRn` → `BDn` → `joo` → `Ddo`) still doesn't fire locally; binary context suggests cloud/remote-session push guidance (see intentional-omissions.md) |

## Shared tail sections (both bases)

Upstream builds one array of tail sections *before* it forks between the standard and
lean heads, then spreads the resolved array into both. So these are not lean-specific
— every session gets them regardless of model.

The array is inline in the assembler (`m = [oR("pronouns", …), …]`, resolved by
`UTd`), not a set of named functions, which is why the extraction script has never
covered it. `oR(name, compute)` is only a memo descriptor; it applies no gating.

Most entries are session-, model-, or flag-specific and are correctly out of scope
(`fable_identity`, `investigate_first`, `brief`, `focus_mode`, `bg-session`, `memory`,
`output_style`, `language`, `task_continuity` — the last is dead code, `YFc` returns
`false` outright). Three are unconditional or default-on, and both bases carry them:

| Local file | Marker | Constant (v2.1.220) | Gate |
|---|---|---|---|
| `pronouns.md` in all four bases | `use they/them` | `tO_` | none — always emitted |
| `context-management.md` in all four bases | `you don't need to wrap up early` | `CO_` | none — always emitted |
| …same files, second paragraph | `When you have enough information to act` | `_O_` | `yO_()` = `CLAUDE_CODE_ACT_DONT_REDERIVE` ?? `tengu_cedar_lantern`, **default true** |

`CO_` and `_O_` are merged into one local fragment. `_O_` carries an omission (see
intentional-omissions.md #14). `base/` and `lean/` carry upstream's wording verbatim;
`chill/` and `flow/` carry a reworked version in their own voice (identical to each
other). When checking these, diff the same-voice copies against each other too — they
are duplicates by convention, and duplicates drift.

## Lean base fragments (`prompts/lean/`)

Upstream assembles two prompt shapes from one function. A predicate — `vE` in
v2.1.220, memoized, defined as `vE=Vr((e)=>{...})` rather than a named function —
picks between them:

- **true (lean):** one head section, `gO_(outputStyle, model)` = intro + security
  preamble + `# Harness`
- **false (standard):** the six head functions the `prompts/base/` rows above track

Both shapes then share the same tail of dynamic sections. Several of those sections
branch on the same predicate, which is why some rows below have no standard-path
counterpart at all.

The predicate reduces to **"the model carries the `lean_prompt` capability"**
(`CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=1/0` overrides it either way, but that never
matters here — `--system-prompt-file` replaces the whole assembly).

| Local file | Upstream section | Marker | Function (v2.1.220) | Expected diff |
|---|---|---|---|---|
| `prompts/lean/core.md` | Lean head | `Reference code as` | `gO_` | Verbatim, plus the local "You are Claude Code…" prepend. (The pronoun paragraph upstream emits next is a shared tail section — see above.) The `# Harness` `<system-reminder>` bullet comes from `Qep(t,"lean")`; local carries the `Jep`-true variant (mid-conv system turns), which is what every `lean_prompt` model gets since they all carry `mid_conv_system` |
| `prompts/lean/actions.md` | Action caution | `hard to reverse or outward-facing` | `JM_` | Lean-only — returns null on the standard path. Local keeps the longer form; upstream drops the "if what you find contradicts how it was described" clause when `GFc` is true (which `prompt-bundle` models trigger) |
| `prompts/lean/session-guidance.md` | Session Guidance | `Session-specific guidance` | `mO_` | Same function as the standard base, called with the lean flag. Under lean the sub-agent helper `fO_` returns null and the broad-exploration bullet is skipped, so the lean fragment carries three bullets where standard carries four |
| `prompts/lean/env.md` | Environment Info | `You have been invoked in the following environment` | `vO_` | Byte-identical to `prompts/base/env.md` — the env section does not branch on lean |

### Prompt-bundle modifiers

`opus_5_prompt_bundle` is a second, narrower capability (Opus 5 only in v2.1.220). It
turns on the `vQt` family of gates — `ZXn(model)` short-circuits every one of them —
which adds three more sections. These ship as modifiers, auto-attached by `--base auto`.

| Local file | Marker | Constant (v2.1.220) | Gate |
|---|---|---|---|
| `prompts/modifiers/delivering-work.md` | `Do ordinary work as asked` | `bO_` | `VFc` / `tengu_bison_cairn` |
| `prompts/modifiers/corrections.md` | `Avoid unnecessary or excessive self-correction` | `SO_` | `zFc` / `tengu_larch_cistern` |
| `prompts/modifiers/tool-restraint.md` | `Do not call the AgentTool unless` | `Kep` via `nO_` | `ZXn` / `tengu_heron_brook` |

All three carry local omissions — see intentional-omissions.md.

## Model metadata (env.ts)

Model metadata is resolved dynamically from two tables in `src/env.ts`. Neither is
covered by the extraction script — grep the downloaded native binary directly.

| Local location | What | How to find in the binary |
|---|---|---|
| `MODEL_TABLE` | id / display name / knowledge cutoff for every model | `strings -n 8 package/claude \| grep -o 'id:"claude-[a-z0-9-]*"[^}]\{0,220\}' \| grep -i 'display_name\|knowledge_cutoff' \| sort -u` |
| `MODEL_TABLE` `capabilities` | which models get lean / the bundle | same grep — read the entry's `capabilities` array for `lean_prompt` and `opus_5_prompt_bundle`. These drive `--base auto`, so a new flagship changes which base users get by default |
| `MODEL_ALIASES` | `opus` / `sonnet` / `haiku` / `fable` → newest of family | `grep -a -o '{fable:"[^}]*}' package/claude \| sort -u` — this is upstream's `latest_per_family` |

The alias map is also what upstream feeds into the "most recent Claude models" line
in `prompts/base/env.md`, so the two move together: when a family gets a new
flagship, update `MODEL_ALIASES`, `MODEL_TABLE`, and that prompt line in one pass.

To get the binary without re-running the extraction script (which cleans up after
itself): `npm pack @anthropic-ai/claude-code-linux-x64@<version> && tar xzf *.tgz`
→ `package/claude`.

## Notes

- **Marker stability:** Markers are chosen from natural-language prompt text that's
  unlikely to change between versions. If a marker stops matching, the upstream
  section was likely rewritten — investigate manually.
- **Function names change every release.** Don't rely on them. Use the markers.
- **Variable substitution:** Upstream uses minified names like `${e7}` for "Bash",
  `${H9}` for "Grep", etc. When comparing, treat these as equivalent to the
  spelled-out tool names in local files.
- **Native-binary bundle layout (v2.1.121+):** the binary contains the prompt
  text twice — once in a fragmented string-table region (each prompt sentence
  stored as its own length-prefixed string) and once as JS function bodies. The
  extraction script searches for the *last* sentinel occurrence to land in the
  function-body region, where each prompt section is wrapped in a named
  function (e.g. `y0A`, `h0A`, …). If extraction returns mostly NOT FOUND,
  the bundle layout has likely changed again — re-investigate by `grep`-ing
  the binary for marker offsets to confirm where function bodies live.
