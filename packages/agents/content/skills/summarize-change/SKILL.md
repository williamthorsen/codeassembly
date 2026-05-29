---
name: summarize-change
description: Analyze changes and generate structured summary for PR preparation
user-invocable: true
---

# Summarize change

Analyze the current branch's changes since diverging from the default branch.

## Process

1. **Gather context**:
   - Invoke `node {platform_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch`, `ticket_id`, and `ticket_ref` from the manifest JSON emitted on stdout; consult [work-types.json](../_data/work-types.json).

2. **Analyze changes**:

```bash
git diff $DEFAULT_BRANCH...HEAD
```

Check commit messages for additional context.

3. **Compose title**: `{ticket_ref} {title}` (or just `{title}` when `ticket_ref` is null)
   - The ticket reference appears in the change summary title (for identification) but must never appear in commit titles (per `commit` skill)

4. **Compose `## Why` and `## Details`** per the output format below. These sections you compose directly. The lede (`## What`) comes from a separate dispatch in step 6, so the factual substance must exist first.

5. **Resolve tier**: From [work-types.json](../_data/work-types.json), look up the `tier` (`public`, `internal`, or `process`) corresponding to the resolved `type`. If `type` could not be inferred, default the tier to `internal`.

6. **Compose `## What` via `changelog-writer`**: Dispatch the `changelog-writer` subagent via the {tool:Task} tool in `write` mode. Pass a prompt of this shape:

   ```
   mode: write
   type: {resolved type}
   tier: {tier from step 5}
   scope: {resolved scope, if available}
   outcome: |
     {What the reader will experience, do, or know differently — outcome-framed, not a diff enumeration. Derived from the substance composed in step 4.}
   context: |
     {Optional supporting facts the subagent may need for accuracy.}
   ```

   Lead with the outcome before naming files: `outcome` is the reader-facing delta the lede must carry; `context` is supplementary material the subagent may draw on for accuracy.

   Use the subagent's returned text verbatim as the content of the `## What` section. Do not edit, prepend to, or append to it. The subagent owns voice; you own facts. If the subagent returns an error message (missing-field or similar), correct the dispatch inputs and retry.

   Verbatim governs voice ownership, not quality acceptance. If the returned text fails the doctrine — a banned identifier, a mechanism-shaped sentence, or generic puffery — correct the dispatch inputs (chiefly re-articulating `outcome`) and redispatch rather than shipping the failure. Correct the inputs and redispatch; do not hand-edit the subagent's output.

