---
name: review-branch
description: Perform code review of branch changes against a diff base
user-invocable: true
---

# Review branch

Act as a conscientious code reviewer for the changes on the current branch relative to a diff base. Review the diff `merge-base(HEAD, <diff-base>)..HEAD`.

This skill is the canonical home of the shared review process. `review-pr` invokes the same review process after resolving platform-specific inputs (PR metadata, HEAD verification, ticket from PR linked issues, PR description as a second specification source).

## Arguments

| Flag                          | Effect                                                                                                                                                         | Default                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `--diff-base=<ref>`           | Reference to diff against. Reviews `merge-base(HEAD, <ref>)..HEAD`.                                                                                            | Project's default branch                          |
| `--ticket=<source>`           | Ticket or requirements to check the implementation against. Resolved per [ticket source resolution](../_data/ticket-source-resolution.md).                     | Auto-resolved (see below)                         |
| `--spec-source=remote\|local` | When the ticket is auto-resolved (i.e. `--ticket` is omitted), force which candidate wins instead of the recency comparison. Ignored when `--ticket` is given. | Newest of the remote issue vs. the local snapshot |

## Process

> **When invoked by `review-pr`:** Steps 1–3 are already complete — `review-pr` already invoked the bundled session-context deriver and the platform delegate resolved `merge_base_sha` and `spec_sources`. Begin at step 4 with these values in scope.

1. **Get context**: Invoke `node {platform_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `default_branch`, `ticket_id`, `ticket_ref`, `platform`, `project_slug`, and `artifact_base_dir` from it.
2. **Resolve diff base** — If `--diff-base=<ref>` was provided, use `<ref>`; otherwise use `default_branch`. Compute the merge-base SHA once: `git merge-base HEAD <diff-base>`. Use this SHA for the diff command in step 5.
3. **Resolve specification sources** — Produce a list of spec sources (each a `{ source_type, label, content, criteria?, provenance, last_updated }` record). `provenance` is `remote` (a live platform fetch, never stale) or `local_snapshot` (a frozen plan-time artifact that can lag the contract); `last_updated` is the source's last-modified timestamp (ISO 8601), or null when the platform does not expose one.
   - **Explicit `--ticket=<source>`**: Resolve per [ticket source resolution](../_data/ticket-source-resolution.md) and append as a `ticket` source. A fetched platform issue is `remote` with its `updatedAt` as `last_updated`; a file or plain-text source is `local_snapshot` with `last_updated` null when unknown. `--spec-source` does not apply on this path.
   - **Auto-resolve** (when `--ticket` is omitted): resolve up to two candidates and choose between them.
     - _Remote candidate_: when `ticket_id` is non-null and resolves to a platform ticket (use `platform` from step 1), fetch the remote issue per [ticket source resolution](../_data/ticket-source-resolution.md#auto-resolve) — but substitute the local fallback below for that section's "ask the user" terminal step. Its `last_updated` is the issue's `updatedAt`.
     - _Local candidate_: the most recent `*_ticket.md` under `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`. Its `last_updated` is the filename's `YYYYMMDD-HHMMSSZ` prefix converted to ISO 8601 (`YYYY-MM-DDTHH:MM:SSZ`), so it shares the remote candidate's format; treat an unparseable prefix as no local candidate. (The artifact filename keeps the compact form per `artifact-conventions.md`; only the recorded `last_updated` is normalized.)
     - _Selection_:
       - If `--spec-source=remote|local` is set, use that candidate. If the named candidate is unavailable (e.g. `--spec-source=local` with no snapshot, or `--spec-source=remote` with a failed/offline fetch or null `ticket_id`), stop and report the missing source rather than silently using the other side — an explicit instruction must not be redirected to the wrong contract. State the remedy (drop the flag to re-enable recency) in the message.
       - Otherwise use the candidate with the newer `last_updated`. Both values are ISO 8601 at the same precision, so they compare chronologically as plain strings — no per-format parsing. On an exact tie, prefer the remote candidate (canonical for the owned-ticket majority).
       - If only one candidate exists, use it. This single-candidate fallback also covers a failed/offline remote fetch and a null `ticket_id`.
     - Append the chosen candidate as a `ticket` source carrying its `provenance` and `last_updated`. When both candidates existed, hold the rejected candidate's `last_updated` in-process for the divergence note — it rides working memory, not the `spec_sources` record, because resolution here and rendering in the output are the same `review-branch` invocation (which is also why the record needs only one `last_updated`).
   - **No source available**: Leave the list empty. The "Specification compliance" section is omitted from the output.

   `review-pr` may pass additional sources (notably the PR description as `pr_description`). The list is the canonical input for the "Specification compliance" section regardless of who populated it.

4. **Read prior artifacts**: If a run directory exists for this ticket, read all artifacts chronologically for context (including any prior dispositions).
5. **Analyze changes**: `git diff <merge-base-sha>..HEAD`.
6. **Review thoroughly** following the guidelines below.
7. **Assign a score** out of 10.
8. **Resolve frontmatter fields** before saving; see [Frontmatter resolution](#frontmatter-resolution).
9. **Save the review** per the [Saving](#saving) section.
10. **Present next steps**: After saving, present a next-steps prompt following [next-steps-after-review](../_data/next-steps-after-review.md). Supply recommendation context: finding counts and categories from the review, whether specification compliance gaps or unplanned work were identified, and the consistency verdict when the consistency section was rendered. The next-steps prompt is interactive output only and is not saved in the review artifact.

## Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`. Resolve `$author` from `git log --format='%an' "$default_branch..HEAD" | sort -u | paste -sd, -` (unique authors of the commits under review). When invoked via `review-pr`, set `$pr_url` to `pr_metadata.url` (the PR under review); otherwise leave it empty.

