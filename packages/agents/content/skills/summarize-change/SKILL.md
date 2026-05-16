---
name: summarize-change
description: Analyze changes and generate structured summary for PR preparation
user-invocable: true
---

# Summarize change

Analyze the current branch's changes since diverging from the default branch.

## Process

1. **Gather context**:
   - Use `get-session-context` to obtain `default_branch`, `ticket_id`, and `ticket_ref`; consult [work-types.json](../_data/work-types.json).

2. **Analyze changes**:

```bash
git diff $DEFAULT_BRANCH...HEAD
```

Check commit messages for additional context.

3. **Compose title**: `{ticket_ref} {title}` (or just `{title}` when `ticket_ref` is null)
   - The ticket reference appears in the change summary title (for identification) but must never appear in commit titles (per `commit` skill)

4. **Write description** per the output format below

5. **Save** per the [Saving](#saving) section

If expected information is missing, stop and ask the developer.

## Output format

The artifact begins with a single YAML frontmatter block that unifies canonical fields from the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) with change-summary-specific consumer fields documented at [Change-summary frontmatter](../_data/artifact-conventions.md#change-summary-frontmatter). Ordering: `provenance:` first, then top-level canonical fields, then consumer fields. `commit:` and `ticket_id:` appear exactly once each.

```markdown
---
provenance:
  skill: summarize-change
  timestamp: '{ISO 8601 UTC timestamp}'
  baseSha: '{short SHA of origin/main, omit if unresolvable}'
  isInteractive: true
  model: '{model id}'
branch: '{branch name from session context}'
commit: '{short hash of HEAD}'
pr: '{full PR URL, omit if not resolved}'
ticket_id: '{ticket ID from session context, omit if null}'
ticket_ref: '{ticket display ref, omit if null}'
run_id: '{run id, omit when not in an orchestrated run}'
title: '{bare title without `ticket_ref` prefix}'
scope: '{scope inferred from commit prefixes, or omitted if ambiguous}'
type: '{work type inferred from commit prefixes, or omitted if ambiguous}'
---

# {ticket_ref} {title}

## What

{This section becomes a changelog entry — and, for public-tier work (per [work-types.json](../_data/work-types.json)), a release note. Mechanism, internal naming, and refactor mechanics belong in `## Details`.}

<!-- include: ../../_partials/voice-checklist.md / -->

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
- Prefix any individual `## Details` entry that describes a breaking change with `🚨 **Breaking:** ` (drawn from `markers.breaking` in [work-types.json](../_data/work-types.json), rendered as `{emoji} **{label}:** `). Trigger conditions: a commit with the `!` breaking marker (e.g., `feat!`) or a `BREAKING CHANGE:` footer. The entry stays under its work-type subsection — the prefix tags it inline rather than relocating it to a separate section.
- `## What` and `## Why` are required; Details subsections are optional
- Never list automated checks (formatting, linting, typechecking, unit tests) in a test plan. They run automatically in CI.

## Frontmatter inference

The single YAML frontmatter block carries both canonical identity fields from the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) and change-summary-specific consumer fields read by downstream PR-creation skills (`create-pr`, `create-gh-pr`, `create-bitbucket-pr`). `commit:` and `ticket_id:` appear exactly once and serve a dual role: canonical identity fields that downstream consumers may also read.

The block is structured as:

1. `provenance:` block (canonical nested fields: `skill`, `timestamp`, `baseSha`, `isInteractive`, `model`).
2. Top-level canonical fields: `branch`, `commit`, `pr`, `ticket_id`, `ticket_ref`, `run_id`.
3. Consumer extensions: `title`, `scope`, `type`.

### Canonical-field resolution

- **`provenance.skill`**: always `summarize-change`.
- **`provenance.timestamp`**: current UTC time in ISO 8601 format.
- **`provenance.baseSha`**: run `git rev-parse --short origin/main`; omit if it fails.
- **`provenance.isInteractive`**: `true` for direct invocations.
- **`provenance.model`**: the model identifier executing this skill (read from the environment block in the system prompt).
- **`branch`**: from session context (`branch_name`).
- **`commit`**: `git rev-parse --short HEAD`.
- **`pr`**: resolve via [`_data/pr-resolution.md`](../_data/pr-resolution.md). Read `platform` from session context, then run the matching snippet via the Bash tool with `timeout: 5000`:
  - **GitHub:** `gh pr list --head "$BRANCH" --state all --json url --jq '.[0].url // empty'`
  - **Bitbucket:** the `curl` snippet in `pr-resolution.md` against `https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests?q=source.branch.name="{branch}"`, extracting `.values[0].links.html.href`.

  On non-empty output, write the URL to `pr:`. On empty output, non-zero exit, or timeout, omit the `pr:` line and emit `Note: PR lookup failed; proceeding without pr field.` in the agent text output.

- **`ticket_id`** and **`ticket_ref`**: from session context. Omit when null.
- **`run_id`**: emit only when invoked from within an orchestrated run.

### Consumer-field inference

- **`title`**: The bare title without the `ticket_ref` prefix. If `ticket_ref` is `#409` and the heading is `#409 Rationalize PR creation skills`, the title is `Rationalize PR creation skills`. When `ticket_ref` is null, the title is the entire heading text.
- **`scope`** and **`type`**: Infer from the commit message prefixes on the branch. Examine commits between the default branch and HEAD. If all (or the dominant majority of) commits share the same scope and type prefix (e.g., `agents|feat:`), use those values. If commits use mixed scopes or types with no clear dominant value, omit the ambiguous field entirely from the frontmatter. Omission is safe — downstream consumers treat missing fields as absent and skip the corresponding resolution step.

## As a PR description

When used as a PR description, include **from `## What` onward only** — omit the H1 title and metadata block.

## Saving

### Path resolution

Use `get-session-context` to obtain `artifact_base_dir`, `project_slug`, and `ticket_id`.

Follow [artifact conventions](../_data/artifact-conventions.md).

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Artifact type: `change-summary`. Filename format:

```
{timestamp}_{slug}_change-summary.md
```

Example: `20250121-1530Z_auto-share-exception_change-summary.md`
