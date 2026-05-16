---
name: review-branch
description: Perform code review of branch changes against a diff base
user-invocable: true
---

# Review branch

Act as a conscientious code reviewer for the changes on the current branch relative to a diff base. Review the diff `merge-base(HEAD, <diff-base>)..HEAD`.

This skill is the canonical home of the shared review process. `review-pr` invokes the same review process after resolving platform-specific inputs (PR metadata, HEAD verification, ticket from PR linked issues, PR description as a second specification source).

## Arguments

| Flag                | Effect                                                                                                                                     | Default                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `--diff-base=<ref>` | Reference to diff against. Reviews `merge-base(HEAD, <ref>)..HEAD`.                                                                        | Project's default branch  |
| `--ticket=<source>` | Ticket or requirements to check the implementation against. Resolved per [ticket source resolution](../_data/ticket-source-resolution.md). | Auto-resolved (see below) |

## Process

> **When invoked by `review-pr`:** Steps 1–3 are already complete — `review-pr` performed `get-session-context` and the platform delegate resolved `merge_base_sha` and `spec_sources`. Begin at step 4 with these values in scope.

1. **Get context** using `get-session-context` to obtain `default_branch`, `ticket_id`, `ticket_ref`, `project_slug`, and `artifact_base_dir`.
2. **Resolve diff base** — if `--diff-base=<ref>` was provided, use `<ref>`; otherwise use `default_branch`. Compute the merge-base SHA once: `git merge-base HEAD <diff-base>`. Use this SHA for the diff command in step 5.
3. **Resolve specification sources** — produce a list of spec sources (each a `{ source_type, label, content, criteria? }` record):
   - **Explicit `--ticket=<source>`**: resolve per [ticket source resolution](../_data/ticket-source-resolution.md) and append as a `ticket` source.
   - **Auto-resolve**: if `--ticket` was omitted and `ticket_id` is non-null, scan `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` for the most recent `*_ticket.md` file and append it as a `ticket` source.
   - **No source available**: leave the list empty. The "Specification compliance" section is omitted from the output.

   `review-pr` may pass additional sources (notably the PR description as `pr_description`). The list is the canonical input for the "Specification compliance" section regardless of who populated it.

