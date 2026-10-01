# Fragment Map

Maps each local file to its upstream counterpart in the extracted system prompt.

## How to use

The **Marker** column contains a unique string that appears in the upstream function
body. Search the extracted file for this marker to find the right section. The
**Function** column is the minified name as of the last validated version — it will
change between releases but the marker should remain stable.

## Prompt fragments

| Local file | Upstream section | Marker | Function (v2.1.286) | Expected diff |
|---|---|---|---|---|
| `prompts/base/intro.md` | Intro | `Use the instructions below and the tools available to you to assist the user` | `ioo` | Verbatim match (local prepends "You are Claude Code..."). Since v2.1.286 a gated intro-frame variant (`Mvt()` = `CLAUDE_CODE_INTRO_FRAME` ?? `tengu_ochre_wren`, default **off**) swaps the opening line for "You are an agent working with the user toward their goals, using your own judgment along the way." — not tracked. The old marker `an interactive agent that helps users` now lands in a `var`, which the extraction script can't resolve to a function |
| `prompts/base/system.md` | System Rules | `rendered in a monospace font using the CommonMark specification` | `loo` | Verbatim match. The `<system-reminder>` bullet comes from `Dvt(e,"standard")` (was `Qep`), the hooks bullet from `Zno()` (was `rO_`). v2.1.286 adds a gated pasted-content bullet (`...eP()?[hAe]:[]`, `tengu_virtual_pancake`, default **off**) explaining `<pasted_content>` tags — not tracked (see "Gated, not tracked" below) |
| `prompts/base/doing-tasks.md` | Doing Tasks | `primarily request you to perform software engineering tasks` | `doo` | Intentional omissions (see intentional-omissions.md); local additions for read-before-edit, no-time-estimates, diagnose-failures, verified-vs-assumed (upstream gates the last behind `tengu_verified_vs_assumed`, local carries it unconditionally). Unchanged v2.1.220 → v2.1.286 |
| `prompts/base/actions.md` | Executing Actions with Care | `Carefully consider the reversibility and blast radius` | `coo` | Merged from upstream cautious variant; autonomous variant removed (agency axis handles behavioral difference). The gated `"compact"` branch was **removed upstream in v2.1.286** — `coo` now takes no arguments and has one branch, which matches local verbatim |
| `prompts/base/tools.md` | Using Your Tools | `planning your work and helping the user track your progress` | `foo` | Local paraphrase — same intent as upstream but rewritten for tool-agnostic phrasing. The marker lands in the gated task-tool-only branch, whose gate `v0()` **returns false outright** in v2.1.286 — dead code |
| `prompts/base/tone.md` | Tone and Style | `file_path:line_number to allow the user to easily navigate` | `goo` | Intentional omission: "short and concise" (see intentional-omissions.md) |
| `prompts/base/text-output.md` | Text Output | `Assume users can't see most tool calls` | `Gno` | Verbatim match against the **default branch** (the fourth/final branch). Since v2.1.286 this section is emitted from the session tail (named `communication`), not the head. Branches in order: turn-updates line (`Wno`, Fable 5.1 / Mythos 5.1), `# Communicating with the user` (Fable 5 / Mythos 5), the lean one-liner (`EG`), default. All three variants are omissions — see intentional-omissions.md #6, #7, #21 |
| `prompts/base/session-guidance.md` | Session Guidance | `Session-specific guidance` | `moo` | Local paraphrase. Sub-agent helper is `poo` (was `fO_`): default-steer text plus a shorter variant when the sub-agent steer isn't `"default"` (Opus 5's model floor is `"no_nudges"`), and a fork-mode variant. v2.1.286 adds a remote-only bullet (`kKo()`: `CLAUDE_CODE_REMOTE` + cloud entrypoints) about which files the Claude app can open — not applicable to local sessions |
| `prompts/base/env.md` | Environment Info | `Claude Code is available as a CLI in the terminal` | `voo` | **Restructured in v2.1.286.** The system-prompt section now holds only the model-family line (`Bno`, from `latest_per_family`), the availability line, and the fast-mode line. Working directory, git, platform, shell, OS, scratchpad, and the worktree notices moved to an `environment` **attachment** (`TYe`/`cpn`; `Jfn` holds "You have been invoked in the following environment: "), and "You are powered by…" + knowledge cutoff to a `model` attachment (`WYe`). Both are suppressed only in bare mode (`tje()`), **not** by `--system-prompt-file` — confirmed with a live probe. Local carries the three lines plus its tool-results note |

