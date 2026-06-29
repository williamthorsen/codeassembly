---
name: kb-edit
description: Mutate an existing knowledge-base note via a single mechanical operation — bump updated, mark verified, replace tags, append a section, or supersede with another note
user-invocable: true
---

# Edit an existing knowledge-base note

Apply a single mutation to a note that already exists in a knowledge base. A bundled helper does the mechanical work — it resolves the writable KB the note belongs to, loads the note, runs alias canonicalization where relevant, validates the resulting frontmatter against the destination schema, and writes atomically. You do the judgment work — pick which operation fits the change, supply the new tags or body content, and decide when supersession is the right move.

The split is deliberate: the helper is narrow and mechanical; the operation choice is wide and judgment-driven. Treat the helper as a guardrail. It refuses to write into a KB marked `readonly: true`, refuses notes that fail schema validation after the edit, and refuses to leave a half-finished supersede chain.

For new notes, use `kb-add`. For finding notes, use `kb-retrieve`. For periodic vault hygiene (broken wikilinks, stale verifications, tag drift), use `kb-curate` once it ships.

**Announce at start:** "Using kb-edit to {short description of the change}."

## Arguments

| Argument                    | Description                                                                                     | Required |
| --------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| `<path>`                    | Path to the existing note. Absolute or relative to the cwd. `--add-addressed-by` takes several. | Yes      |
| `--bump-updated`            | Set `updated:` to today (UTC). Body unchanged.                                                  | One op   |
| `--verify`                  | Set `last-verified:` to today (UTC). Does **not** bump `updated:`.                              | One op   |
| `--append`                  | Append the body read from stdin after a separating blank line, and bump `updated:`.             | One op   |
| `--retag <list>`            | Replace `tags:` with the comma-separated list. Canonicalizes; does **not** bump `updated:`.     | One op   |
| `--add-addressed-by <refs>` | Append comma-separated reference(s) to each target's `addressed-by` list; bumps `updated:`.     | One op   |
| `--supersede-with <p>`      | Mark `<path>` superseded by `<p>`. Two-file atomic write; both notes bump `updated:`.           | One op   |

A value-bearing flag accepts both `--retag node,react` and `--retag=node,react`. Exactly one operation flag is required per invocation; combining two is rejected with `invalid-args`. The note body for `--append` is read from stdin to EOF; empty or whitespace-only stdin is rejected.

`--add-addressed-by` is the one multi-target operation: it accepts one or more `<path>` arguments and appends the same reference(s) to each note's `addressed-by` list. References are free-form (a KB wikilink or relative path, a commit SHA, a PR/issue ref, or a URL); they are stored verbatim and de-duplicated after any existing entries. A reference value that is empty or contains only separators is rejected with `invalid-args`. (Because the value is comma-separated, a reference that itself contains a comma, such as a rare URL, would be split; use one invocation per such reference. A reference that begins with `--` is otherwise read as the next flag, so pass it with the inline `--add-addressed-by=<ref>` form.)

### KB selection