4. **Read prior artifacts** — if a run directory exists for this ticket, read all artifacts chronologically for context (including any prior dispositions).
5. **Analyze changes**: `git diff <merge-base-sha>..HEAD`.
6. **Review thoroughly** following the guidelines below.
7. **Assign a score** out of 10.
8. **Resolve frontmatter fields** before saving — see [Frontmatter resolution](#frontmatter-resolution).
9. **Save the review** per the [Saving](#saving) section.
10. **Present next steps** — after saving, present a next-steps prompt following [next-steps-after-review](../_data/next-steps-after-review.md). Supply recommendation context: finding counts and categories from the review, and whether specification compliance gaps or unplanned work were identified. The next-steps prompt is interactive output only and is not saved in the review artifact.

## Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

<!-- include: ../../_partials/frontmatter-via-script.md -->

- `provenance.skill`: always `review-branch`.
- `provenance.isInteractive`: always `true`.
- `provenance.model`: the model identifier you are executing under. Read this from your system-prompt environment block — the line `model named ... model ID is ...`.
<!-- /include -->

## Review guidelines

Comprehensive review — trace logic, verify edge cases, assess architectural impact.

### Criteria

Read and apply the `review-criteria` skill (`../review-criteria/SKILL.md`). Additionally for this skill:

- Reference associated Jira ticket if integrations.jira.enabled is true
- Look at commit messages for context
- Suggest refactoring if new code adds tech debt

## Issue numbering

Uniquely number all issues for easy reference. See [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix) for full category criteria and criticality mapping.

- FIXMEs: `F{n}` — critical, must fix before merge
- Warnings: `W{n}` — questionable decisions, may block merge
- TODOs: `T{n}` — should fix, can wait for next PR
- Recommendations: `R{n}` — advisable but discretionary
- Suggestions: `S{n}` — optional improvement
- Legacy: `{F,W,T,R,S}{n}-L` — observation in pre-existing code, not authored in this change. Uses the same severity letter as the equivalent author finding plus a `-L` suffix (e.g., `F3-L`, `W2-L`)

## Output format

Section-header icons (🚨, ⚠️, 📋, 🧠, ☝️, 🔍) come from the canonical [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix); render them as shown. Each finding under "Action required" and "Areas for improvement" follows the canonical per-finding template shown below — see [`review-criteria` § Finding references](../review-criteria/SKILL.md#finding-references) for the rules governing the `Location:` field.

When `ticket_ref` is null (no ticket on the branch), omit the `{ticket_ref}: ` portion so the heading reads naturally without it — e.g., `# Code review: {description}`.

The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema:

```markdown
---
provenance:
  skill: review-branch
  timestamp: '{ISO 8601 UTC timestamp}'
  baseSha: '{short SHA of origin/main, omit if unresolvable}'
  isInteractive: true
  model: '{model id}'
ticket_id: '{ticket ID from session context, omit if null}'
ticket_ref: '{ticket display ref, omit if null}'
branch: '{branch name from session context}'
commit: '{short hash of HEAD}'
pr: '{full PR URL, omit if not resolved}'
author: '{commit author(s)}'
---

# Code review: {ticket_ref}: {description in imperative mood}

## Summary of changes

## Strengths

### Code quality

### Documentation

### Test quality

## Action required

### FIXMEs 🚨

{Critical issues - regressions, broken functionality, unsafe code, type safety violations}

#### F1: {title}

- **Location:** `path/to/file.ts:42`
- **Severity:** critical
- **Description:** {what is wrong}
- **Recommendation:** {what to do}

(The same shape applies to every finding in the sections below — only the prefix letter, the `Severity:` value, and the section bucket change. Legacy findings use `-L` suffix IDs and `(legacy)` severity values.)

### Warnings ⚠️

{Questionable decisions that may block merge - require justification}

### TODOs 📋

{Should-fix changes that can wait for next PR}

## Areas for improvement

### Recommendations 🧠

{Advisable but discretionary - don't count against score}

### Suggestions ☝️

{Optional improvements - don't count against score}

### Legacy observations 🔍

{Observations in pre-existing code, using severity-tagged IDs with `-L` suffix (e.g., `F3-L`, `T2-L`). Frame as future opportunities, don't count against score}

## Technical assessment

## Conclusion

Score: X/10

## Specification compliance

{Omit this entire section when the spec-source list is empty. Otherwise render one subsection per source. With one source the section is structurally identical to the prior single-ticket "Ticket compliance" output; with two or more, repeat the subsection per source.}

### {source.label}

{The label is `{source_type}: {short identifier}` — for example, `ticket: #553` or `pr_description: PR #1024`. Use the source's natural identifier so a reader can tell at a glance which specification a row evaluates against.}

#### Acceptance criteria

| #   | Criterion        | Status   | Notes   |
| --- | ---------------- | -------- | ------- |
| 1   | {criterion text} | {status} | {notes} |

Status values: ✅ Met, ⚠️ Partial, ❌ Not addressed

Extract criteria from whatever structure the source uses (numbered lists, checkboxes, prose). If the source does not have clearly delimited acceptance criteria, derive them from its problem statement and solution description. PR descriptions typically expose criteria as the bullet items under `## What`, `## Summary`, or an explicit acceptance-criteria heading; fall back to the description body when no list is present.

#### Unplanned work

{Bullet list of changes not traceable to any criterion in this source. If none, state "None."}

#### Assessment

{1-2 sentence summary of alignment between the implementation and this source.}
```

## Scoring

- Score only the quality of changes in the reviewed scope
- Do not deduct for failure to address pre-existing issues
- Legacy observations don't affect score

## Saving

### Path resolution

Use `artifact_base_dir`, `project_slug`, and `ticket_id` from step 1.

Follow [artifact conventions](../_data/artifact-conventions.md).

### Run artifact

The review is saved as a run artifact: `{timestamp}_reviewer_review.md`

1. Resolve ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`. When `ticket_id` is null, auto-generate one in the format `{YYYYMMDD}-{4 random hex}` per [artifact conventions](../_data/artifact-conventions.md#ticket-id) — never construct a path with a literal `null` segment.
2. Find or create a run directory:
   - **If an active run exists** (the most recent run directory whose `run-index.json` has `context.branch` matching the current branch AND `completedAt` is absent): save into it
   - **If no active run exists**: create a new run directory named `{timestamp}-interactive` where timestamp matches this review's timestamp
3. Save: `{run-dir}/{timestamp}_reviewer_review.md`

Each review is a separate artifact in the run directory. Do not append to existing files — the chronological sequence of files is the history.
