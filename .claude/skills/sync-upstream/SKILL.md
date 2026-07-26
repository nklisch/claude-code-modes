---
name: sync-upstream
description: >
  Compare this project's base prompts and model metadata against a Claude Code
  release. Extracts and greps the upstream prompt assembly, finds both drift in
  tracked fragments and content we never tracked at all, classifies each change
  as intentional omission or real drift, and applies approved updates.
  Use when user says "sync upstream", "check for drift", "new CC version",
  or runs /sync-upstream.
user-invocable: true
allowed-tools: Bash, Read, Edit, Grep, Glob, Write, AskUserQuestion
---

# Sync Upstream

Keep `prompts/base/`, `prompts/lean/`, the prompt-bundle modifiers, and the model
table in `src/env.ts` aligned with what Claude Code actually sends.

This is an investigation, not a checklist. The sections below describe what has to
be true when you're done and the tools available to get there — how you sequence
them is yours to judge. Two things are not yours to judge: **confirm the target
version before doing the work**, and **get changes approved before applying them**.

## What "aligned" means

Three prompt shapes exist upstream, assembled by one function that forks on a
model-capability predicate. All three matter here:

| Shape | Who gets it | Tracked in |
|---|---|---|
| standard head | models without `lean_prompt` | `prompts/base/` |
| lean head | models with `lean_prompt` | `prompts/lean/` |
| shared tail | **everyone**, both heads | duplicated in both bases |
| bundle sections | models with `opus_5_prompt_bundle` | `prompts/modifiers/` |

Capabilities also drive `--base auto`, so the model table in `src/env.ts` is part
of the sync, not a side note: a new flagship changes which base users get by default.

[references/fragment-map.md](references/fragment-map.md) holds the current
local↔upstream mapping and the marker strings to find each piece.
[references/intentional-omissions.md](references/intentional-omissions.md) holds
every difference that is deliberate.

## Ground truth and how to reach it

`bun run scripts/extract-upstream-prompt.ts [version]` pulls named prompt functions
into `upstream-prompts/`. It is the fastest path **for what it covers**, which is
the standard head and not much else. It does not extract the shared tail, the lean
head, the bundle sections, or model capabilities.

For anything it misses, grep the release binary directly:

```bash
npm pack @anthropic-ai/claude-code-linux-x64@<version> && tar xzf *.tgz   # → package/claude
```

It's ~275 MB, so slice by byte offset in Python rather than running wide regexes:

```python
data = open("package/claude","rb").read()
i = data.find(b"<marker text>")
print(data[i-4000:i+4000].decode("utf8","replace"))
```

Useful anchors: search a distinctive sentence to land in the assembler, then read
outward. `strings -n 8 package/claude | grep -o 'id:"claude-[a-z0-9-]*"[^}]\{0,220\}'`
gets the model table with its `capabilities` arrays.

**Diffing two extractions is the cheapest first move.** If a previous version's file
is still in `upstream-prompts/`, diff it against the new one — most releases are
pure minifier churn (`ja_` → `aO_`) with one or two real sentence changes, and the
diff isolates them in seconds. Ignore renamed symbols, template-variable syntax, and
whitespace; they are noise.

**You may be running under one of these prompts yourself.** If so, your own system
prompt is a live sample of what a real session receives — worth more than inference
about which branch fires. Use it to confirm, and say so when you report.

## Finding what isn't on the map

The mapping files are a record of what we already know. Diffing only against them
can never surface content we never tracked — that blind spot is exactly how the
shared tail sections went missing from `prompts/base/` for several releases.

So each sync, spend some effort in the other direction: **read the assembler's
return value and account for every section it can emit.** For each one, land in a
category and be able to say which:

- tracked in a local fragment
- documented as an intentional omission
- genuinely inapplicable — session-, environment-, or experiment-gated (a flag that
  fires on one model, a background-session block, an output-style hook)
- **unaccounted for** — a real gap, whether or not the current release changed it

Watch for gates that turn out to mean something other than their name suggests. A
branch filed as "some terser variant" may be a whole prompt shape; a `"compact"`
mode may be reachable on exactly one model in one experiment. When a gate's meaning
is unresolved, resolving it is usually higher-value than diffing another fragment,
because an unresolved gate can hide an entire category of content.

## Classifying a difference

- **Intentional omission** — matches a documented entry. Leave it; if the upstream
  wording moved, update the quote in the reference so future diffs still match.
- **Local addition** — we carry content upstream doesn't (gitStatus block,
  tool-agnostic rewrites of tool names). Leave it.
- **Drift** — upstream changed and we haven't. Candidate to apply.
- **Unaccounted** — from the sweep above. Report it separately; it usually needs a
  new fragment or a new omission entry, which is a decision, not a mechanical edit.

New content that lands in axis territory is a *new omission*, not drift. The test:
would carrying it in a base contradict any value of the agency, quality, or scope
axes? Read the axis fragments and check rather than guessing — `# Delivering work`
looked like neutral guidance until its scope sentences were read against
`scope/unrestricted`.

## Reporting and applying

Report grouped by classification, with the specific changed text for each drift
item, and an explicit count of what didn't change so the user can see coverage. Then
get approval — `AskUserQuestion` with a multi-select works well when there are
several independent items.

When applying:

- Edit the local fragments. Changes to the shared tail apply to **both** bases.
- Model table changes usually travel together: a new flagship touches `MODEL_TABLE`,
  `MODEL_ALIASES`, and the "most recent Claude models" line in every base's `env.md`.
- New fragments need registering in `scripts/generate-prompts.ts` **and**
  `src/embedded-prompts.test.ts`, plus the manifest and the fragment counts in the
  count tests and `CLAUDE.md`.
- Bump the validated-against version in `CLAUDE.md` and `README.md`.
- Regenerate embedded prompts and run `bun test`.

## Keeping the references current

The reference files are the durable output of every sync — more so than the prompt
edits, which git already records. Before finishing, make sure they reflect what you
learned: new mappings and refreshed minified names in
[fragment-map.md](references/fragment-map.md); new or newly-grounded omissions in
[intentional-omissions.md](references/intentional-omissions.md).

Record resolved mysteries, not just changes. "`vE` is the lean predicate" and
"`YFc` returns false outright, so that section is dead code" are the findings that
save the next sync the most time, and neither shows up as a diff.
