---
name: summarize-change
description: Analyze changes and generate structured summary for PR preparation
user-invocable: true
---

# Summarize change

Analyze the current branch's changes since diverging from the default branch.

## Process

1. **Gather context**:
   - Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch`, `ticket_id`, and `ticket_ref` from the manifest JSON emitted on stdout; consult [work-types.json](../_data/work-types.json).

2. **Analyze changes**:

```bash
git diff $DEFAULT_BRANCH...HEAD
```

Check commit messages for additional context.

3. **Compose title**: Compose the change string per [`title-voice.md`](../_data/title-voice.md).
   - The change summary's own heading prefixes that string with the ticket reference for identification: `{ticket_ref} {title}`, or just `{title}` when `ticket_ref` is null.

4. **Compose `## Why` and `## Details`** per the output format below. The lede (`## What`) arrives from a dispatch in step 5, so `## Details` must exist before the audit can run.

5. **Compose `## What` via `lede-drafter`**: Resolve the tier by looking up the change's work type (inferred per [Consumer-field inference](#consumer-field-inference)) in [work-types.json](../_data/work-types.json); where the type could not be inferred, use `internal`. Then dispatch the `{subagent:lede-drafter}` subagent via the {tool:Task} tool with this block:

   ```dispatch
   type: {resolved type}
   tier: {resolved tier}
   ticket-source: {ticket URL or reference}
   ```

   **The block carries scalars only, and only these keys.** Omit `type` and `ticket-source` where they are unresolved; add `rejection: {code}` on a redispatch and on no other dispatch. Compose no prose into it: the drafter gathers every fact itself, and a sentence written here would seed the draft with this session's weighting, which is the failure the fresh context exists to avoid. A content test fails the build on a line that is not a `key: value` scalar and on a key outside this set, so a new flag is added deliberately rather than by a passing test.

   Take the drafter's `## Lede` section as the content of `## What`, and read its `## Report` for any source it could not reach.

6. **Save** per the [Saving](#saving) section.

**Audit before saving.** This audit applies to the `## What` returned in step 5, before step 6 writes the artifact. Read the draft in full and judge it on two counts: the test below, and the three rejection codes beneath it. What you may edit is bounded by the test alone.

- **The test.** No fact appears in both `## What` and `## Details`.
- **The repair.** Cut the fact from `## What`. Where the fact appears nowhere else, move it into `## Details` instead of deleting it. Deleting and moving down are the whole of your authority.

Every other failure is a redispatch, never an edit. Repeat step 5 with `rejection:` set to the code that names the failure -- `voice` for a figurative verb or an invented term, `subject` for an opening that describes the system's state rather than the change, `unsupported-claim` for a sentence claiming more than the diff supports. Do not rewrite the prose yourself: the draft came from a fresh context for the same reason this audit is mechanical, and rewriting it here restores the weighting the dispatch removed.

Redispatch at most twice. After a second redispatch fails, save the artifact with the last draft and report the unresolved code to the developer.

If expected information is missing, stop and ask the developer.

## Output format

The artifact begins with a single YAML frontmatter block that unifies canonical fields from the canonical schema with change-summary-specific consumer fields; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the consumer-field extensions in [Change-summary frontmatter](../_data/artifact-conventions.md#change-summary-frontmatter). Ordering: `provenance:` first, then top-level canonical fields, then consumer fields. `commit:` and `ticket_id:` appear exactly once each. Field-resolution steps are stated in the [Canonical-field resolution](#canonical-field-resolution) section below.

The body following the frontmatter has this structure:

```markdown
# {ticket_ref} {title}

## What

{The lede, returned by the `lede-drafter` dispatch in Process step 5. Repair it by deleting a duplicated fact or moving it into `## Details`; redispatch for anything else.}

## Why

{1-3 sentences describing the _motivation_: what was wrong, what was missing, or what new capability is needed. Frame in terms of consequences (for users, the codebase, future work), not mechanism. Mechanism belongs in `## Details`.

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
- The change summary follows **newspaper style**, progressive disclosure from most to least essential: `## What` is the lede, `## Why` is the context (motivation and background), `## Details` is the full story (implementation mechanics)
- Ignore auto-formatter and lint-fix changes
- Omit inapplicable Details subsections
- Subsection headings use `{emoji} {label}` from the matching [work-types.json](../_data/work-types.json) `types[]` entry. For any subsection not enumerated in the example template above, look up the entry by work-type key and use its `emoji` and `label`.
- Order Details subsections per `work-types.json` tier order: public → internal → process.
- Prefix any individual `## Details` entry that describes a breaking change with `🚨 **Breaking:** ` (drawn from `markers.breaking` in [work-types.json](../_data/work-types.json), rendered as `{emoji} **{label}:** `). Trigger conditions: A commit with the `!` breaking marker (e.g., `feat!`) or a `BREAKING CHANGE:` footer. The entry stays under its work-type subsection: The prefix tags it inline rather than relocating it to a separate section. The prefix tags the entry and does not carry the migration: `## Details` reaches no consumer, so a breaking change states what the consumer does in a `Migration:` paragraph in `## What`.
- `## What` and `## Why` are required; Details subsections are optional
- Never list automated checks (formatting, linting, typechecking, unit tests) in a test plan. They run automatically in CI.

<!-- include: ../../_partials/prose-line-breaks.md / -->

## Frontmatter inference

The single YAML frontmatter block contains both canonical identity fields from the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) and change-summary-specific consumer fields read by downstream PR-creation skills (`create-pr`, `create-gh-pr`, `create-bitbucket-pr`). `commit:` and `ticket_id:` appear exactly once and serve a dual role: canonical identity fields that downstream consumers may also read.

The block is structured as:

1. `provenance:` block (canonical nested fields: `skill`, `timestamp`, `baseSha`, `isInteractive`, `model`).
2. Top-level canonical fields: `branch`, `commit`, `pr`, `ticket_id`, `ticket_ref`, `run_id`.
3. Consumer extensions: `title`, `scope`, `type`.

### Canonical-field resolution

Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`. Resolve `$title`, `$scope`, and `$type` from the consumer-field inference below (omit a flag if the corresponding value cannot be inferred unambiguously).

Run via Bash:

```bash
{harness_home_dir}/scripts/resolve-frontmatter.sh \
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
- **`scope`** and **`type`**: Infer from the commit message prefixes on the branch. Examine commits between the default branch and HEAD. If all (or the dominant majority of) commits share the same scope and type prefix (e.g., `agents|feat:`), use those values. If commits use mixed scopes or types with no clear dominant value, omit the ambiguous field entirely from the frontmatter. Omission is safe: Downstream consumers treat missing fields as absent and skip the corresponding resolution step.

## As a PR description

When used as a PR description, include **from `## What` onward only**; omit the H1 title and metadata block.

## Saving

### Path resolution

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `artifact_base_dir`, `project_slug`, and `ticket_id` from the manifest JSON emitted on stdout (the same invocation in step 1 already populated the manifest file, so this is a fast-path read).

Follow [artifact conventions](../_data/artifact-conventions.md).

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Artifact type: `change-summary`. Filename format:

```
{timestamp}_{slug}_change-summary.md
```

Example: `20250121-1530Z_auto-share-exception_change-summary.md`