### Session attachments (not in the system prompt)

Since v2.1.286 several things that used to be system-prompt sections arrive as
conversation attachments, assembled per turn (`k3t` environment, `S3t` model, `b3t`
output style + language, `Br` session context). Claude Code sends them regardless of a
replaced system prompt, so **local bases must not duplicate them**:

| Attachment | Content | Gate |
|---|---|---|
| `environment` | `# Environment` block; later `# Environment update` diffs when cwd/worktree/dirs change | not bare mode |
| `model` | "You are powered by the model named …" + knowledge cutoff | not bare mode |
| `session_context` | `userEmail`, `attachedProject`, `gitStatus`, `perforceMode` | git status omitted when `options.omitGitStatus` — set when a custom system prompt is used on the **print/SDK** path, and for Explore/Plan sub-agents. Interactive sessions keep it |
| `output_style_instructions`, `language` | `# Output Style: …`, `# Language` | main/teammate agents |

The local `gitStatus` block was dropped in the v2.1.286 sync; print-mode runs under
claude-mode therefore have no git status. Template variables (`CWD`, `MODEL_NAME`,
`GIT_STATUS`, `WORKTREE_NOTICE`, …) stay in `src/env.ts` for custom bases.

## Shared tail sections (both bases)

Upstream builds one array of tail sections, resolves it, then emits it after either
head. So these are not lean-specific — every session gets them regardless of model.

The array is inline in the assembler (`$vt` in v2.1.286, entries built with
`nf(name, compute)`; was `oR(…)` in `I4` in v2.1.220), not a set of named functions.
`nf` is only a memo descriptor; it applies no gating. The extraction script now
extracts the assembler body ("Main Assembler", marker `"act_dont_rederive",`).

Tail order in v2.1.286: `communication`, `pronouns`, `action_caution`,
`task_continuity`, `fable_identity`, `tool_param_json`, `session_guidance`, `memory`,
`env_info_simple`, `bg-session`, `context_management`, `brief`, `focus_mode`,
`act_dont_rederive`, `delivering_work_max`, `overcorrection`,
`subagent_steer_delegation`, `opus5_reduced_delegation`, `heron_brook`, `brook_heron`,
`willow_tern`, `autonomy_append`, `endconv_deferred_hint`.

Tracked elsewhere: `communication` (text-output row), `action_caution` (lean),
`session_guidance`, `env_info_simple`, and the bundle sections below. Three are
unconditional or default-on, and every base carries them:

| Local file | Marker | Constant (v2.1.286) | Gate |
|---|---|---|---|
| `pronouns.md` in all four bases | `use they/them` | `Jno` | none — always emitted |
| `context-management.md` in all four bases | `you don't need to wrap up early` | `Too` | none — always emitted |
| …same files, second paragraph | `When you have enough information to act` | `_oo` | `yoo()` = `CLAUDE_CODE_ACT_DONT_REDERIVE` ?? `tengu_cedar_lantern`, **default true** |