7. **Save** per the [Saving](#saving) section.

If expected information is missing, stop and ask the developer.

## Output format

The artifact begins with a single YAML frontmatter block that unifies canonical fields from the canonical schema with change-summary-specific consumer fields; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the consumer-field extensions in [Change-summary frontmatter](../_data/artifact-conventions.md#change-summary-frontmatter). Ordering: `provenance:` first, then top-level canonical fields, then consumer fields. `commit:` and `ticket_id:` appear exactly once each. Field-resolution steps live in the [Canonical-field resolution](#canonical-field-resolution) section below.

The body following the frontmatter has this structure:

```markdown
# {ticket_ref} {title}

## What

{Content returned by the `changelog-writer` dispatch in Process step 6. Use the returned text verbatim; do not edit, prepend, or append. If it fails the doctrine, correct the dispatch inputs and redispatch (see step 6).}

## Why

{1-3 sentences describing the _motivation_ — what was wrong, what was missing, or what new capability is needed. Frame in terms of consequences (for users, the codebase, future work), not mechanism. Mechanism belongs in `## Details`.

Bad: "The retry helper used a fixed backoff schedule with no shared state, so concurrent requests stacked up against the upstream rate limiter."
Good: "Heavy-upload sessions were intermittently failing as users hit the upstream API's rate limit."}

## Details

### 🎉 Features

{Only if applicable}

### 🐛 Bug fixes

{Only if applicable}

### ♻️ Refactoring

{Only if applicable}

### 🧪 Tests

{Only if applicable}

### 📦 Dependencies

{Only if applicable}
```

## Guidance

- When `ticket_ref` is null (no ticket on the branch), omit the `{ticket_ref} ` portion of the heading and the title so they read naturally without it.
- The change summary follows **newspaper style** — progressive disclosure from most to least essential: `## What` is the headline (outcome in plain language), `## Why` is the context (motivation and background), `## Details` is the full story (implementation mechanics)
- Ignore auto-formatter and lint-fix changes
- Omit inapplicable Details subsections
- Subsection headings use `{emoji} {label}` from the matching [work-types.json](../_data/work-types.json) `types[]` entry. For any subsection not enumerated in the example template above, look up the entry by work-type key and use its `emoji` and `label`.
- Order Details subsections per `work-types.json` tier order: public → internal → process.
- Prefix any individual `## Details` entry that describes a breaking change with `🚨 **Breaking:** ` (drawn from `markers.breaking` in [work-types.json](../_data/work-types.json), rendered as `{emoji} **{label}:** `). Trigger conditions: A commit with the `!` breaking marker (e.g., `feat!`) or a `BREAKING CHANGE:` footer. The entry stays under its work-type subsection — the prefix tags it inline rather than relocating it to a separate section.
- `## What` and `## Why` are required; Details subsections are optional
- Never list automated checks (formatting, linting, typechecking, unit tests) in a test plan. They run automatically in CI.

## Frontmatter inference

The single YAML frontmatter block carries both canonical identity fields from the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) and change-summary-specific consumer fields read by downstream PR-creation skills (`create-pr`, `create-gh-pr`, `create-bitbucket-pr`). `commit:` and `ticket_id:` appear exactly once and serve a dual role: canonical identity fields that downstream consumers may also read.

The block is structured as:

1. `provenance:` block (canonical nested fields: `skill`, `timestamp`, `baseSha`, `isInteractive`, `model`).
2. Top-level canonical fields: `branch`, `commit`, `pr`, `ticket_id`, `ticket_ref`, `run_id`.
3. Consumer extensions: `title`, `scope`, `type`.

### Canonical-field resolution

Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`. Resolve `$title`, `$scope`, and `$type` from the consumer-field inference below (omit a flag if the corresponding value cannot be inferred unambiguously).

Run via Bash:

```bash
{platform_home_dir}/scripts/resolve-frontmatter.sh \
  --skill summarize-change \
  --interactive true \
  --model "$MODEL_ID" \
  --extra "title=$title" \
  ${scope:+--extra "scope=$scope"} \
  ${type:+--extra "type=$type"}
```

The `${var:+--extra "key=$var"}` form expands to the flag only when `$var` is non-empty, so an unresolved `scope` or `type` is naturally omitted from the emitted frontmatter.

Prepend the script's output verbatim to the artifact body.

### Consumer-field inference

- **`title`**: The bare title without the `ticket_ref` prefix. If `ticket_ref` is `#409` and the heading is `#409 Rationalize PR creation skills`, the title is `Rationalize PR creation skills`. When `ticket_ref` is null, the title is the entire heading text.
- **`scope`** and **`type`**: Infer from the commit message prefixes on the branch. Examine commits between the default branch and HEAD. If all (or the dominant majority of) commits share the same scope and type prefix (e.g., `agents|feat:`), use those values. If commits use mixed scopes or types with no clear dominant value, omit the ambiguous field entirely from the frontmatter. Omission is safe — downstream consumers treat missing fields as absent and skip the corresponding resolution step.

## As a PR description

When used as a PR description, include **from `## What` onward only** — omit the H1 title and metadata block.

## Saving

### Path resolution

Invoke `node {platform_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `artifact_base_dir`, `project_slug`, and `ticket_id` from the manifest JSON emitted on stdout (the same invocation in step 1 already populated the manifest file, so this is a fast-path read).

Follow [artifact conventions](../_data/artifact-conventions.md).

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Artifact type: `change-summary`. Filename format:

```
{timestamp}_{slug}_change-summary.md
```

Example: `20250121-1530Z_auto-share-exception_change-summary.md`
