# Fragment Map

Maps each local file to its upstream counterpart in the extracted system prompt.

## How to use

The **Marker** column contains a unique string that appears in the upstream function
body. Search the extracted file for this marker to find the right section. The
**Function** column is the minified name as of the last validated version — it will
change between releases but the marker should remain stable.

## Prompt fragments

| Local file | Upstream section | Marker | Function (v2.1.198) | Expected diff |
|---|---|---|---|---|
| `prompts/base/intro.md` | Intro | `an interactive agent that helps users` | `Wfm` | Verbatim match (local prepends "You are Claude Code...") |
| `prompts/base/system.md` | System Rules | `rendered in a monospace font using the CommonMark specification` | `qfm` | Verbatim match |
| `prompts/base/doing-tasks.md` | Doing Tasks | `primarily request you to perform software engineering tasks` | `Vfm` | Intentional omissions (see intentional-omissions.md); local additions for read-before-edit, no-time-estimates, diagnose-failures, verified-vs-assumed (upstream gates the last behind `tengu_verified_vs_assumed`, local carries it unconditionally) |
| `prompts/base/actions.md` | Executing Actions with Care | `Carefully consider the reversibility and blast radius` | `zfm` | Merged from upstream cautious variant; autonomous variant removed (agency axis handles behavioral difference). v2.1.197 added a gated `"compact"` branch (`Qzo(e)==="compact"` in v2.1.198) with a much shorter version — not tracked, same precedent as other gated variants (see intentional-omissions.md). v2.1.198 added two sentences to the default branch's final paragraph (reversible-step preference; `git status` before discard-y commands) — tracked |
| `prompts/base/tools.md` | Using Your Tools | `planning your work and helping the user track your progress` | `Kfm` | Local paraphrase — same intent as upstream but rewritten for tool-agnostic phrasing. v2.1.197 added a gated branch (`zI()` in v2.1.198) returning task-tool-only guidance — not tracked (see intentional-omissions.md) |
| `prompts/base/tone.md` | Tone and Style | `file_path:line_number to allow the user to easily navigate` | `Jfm` | Intentional omission: "short and concise" (see intentional-omissions.md) |
| `prompts/base/text-output.md` | Text Output | `Assume users can't see most tool calls` | `Pfm` | Verbatim match against the **default branch** (the third/final branch as of v2.1.197). Two gated variants exist ahead of it and are deliberately not tracked (see intentional-omissions.md): the long "Communicating with the user" block (first branch), and a one-line branch ("Write code that reads like the surrounding code...") added in v2.1.197 |
| `prompts/base/session-guidance.md` | Session Guidance | `Session-specific guidance` | `Xfm` | Local paraphrase; intentionally skips feature-flagged `/schedule` offer guidance. An unidentified gated branch (`Yfm(n)` in v2.1.198, was `qam(n)` in v2.1.197, behind `e.has(is)`) — did not fire in the live sessions used for the v2.1.197/v2.1.198 syncs, content still unknown (see intentional-omissions.md) |
| `prompts/base/env.md` | Environment Info | `You have been invoked in the following environment` | `omm` | Local additions: gitStatus block, tool-result note. Worktree notice via `{{WORKTREE_NOTICE}}` — as of v2.1.198 this includes the second worktree-only line (shared stash-stack warning, upstream const `lgc`), tracked in `src/env.ts`. Model-family line tracks upstream. An unknown field (`BDn()??null` in v2.1.198, was `NRn()??null`) sits between OS Version and the model line since v2.1.197 — did not fire in live sessions, content still unknown (see intentional-omissions.md) |

## Model metadata (env.ts)

| Local location | What | Upstream location | How to find |
|---|---|---|---|
| `src/env.ts:47` MODEL_NAME | Display model name | Model table entries (`display_name:"Fable 5"`) | Search for the human-readable name near fable/opus strings |
| `src/env.ts:48` MODEL_ID | Model identifier | Model table | Search for `claude-fable-5` / `claude-opus-4` pattern |
| `src/env.ts:49` KNOWLEDGE_CUTOFF | Knowledge cutoff date | Model table (`knowledge_cutoff:"January 2026"`) | Search for `knowledge_cutoff` or month/year strings near model IDs |

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