`Too` and `_oo` are merged into one local fragment. `_oo` carries an omission (see
intentional-omissions.md #14). `base/` and `lean/` carry upstream's wording verbatim;
`chill/` and `flow/` carry a reworked version in their own voice (identical to each
other). When checking these, diff the same-voice copies against each other too — they
are duplicates by convention, and duplicates drift.

### Out of scope, with reasons

- `task_continuity` — dead code: `Sfn` returns `false` outright (still true in v2.1.286).
- `fable_identity` — model-identity paragraph for Fable 5 / Fable 5.1 (`Xno`).
- `tool_param_json` — `toolParamStrictness` setting, or Fable models behind `tengu_silent_harbor` (default off).
- `memory`, `bg-session` (`CLAUDE_CODE_SESSION_KIND=bg`), `brief`, `focus_mode` — session-gated.
- `subagent_steer_delegation` — `## Delegating to subagents` (`D1o`), only when the sub-agent steer is `"counter_steer"`, which comes from env / client data / growthbook, never a model default.
- `heron_brook`, `brook_heron` — server-supplied text (client data or growthbook string); no built-in content.
- `endconv_deferred_hint` — only when the EndConversation tool is present and deferred.
- `autonomy_append`, `willow_tern`, and the communication variants — model-specific, recorded as omissions (#19–#21, #6).
- **Removed since v2.1.220:** `investigate_first` (with the actions compact branch), `language` and `output_style` (now attachments), `scratchpad` (now in the environment attachment).

## Lean base fragments (`prompts/lean/`)

Upstream assembles two prompt shapes from one function. The lean predicate is `EG`
(v2.1.286; was `vE`), a per-host memo of `Ao`:

- `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT` forces it either way (irrelevant here — `--system-prompt-file` replaces the whole assembly).
- Otherwise lean unless `Yr(model)` says "not lean". `Yr` reads the `lean_prompt` capability when listed; when it isn't, Mythos 5 and `-eap` ids are lean by name, and `claude-3-*`, Haiku, Sonnet, and Opus 4.0–4.7 are not.
- `tengu_velvet_tide` or `simple_system_prompt` client data can also force lean.

So the local `lean-prompt` capability mirrors the **predicate**, not the capabilities
array — Mythos 5's array is empty in v2.1.286 but it is still lean.

- **true (lean):** one head section, `hoo(outputStyle, model)` = intro + security preamble + `# Harness`
- **false (standard):** the six head functions the `prompts/base/` rows above track

| Local file | Upstream section | Marker | Function (v2.1.286) | Expected diff |
|---|---|---|---|---|
| `prompts/lean/core.md` | Lean head | `Reference code as` | `hoo` | Verbatim, plus the local "You are Claude Code…" prepend. The reminder bullet comes from `Dvt(model,"lean")`: the mid-conversation wording when `bAe(model)` = `q6` (mid-conv system, which hard-excludes Opus 4.8 and HIPAA orgs, and treats Mythos 5 as on) && not Sonnet 5 && not Opus 4.8; otherwise "`<system-reminder>` tags in messages and tool results are injected by the harness, not the user." Local renders it from `{{SYSTEM_REMINDER_NOTE}}`, driven by the `mid-conv-system` model capability. A gated pasted-content bullet follows it (same `eP()` gate as the standard path) — not tracked |
| `prompts/lean/actions.md` | Action caution | `hard to reverse or outward-facing` | `zno` | Verbatim. Lean-only — returns null on the standard path. v2.1.286 removed the "— if what you find contradicts how it was described, or you didn't create it, surface that instead of proceeding" clause for every model (it was previously dropped only for bundle models) |
| `prompts/lean/session-guidance.md` | Session Guidance | `Session-specific guidance` | `moo` | Same function as the standard base, called with the lean flag. Under lean the sub-agent helper `poo` returns null and the broad-exploration bullet is skipped, so the lean fragment carries three bullets where standard carries four |
| `prompts/lean/env.md` | Environment Info | `Claude Code is available as a CLI in the terminal` | `voo` | Byte-identical to `prompts/base/env.md` — the env section does not branch on lean |

### Prompt bundles

v2.1.286 has three bundle capabilities. Feature capabilities resolve through `V1(cap, …)`:
listed in the model table → on; otherwise `turn_updates` and its siblings are on for
`c_e` models, `bison_cairn`/`larch_cistern` for `Upn` models, and
`silent_turn_reminder`/`quizzical_shore` for `Ge` models. Client data can override any of them.

- `Upn(model)` = `opus_5_prompt_bundle` && !`tengu_fennel_godwit` (default off) → **Opus 5**
- `c_e(model)` = `fable_5_1_prompt_bundle` && !`i7e()` (local-agent entrypoints) → **Fable 5.1, Mythos 5.1**
- `Ge(model)` = `opus_5_5_prompt_bundle` && !`i7e()` → **Opus 5.5** — drives only non-prompt behaviour (reminders, bash-first), **no system-prompt sections**

Local mirrors each model's bundle as `promptBundle` in `MODEL_TABLE`, attached by `--base auto`:

| Local file | Marker | Constant (v2.1.286) | Gate → models |
|---|---|---|---|
| `prompts/modifiers/delivering-work.md` | `Do ordinary work as asked` | `koo` | `CLAUDE_CODE_BISON_CAIRN` ?? (`c_e` \|\| `bison_cairn`) → Opus 5, Fable 5.1, Mythos 5.1 |
| `prompts/modifiers/corrections.md` | `Avoid unnecessary or excessive self-correction` | `Soo` | `larch_cistern` → Opus 5 |
| `prompts/modifiers/tool-restraint.md` | `unless the user, a CLAUDE.md file, or a skill asks for it` | `Avt` (section `opus5_reduced_delegation`) | `Upn` && `tengu_slate_bittern` (default **true**); skipped when `heron_brook` text already contains it → Opus 5 |

All three carry local omissions or rewording — see intentional-omissions.md. The
Fable 5.1 bundle's other sections (`# Writing for the user`, the turn-updates line, and
the autonomy block) are omissions #19–#21.

## Model metadata (env.ts)

Model metadata is resolved dynamically from two tables in `src/env.ts`. Neither is
covered by the extraction script — grep the downloaded native binary directly.

| Local location | What | How to find in the binary |
|---|---|---|
| `MODEL_TABLE` | id / display name / knowledge cutoff for every model | `strings -n 8 package/claude \| grep -o 'id:"claude-[a-z0-9-]*"[^}]\{0,220\}' \| grep -i 'display_name\|knowledge_cutoff' \| sort -u`, or the Python snippet below |
| `MODEL_TABLE` `capabilities` | `lean-prompt`, `mid-conv-system` | Derive from the predicates above, not the array verbatim: Mythos 5 is lean despite an empty array; Opus 4.8 lists `mid_conv_system` but never gets mid-conv wording; Sonnet 5 lists it but is on the standard path |
| `MODEL_TABLE` `promptBundle` | which bundle modifiers `--base auto` attaches | The entry's `*_prompt_bundle` capability, mapped through the bundle table above |
| `MODEL_ALIASES` | `opus` / `sonnet` / `haiku` / `fable` → newest of family | `grep -a -o '{fable:"[^}]*}' package/claude \| sort -u` — this is upstream's `latest_per_family` |

```python
import re
data = open("package/claude","rb").read()
i = data.find(b'capabilities:["effort"', 190_000_000)
seg = data[data.rfind(b'models:[',0,i):data.find(b'aliases:{',i)+1500].decode("utf8","replace")
for m in re.finditer(r'\{id:"(claude-[a-z0-9-]+)",family:"\w+",display_name:"([^"]+)",knowledge_cutoff:"([^"]*)".*?capabilities:\[([^\]]*)\]', seg):
    print(*m.groups(), sep=" | ")
```

The alias map is also what upstream feeds into the "most recent Claude models" line
in every base's `env.md`, so the two move together: when a family gets a new
flagship, update `MODEL_ALIASES`, `MODEL_TABLE`, and that prompt line in one pass.
Keep longer ids ahead of their prefixes in `MODEL_TABLE` (`claude-opus-5-5` before
`claude-opus-5`): dated-variant matching takes the first entry whose id is a prefix.

To get the binary without re-running the extraction script (which cleans up after
itself): `npm pack @anthropic-ai/claude-code-linux-x64@<version> && tar xzf *.tgz`
→ `package/claude`.

## Notes

- **Marker stability:** Markers are chosen from natural-language prompt text that's
  unlikely to change between versions. If a marker stops matching, the upstream
  section was likely rewritten — investigate manually. A marker that only appears in
  a `var` (not a `function`) also reads as NOT FOUND, because the script resolves
  markers to their enclosing function.
- **Function names change every release.** Don't rely on them. Use the markers.
- **Variable substitution:** Upstream uses minified names like `${e7}` for "Bash",
  `${H9}` for "Grep", etc. When comparing, treat these as equivalent to the
  spelled-out tool names in local files.
- **Native-binary bundle layout (v2.1.121+):** the binary contains the prompt
  text twice — once in a fragmented string-table region (each prompt sentence
  stored as its own length-prefixed string) and once as JS function bodies. The
  extraction script searches for the *last* sentinel occurrence to land in the
  function-body region. If extraction returns mostly NOT FOUND, the bundle layout
  has likely changed again — re-investigate by `grep`-ing the binary for marker
  offsets to confirm where function bodies live.
- **Chunked bundle (v2.1.286):** the JS is split into many `/$bunfs/root/chunk-*.js`
  modules (each starts after a `// @bun @bytecode` banner), and **each chunk has its own
  minified namespace** — `EG`, `Fh`, `R` mean different things in different chunks. To
  resolve a gate called from the prompt chunk, read that chunk's
  `import{…}from"/$bunfs/root/chunk-xxx.js"` header to find the exporting chunk, then
  take the definition whose chunk `export{…}` lists the name. A naive "first
  `function EG(` in the file" lands in OpenTelemetry.
- **Capability lookup:** `Fh(model, cap)` returns `true` when the capability is listed,
  `undefined` (not `false`) when it isn't — which is why fallbacks like "Mythos 5 is
  lean by name" exist.
