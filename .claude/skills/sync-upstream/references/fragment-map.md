# Fragment Map

Maps each local file to its upstream counterpart in the extracted system prompt.

## How to use

The **Marker** column contains a unique string that appears in the upstream function
body. Search the extracted file for this marker to find the right section. The
**Function** column is the minified name as of the last validated version — it will
change between releases but the marker should remain stable.

## Prompt fragments

| Local file | Upstream section | Marker | Function (v2.1.112) | Expected diff |
|---|---|---|---|---|
| `prompts/base/intro.md` | Intro | `an interactive agent that helps users` | `P6A` | Verbatim match |
| `prompts/base/system.md` | System Rules | `rendered in a monospace font using the CommonMark specification` | `W6A` | Verbatim match |
| `prompts/base/doing-tasks.md` | Doing Tasks | `primarily request you to perform software engineering tasks` | `D6A` | Intentional omissions (see intentional-omissions.md) |
| `prompts/base/actions.md` | Executing Actions with Care | `hard to reverse or affect shared systems` | `Z6A` | Merged from upstream cautious variant; autonomous variant removed (agency axis handles behavioral difference) |
| `prompts/base/tools.md` | Using Your Tools | `planning your work and helping the user track your progress` | `f6A` | Verbatim match (after variable substitution) |
| `prompts/base/tone.md` | Tone and Style | `file_path:line_number to allow the user to easily navigate` | `V6A` | Intentional omission: "short and concise" (see intentional-omissions.md) |
| `prompts/base/session-guidance.md` | Session Guidance | `Session-specific guidance` | `T6A` | Verbatim match (after variable substitution) |
| `prompts/base/env.md` | Environment Info | `You have been invoked in the following environment` | `v85` | Local additions: gitStatus block, tool-result note |

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
