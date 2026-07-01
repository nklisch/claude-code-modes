# Fragment Map

Maps each local file to its upstream counterpart in the extracted system prompt.

## How to use

The **Marker** column contains a unique string that appears in the upstream function
body. Search the extracted file for this marker to find the right section. The
**Function** column is the minified name as of the last validated version — it will
change between releases but the marker should remain stable.

## Prompt fragments

| Local file | Upstream section | Marker | Function (v2.1.197) | Expected diff |
|---|---|---|---|---|
| `prompts/base/intro.md` | Intro | `an interactive agent that helps users` | `Uam` | Verbatim match (local prepends "You are Claude Code...") |
| `prompts/base/system.md` | System Rules | `rendered in a monospace font using the CommonMark specification` | `Fam` | Verbatim match |
| `prompts/base/doing-tasks.md` | Doing Tasks | `primarily request you to perform software engineering tasks` | `jam` | Intentional omissions (see intentional-omissions.md); local additions for read-before-edit, no-time-estimates, diagnose-failures, verified-vs-assumed (upstream gates the last behind `tengu_verified_vs_assumed`, local carries it unconditionally) |
| `prompts/base/actions.md` | Executing Actions with Care | `Carefully consider the reversibility and blast radius` | `Gam` | Merged from upstream cautious variant; autonomous variant removed (agency axis handles behavioral difference). v2.1.197 added a new gated `"compact"` branch (`G9o(e)==="compact"`) with a much shorter version — not tracked, same precedent as other gated variants (see intentional-omissions.md) |
| `prompts/base/tools.md` | Using Your Tools | `planning your work and helping the user track your progress` | `Wam` | Local paraphrase — same intent as upstream but rewritten for tool-agnostic phrasing. v2.1.197 added a new gated branch (`$I()`) returning task-tool-only guidance — not tracked (see intentional-omissions.md) |
| `prompts/base/tone.md` | Tone and Style | `file_path:line_number to allow the user to easily navigate` | `zam` | Intentional omission: "short and concise" (see intentional-omissions.md) |
| `prompts/base/text-output.md` | Text Output | `Assume users can't see most tool calls` | `kam` | Verbatim match against the **default branch** (the third/final branch as of v2.1.197). Two gated variants exist ahead of it and are deliberately not tracked (see intentional-omissions.md): the long "Communicating with the user" block (first branch), and a new one-line `yh(e)`-gated branch ("Write code that reads like the surrounding code...") added in v2.1.197 |
| `prompts/base/session-guidance.md` | Session Guidance | `Session-specific guidance` | `Vam` | Local paraphrase; intentionally skips feature-flagged `/schedule` offer guidance. An unidentified gated branch `qam(n)` (behind `e.has(is)`) exists in v2.1.197 — did not fire in the live session used for the v2.1.197 sync, content still unknown (see intentional-omissions.md) |
| `prompts/base/env.md` | Environment Info | `You have been invoked in the following environment` | `elm` | Local additions: gitStatus block, tool-result note. Worktree notice via `{{WORKTREE_NOTICE}}`. Model-family line tracks upstream (updated for Sonnet 5 in v2.1.197). A new field `NRn()??null` was added between OS Version and the model line in v2.1.197 — did not fire in the live session used for the sync, content still unknown (see intentional-omissions.md) |

## Model metadata (env.ts)

| Local location | What | Upstream location | How to find |
|---|---|---|---|
| `src/env.ts:35` MODEL_NAME | Display model name | Near model ID mapping | Search for the human-readable name near opus/sonnet strings |
| `src/env.ts:36` MODEL_ID | Model identifier | `eO7` object or similar | Search for `claude-opus-4` pattern |
| `src/env.ts:37` KNOWLEDGE_CUTOFF | Knowledge cutoff date | `FlK` function or similar | Search for month/year strings near model ID conditionals |

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