The destination knowledge base is inferred by walking up from the note's directory for a `.kb/` folder. There is no `--kb` override: the note's location is the selector. A KB whose `kb.yaml` entry sets `readonly: true` refuses writes with `readonly-kb`.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb`.

## Modes

- **Default mode**: Pick the operation, decide tags/body, present the proposed change to the user, run the helper after confirmation.
- **Auto mode (`--auto`)**: Pick the operation and supply inputs without asking. The agent never prompts in this mode.

The `--auto` flag is consumed by you, not by the bundled helper; it controls whether you present the proposal for confirmation before invoking the helper.

## Operations: when to use each

- **`--bump-updated`** — A non-empirical edit to the note (rewording, restructuring, fact correction) where the body change is made out of band and you want only to refresh `updated:`. Rare on its own; mostly an audit-trail tool.
- **`--verify`** — You reran the note's instructions or re-confirmed its claims and they still hold. Use this for the "I just checked; still good" path. Does not bump `updated:` because nothing about the content changed.
- **`--append`** — Add a section to an existing note. The new content lands after the existing body with a separating blank line. Use for accumulating findings or extending a list.
- **`--retag`** — Replace the tag list wholesale (canonicalized through the KB's `.kb/tag-aliases.yaml`). Use when tags drift, when restructuring categories, or when remediating findings from `kb-curate`. Curatorial: it changes how a record is found, not what it asserts, so it leaves `updated:` unchanged.
- **`--add-addressed-by`** — Record what addressed a problem: append references to a record's recall-facing `addressed-by` list so the response surfaces when the record is later recalled. Pass several target notes to link one response (a fix note, a PR, a commit) to all the incidents it resolved in a single run.
- **`--supersede-with`** — Mark an old note deprecated and point it at its replacement. Both notes' frontmatter is updated atomically (best-effort): old gains `superseded-by` and the `deprecated` tag, new gains `supersedes`. Use when a note is no longer canonical but should remain discoverable.

## Update semantics: which operations bump `updated:`

`updated:` records the last _substantive_ change to a record — what it asserts, its body, or its lifecycle state. Operations that make no such change leave `updated:` untouched. Classify each new operation against this rule deliberately rather than in isolation:

- **Bump `updated:`** (substantive change): `--append` (body change), `--add-addressed-by` (records a response relation), and `--supersede-with` (lifecycle-state change). `--bump-updated` is the explicit escape hatch for an out-of-band edit made elsewhere.
- **Leave `updated:` unchanged** (no substantive change): `--retag` (curatorial: reorganizes findability only) and `--verify` (re-confirmation: content is unchanged).

## Process

### 1. Pick the operation

Identify which single operation fits the change. If you have several distinct changes in mind (retag and append, say), they become two separate invocations — the helper rejects combined flags.

### 2. Survey context with kb-retrieve when warranted

For `--retag` and `--supersede-with`, run `{skill:kb-retrieve}` for related notes first: a retag is often a vault-wide pattern change worth applying consistently, and a supersession needs the right successor identified.

### 3. Present the proposal (default mode)

In default mode, present the note path, the operation, and the operation-specific inputs (new tags, addition body, supersede target). Wait for confirmation or a redirect. In auto mode, skip this step.

### 4. Invoke the helper

`--bump-updated`, `--verify`, `--retag`, and `--supersede-with` take no stdin:

```bash
node "$(dirname "$SKILL_PATH")/kb-edit.mjs" <path> --bump-updated
node "$(dirname "$SKILL_PATH")/kb-edit.mjs" <path> --verify
node "$(dirname "$SKILL_PATH")/kb-edit.mjs" <path> --retag "tag1,tag2"
node "$(dirname "$SKILL_PATH")/kb-edit.mjs" <old-path> --supersede-with <new-path>
```

`--add-addressed-by` appends to one or more notes — comma-separate multiple references, space-separate multiple target notes:

```bash
node "$(dirname "$SKILL_PATH")/kb-edit.mjs" <path> --add-addressed-by "[[how-to-avoid-x]]"
node "$(dirname "$SKILL_PATH")/kb-edit.mjs" <event-1> <event-2> --add-addressed-by "[[how-to-avoid-x]],#789"
```

`--append` reads the new body from stdin. A heredoc keeps the addition legible without quoting gymnastics:

```bash
cat <<'EOF' | node "$(dirname "$SKILL_PATH")/kb-edit.mjs" <path> --append
A new section appended to the existing body. The helper adds a separating
blank line and bumps `updated:` to today (UTC).
EOF
```

Or, when the skill directory is known:

```bash
node {harness_home_dir}/skills/kb-edit/kb-edit.mjs Tools/tmux/tmux-insights.md --verify
```

### 5. Handle the result

The helper prints a JSON object to stdout. On success the payload carries `ok: true`, the resolved `kb`, the written `frontmatter`, and (for `--retag`) the `originalTags` / `canonicalTags` audit trail. `--supersede-with` returns `oldFrontmatter` and `newFrontmatter` for both files.

`--add-addressed-by` returns a `results` array — one entry per target note, in the order supplied — instead of a single-note payload. Each entry carries its own `ok`: a success entry has the written `frontmatter`, a failure entry has an `error` code and `message`. Its top-level `ok: true` means the batch ran (no usage or system error), not that every record succeeded; inspect each `results[]` entry to see which notes were written and which failed, then re-run for the failures (the append de-duplicates, so re-running is safe).

On failure, `ok: false` plus a categorical `error` code:

| Code                       | What it means                                                                                                                                                         | What to do                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `invalid-args`             | Missing/extra flags, unknown flag, a second path for a single-target op, empty `--append` stdin, an empty `--add-addressed-by` reference list, or cross-KB supersede. | Correct the invocation. The message names the specific defect.                                    |
| `no-kb-resolvable`         | The note's path is not inside any discoverable `.kb/`.                                                                                                                | Confirm the path; the note may live outside a KB or the wrong path was supplied.                  |
| `note-not-found`           | The path does not exist.                                                                                                                                              | Confirm the path. For `--supersede-with`, the _new_ path gets `supersede-target-missing` instead. |
| `note-parse`               | The note's frontmatter block is malformed (YAML error, missing block, non-map).                                                                                       | Repair the frontmatter manually; the helper will not rewrite a note it cannot parse.              |
| `schema-validation`        | The resulting frontmatter does not pass the KB's schema.                                                                                                              | Inspect `details.findings`; either fix the source note or declare a schema change.                |
| `readonly-kb`              | The note resolves into a KB marked `readonly: true` in `kb.yaml`.                                                                                                     | Switch to a writable KB or update the registry entry intentionally.                               |
| `supersede-target-missing` | The `--supersede-with` target path does not exist.                                                                                                                    | Create the new note (use `kb-add`) before issuing the supersession.                               |
| `partial-supersede`        | A `--supersede-with` write committed one side, the rollback also failed.                                                                                              | Inspect both paths in `details`; resolve the inconsistency manually before retrying.              |

System failures (out-of-disk, permission denied) print to stderr and exit non-zero. They are out of band and never appear as a structured `error` code.

## Completion

A mutated note at the reported path (two notes for `--supersede-with`, or every successfully-written target for `--add-addressed-by`) with frontmatter valid per the destination KB's schema, plus the canonicalization audit trail for `--retag` so the user can verify which alias tags were rewritten.
