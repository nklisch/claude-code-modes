# Fragment Map

Maps each local file to its upstream counterpart in the extracted system prompt.

## How to use

The **Marker** column contains a unique string that appears in the upstream function
body. Search the extracted file for this marker to find the right section. The
**Function** column is the minified name as of the last validated version — it will
change between releases but the marker should remain stable.

## Prompt fragments

| Local file | Upstream section | Marker | Function (v2.1.133) | Expected diff |
|---|---|---|---|---|
| `prompts/base/intro.md` | Intro | `an interactive agent that helps users` | `y0A` | Verbatim match (local prepends "You are Claude Code...") |
| `prompts/base/system.md` | System Rules | `rendered in a monospace font using the CommonMark specification` | `h0A` | Verbatim match |
| `prompts/base/doing-tasks.md` | Doing Tasks | `primarily request you to perform software engineering tasks` | `I0A` | Intentional omissions (see intentional-omissions.md); local additions for read-before-edit, no-time-estimates, diagnose-failures |
| `prompts/base/actions.md` | Executing Actions with Care | `Carefully consider the reversibility and blast radius` | `S0A` | Merged from upstream cautious variant; autonomous variant removed (agency axis handles behavioral difference) |
| `prompts/base/tools.md` | Using Your Tools | `planning your work and helping the user track your progress` | `R0A` | Local paraphrase — same intent as upstream but rewritten for tool-agnostic phrasing |
| `prompts/base/tone.md` | Tone and Style | `file_path:line_number to allow the user to easily navigate` | `u0A` | Intentional omission: "short and concise" (see intentional-omissions.md) |
| `prompts/base/text-output.md` | Text Output | `Assume users can't see most tool calls` | `Z0A` | Verbatim match (Z0A returns this content when `kf(H)` is false — default for most models) |
| `prompts/base/session-guidance.md` | Session Guidance | `Session-specific guidance` | `x0A` | Local paraphrase; intentionally skips feature-flagged `/schedule` offer guidance |
| `prompts/base/env.md` | Environment Info | `You have been invoked in the following environment` | `F0A` | Local additions: gitStatus block, tool-result note. Worktree notice via `{{WORKTREE_NOTICE}}` |

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