Run via Bash:

```bash
{platform_home_dir}/scripts/resolve-frontmatter.sh \
  --skill review-branch \
  --interactive true \
  --model "$MODEL_ID" \
  --extra "author=$author" \
  ${pr_url:+--override "pr=$pr_url"}
```

Prepend the script's output verbatim to the artifact body. The `pr:` field is populated only when reviewing a PR (via `review-pr`); a direct ticket-only review omits it.

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
- Legacy: `{F,W,T,R,S}{n}-L` — observation in pre-existing code, not authored in this change. Same severity letter as the equivalent author finding; number it from that letter's shared sequence first, then append `-L` as a marker (e.g., after `F1`, `F2`, the first legacy FIXME is `F3-L`)

## Output format

Section-header icons (🚨, ⚠️, 📋, 🧠, ☝️, 🔍) come from the canonical [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix); render them as shown. Each finding under "Action required" and "Areas for improvement" follows the canonical per-finding template shown below — see [`review-criteria` § Finding references](../review-criteria/SKILL.md#finding-references) for the rules governing the `Location:` field.

When `ticket_ref` is null (no ticket on the branch), omit the `{ticket_ref}: ` portion so the heading reads naturally without it — e.g., `# Code review: {description}`.

The artifact begins with YAML frontmatter conforming to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the field-resolution steps in the [Frontmatter resolution](#frontmatter-resolution) section above. Pass `--extra "author=$author"` to the script to populate the review-artifact `author` field.

The body following the frontmatter has this structure:

```markdown
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

**Source:** {Render the source's `provenance` and `last_updated` (echoed verbatim — `last_updated` is already ISO 8601) so the reader knows what contract this section measured against — e.g. `remote issue (last updated 2026-06-07T01:56:34Z)`, ``local snapshot `20260606-090337Z_..._ticket.md` (last updated 2026-06-06T09:03:37Z)``, or `local source (last updated …)` for an explicit file/plain-text `--ticket` that has no snapshot filename. Omit the "last updated" clause when `last_updated` is null.}

{When this ticket source was auto-resolved and a competing candidate existed whose `last_updated` differs, add a divergence callout: ⚠️ name both timestamps, state which side this review measured against, and point to `--spec-source=remote|local` to re-resolve against the other. Omit when there was no competing candidate (single source, explicit `--ticket`, or a `pr_description` source).}

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

## Specification consistency

{Omit this entire section when fewer than two spec sources are present. Otherwise assess semantic alignment across (ticket, PR description, implementation) and render the verdict line plus the per-aspect table below. Include the Details subsection only for rows whose Summary cell cannot carry the explanation.}

🔗 **Consistency:** {emoji} `{verdict}`

| #   | Aspect         | Ticket  | PR description | Implementation             | Summary                                   |
| --- | -------------- | ------- | -------------- | -------------------------- | ----------------------------------------- |
| D1  | {aspect label} | {state} | {state}        | {ticket-state}, {PR-state} | {one-line synthesis with concrete values} |

Verdict scale (max across all rows): 🟢 `none` (all three aligned — section omitted entirely) / 🟠 `partial` (implementation aligns with one spec source but not the other) / 🔴 `severe` (implementation aligns with neither, or sources contradict each other on a central claim).

Cell encoding:

| Symbol      | Meaning                                          |
| ----------- | ------------------------------------------------ |
| ⚫ baseline | This source defines the aspect on this row       |
| ⚪ omitted  | This source has no claim to compare              |
| 🟢 {ref}    | Matches the named reference (semantic alignment) |
| 🟠 {ref}    | Partial mismatch with the named reference        |
| 🔴 {ref}    | Severe mismatch with the named reference         |

Baseline-selection rule: ticket is baseline when it mentions the aspect; otherwise PR description is baseline. An aspect introduced only by the implementation belongs in `## Specification compliance`'s "Unplanned work" sub-section, not here.

Implementation-column ordering: always `{ticket-state}, {PR-state}` regardless of which is meaningful, so the scan rhythm stays consistent across rows.

Only rows where at least two of (ticket, PR description, implementation) differ belong in this table. Fully-aligned aspects appear in `## Specification compliance`, not here.

### Details

**D{n} — {aspect label}.** {Free-form prose elaborating aspects the Summary cell cannot fit. Each entry keys to a `D{n}` ID for cross-reference.}

Paraphrasing is not divergence — evaluate semantic alignment, not textual overlap. The verdict is independent of the F/W/T/R/S finding scheme; author-actionable issues continue to surface through the existing finding sections. When the PR description defers entirely to the ticket (e.g., a body of just `Closes #N` and a sentence), render a single Details paragraph noting the deferral and emit verdict `none` with no table.
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
   - **If an active run exists** (the most recent run directory whose `run-index.json` has `context.branch` matching the current branch AND `completedAt` is absent): Save into it
   - **If no active run exists**: Create a new run directory named `{timestamp}-interactive` where timestamp matches this review's timestamp
3. Save: `{run-dir}/{timestamp}_reviewer_review.md`

Each review is a separate artifact in the run directory. Do not append to existing files — the chronological sequence of files is the history.
