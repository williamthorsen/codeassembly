---
name: review-branch
description: Perform code review of branch changes against a diff base
user-invocable: true
dependencies:
  skills:
    - review-criteria
---

# Review branch

Act as a conscientious code reviewer for the changes on the current branch relative to a diff base. Review the diff `merge-base(HEAD, <diff-base>)..HEAD`.

This skill is the canonical home of the shared review process. `review-pr` invokes the same review process after resolving platform-specific inputs (PR metadata, HEAD verification, ticket from PR linked issues, PR description as a second specification source).

## Arguments

| Flag                          | Effect                                                                                                                                                                | Default                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `--diff-base=<ref>`           | Reference to diff against. Reviews `merge-base(HEAD, <ref>)..HEAD`.                                                                                                   | Project's default branch                          |
| `--ticket=<source>`           | Ticket or requirements to check the implementation against. Resolved per [ticket source resolution](../_data/ticket-source-resolution.md).                            | Auto-resolved (see below)                         |
| `--spec-source=remote\|local` | When the ticket is auto-resolved (i.e. `--ticket` is omitted), force which candidate is selected instead of the recency comparison. Ignored when `--ticket` is given. | Newest of the remote issue vs. the local snapshot |

## Process

> **When invoked by `review-pr`:** Steps 1–3 are already complete: `review-pr` already invoked the bundled session-context deriver and the platform delegate resolved `merge_base_sha` and `spec_sources`. Begin at step 4 with these values in scope.

1. **Get context**: Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `default_branch`, `ticket_id`, `ticket_ref`, `scm`, `project_slug`, and `artifact_base_dir` from it.
2. **Resolve diff base**: If `--diff-base=<ref>` was provided, use `<ref>`; otherwise use `default_branch`. Compute the merge-base SHA once: `git merge-base HEAD <diff-base>`. Use this SHA for the diff command in step 5.
3. **Resolve specification sources**: Produce a list of spec sources (each a `{ source_type, label, content, criteria?, provenance, last_updated }` record). `provenance` is `remote` (a live platform fetch, never stale) or `local_snapshot` (a frozen plan-time artifact that can lag the contract); `last_updated` is the source's last-modified timestamp (ISO 8601), or null when the platform does not expose one.
   - **Explicit `--ticket=<source>`**: Resolve per [ticket source resolution](../_data/ticket-source-resolution.md) and append as a `ticket` source. A fetched platform issue is `remote` with its `updatedAt` as `last_updated`; a file or plain-text source is `local_snapshot` with `last_updated` null when unknown. When the source resolves to a URL, persist it per [Stored ticket URL](../_data/ticket-source-resolution.md#stored-ticket-url). `--spec-source` does not apply on this path.
   - **Auto-resolve** (when `--ticket` is omitted): Resolve up to two candidates and choose between them.
     - _Remote candidate_: When `ticket_id` is non-null and resolves to a platform ticket (use `scm` from step 1), fetch the remote issue per [ticket source resolution](../_data/ticket-source-resolution.md#auto-resolve), but substitute the local fallback below for that section's "ask the user" terminal step. Its `last_updated` is the issue's `updatedAt`.
     - _Local candidate_: The most recent `*_ticket.md` under `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`. Its `last_updated` is the filename's `YYYYMMDD-HHMMSSZ` prefix converted to ISO 8601 (`YYYY-MM-DDTHH:MM:SSZ`), so it shares the remote candidate's format; if the prefix is unparseable, treat the local candidate as unavailable. (The artifact filename keeps the compact form per `artifact-conventions.md`; only the recorded `last_updated` is normalized.) Read its frontmatter as well as its filename: `copies_remote` decides the selection below, per [ticket frontmatter](../_data/artifact-conventions.md#ticket-frontmatter).
     - _Selection_:
       - If `--spec-source=remote|local` is set, use that candidate. If the named candidate is unavailable (e.g. `--spec-source=local` without a snapshot, or `--spec-source=remote` with a failed/offline fetch or null `ticket_id`), stop and report the missing source rather than silently using the other side: An explicit instruction must not be redirected to the wrong contract. State the remedy (drop the flag to re-enable recency) in the message.
       - Otherwise, if a remote candidate exists and the local candidate's frontmatter sets `copies_remote: true`, use the remote candidate. The snapshot's body is a copy of the ticket of record, so the remote contains at least the content that the snapshot froze, and the snapshot's later write time records the copying rather than a newer contract. A snapshot that does not make that claim falls through to the comparison below.
       - Otherwise use the candidate with the newer `last_updated`. Because both values are ISO 8601 at the same precision, they compare chronologically as plain strings, without per-format parsing. On an exact tie, prefer the remote candidate (canonical for the owned-ticket majority).
       - If only one candidate exists, use it. This single-candidate fallback also covers a failed/offline remote fetch and a null `ticket_id`.
     - Append the chosen candidate as a `ticket` source with its `provenance` and `last_updated`. When the chosen source is the local snapshot and a remote candidate existed, keep that rejected candidate's `content` in-process for the divergence check. Keep raw content rather than extracted criteria: The comparison runs at render time under the extraction rule that the compliance table states, so both candidates are read by one rule. It stays in working memory, not in the `spec_sources` record, because resolution here and rendering in the output are the same `review-branch` invocation (which is also why the record needs only one `last_updated`). When the chosen source is the remote candidate, retain nothing; the callout never appears on that branch.
   - **No source available**: Leave the list empty. The "Specification compliance" section is omitted from the output.

   `review-pr` may pass additional sources (notably the PR description as `pr_description`). The list is the canonical input for the "Specification compliance" section regardless of who populated it.

4. **Read prior artifacts**: When `ticket_id` is not null, invoke `node {harness_home_dir}/scripts/resolve-review-run.mjs active --ticket-dir {artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` via Bash. The helper prints `{ "runDir": <path or null> }`: the ticket's active run, per [artifact conventions](../_data/artifact-conventions.md#run-directories). When `runDir` is not null, read all artifacts in it chronologically for context (including any prior dispositions).
5. **Analyze changes**: `git diff <merge-base-sha>..HEAD`.
6. **Review thoroughly** following the guidelines below.
7. **Challenge your own findings**: Re-read each finding and delete every one that you would not defend to a skeptical author asking "why does this matter?" A review may legitimately end with zero findings.
8. **Assign a score** out of 10.
9. **Resolve frontmatter fields** before saving; see [Frontmatter resolution](#frontmatter-resolution).
10. **Save the review** per the [Saving](#saving) section.
11. **Present next steps**: After saving, present a next-steps prompt following [next-steps options](#next-steps-options). Supply recommendation context: finding counts and categories from the review, which criteria the specification compliance section marked in conflict with the implementation, and the consistency verdict when the consistency section was rendered. The next-steps prompt is interactive output only and is not saved in the review artifact.

## Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Source `{model_id}` from your system-prompt environment block: the line `model named ... model ID is ...`. Resolve `{author}` from `git log --format='%an' "{default_branch}..HEAD" | sort -u | paste -sd, -` (unique authors of the commits under review). When invoked via `review-pr`, take `{pr_url}` from `pr_metadata.url` (the PR under review); otherwise it does not have a value.

Run via Bash, writing each resolved value into the call as literal text and dropping the `--override` flag if `{pr_url}` does not have a value:

```bash
{harness_home_dir}/scripts/resolve-frontmatter.sh \
  --skill review-branch \
  --interactive true \
  --model "{model_id}" \
  --extra "author={author}" \
  --override "pr={pr_url}"
```

Prepend the script's output verbatim to the artifact body. The `pr:` field is populated only when reviewing a PR (via `review-pr`); a direct ticket-only review omits it.

## Review guidelines

A no-findings review is a complete, valid outcome and the expected default for a clean change: merge-ready, not lazy or unfinished. Raise a finding only when it genuinely warrants the author's action; finding none is success, not a gap to fill.

Comprehensive review: Trace logic, verify edge cases, assess architectural impact.

### Criteria

Read and apply the `review-criteria` skill (`../review-criteria/SKILL.md`). Additionally for this skill:

- Reference associated Jira ticket if integrations.jira.enabled is true
- Look at commit messages for context
- Suggest refactoring if new code adds tech debt

<!-- guidance-hook: implementation-preferences -->

## Issue numbering

Uniquely number all issues for easy reference. See [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix) for full category criteria and criticality mapping.

- FIXMEs: `F{n}`. Critical, must fix before merge
- Warnings: `W{n}`. Questionable decisions, may block merge
- TODOs: `T{n}`. Should fix, can wait for next PR
- Recommendations: `R{n}`. Advisable but discretionary
- Suggestions: `S{n}`. Optional improvement
- Legacy: `{F,W,T,R,S}{n}-L`. Observation in pre-existing code, not authored in this change. Same severity letter as the equivalent author finding; number it from that letter's shared sequence first, then append `-L` as a marker (e.g., after `F1`, `F2`, the first legacy FIXME is `F3-L`)
- Insights: `I{n}`. Knowledge worth preserving, gated per the [insight gate](../review-criteria/SKILL.md#insight-gate); does not have a severity and does not count against the score

## Output format

Section-header icons (🚨, ⚠️, 📋, 🧠, ☝️, 🔍) come from the canonical [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix), and the 💡 insights icon from [knowledge items](../_data/artifact-conventions.md#knowledge-items); render them as shown. Each finding under "Action required" and "Areas for improvement" follows the canonical per-finding template shown below; see [`review-criteria` § Finding references](../review-criteria/SKILL.md#finding-references) for the rules governing the `Location:` field.

When `ticket_ref` is null (the branch does not have a ticket), omit the `{ticket_ref}: ` portion so that the heading reads naturally without it, e.g., `# Code review: {description}`.

The artifact begins with YAML frontmatter conforming to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the field-resolution steps in the [Frontmatter resolution](#frontmatter-resolution) section above. Pass `--extra "author={author}"` to the script to populate the review-artifact `author` field.

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

(The same shape applies to every finding in the sections below: Only the prefix letter, the `Severity:` value, and the section bucket change. Legacy findings use `-L` suffix IDs and `(legacy)` severity values.)

### Warnings ⚠️

{Questionable decisions that may block merge - require justification}

### TODOs 📋

{Should-fix changes that can wait for next PR}

## Areas for improvement

### Recommendations 🧠

{Advisable but discretionary}

### Suggestions ☝️

{Optional improvements}

### Legacy observations 🔍

{Observations in pre-existing code, using severity-tagged IDs with `-L` suffix (e.g., `F3-L`, `T2-L`). Frame as future opportunities, don't count against score}

## Insights

{Knowledge worth preserving that is not a finding (a pattern, gotcha, or architectural learning found during review). Gated per the [insight gate](../review-criteria/SKILL.md#insight-gate); does not have a severity and does not count against the score. Omit this section entirely when there are none.}

### I1: {title}

- **Description:** {the insight and why a future reader is worse off without it}
- **Destination:** {optional: `ticket comment` or `devlog`}

## Technical assessment

{Why the change is correct and adequately tested. For a change to a visible component, what the browser check in {rulebook:accessibility-conventions} found, or that it did not run and which elements it would have covered.}

## Conclusion

Score: X/10

## Specification compliance

{Omit this entire section when the spec-source list is empty. Otherwise render one subsection per source. With one source the section is structurally identical to the prior single-ticket "Ticket compliance" output; with two or more, repeat the subsection per source.}

### {source.label}

{The label is `{source_type}: {short identifier}`, for example, `ticket: #553` or `pr_description: PR #1024`. Use the source's natural identifier so that a reader can tell at a glance which specification a row evaluates against.}

**Source:** {Render the source's `provenance` and `last_updated` (echoed verbatim; `last_updated` is already ISO 8601) so that the reader knows what contract this section measured against, e.g. `remote issue (last updated 2026-06-07T01:56:34Z)`, ``local snapshot `20260606-090337Z_..._ticket.md` (last updated 2026-06-06T09:03:37Z)``, or `local source (last updated …)` for an explicit file/plain-text `--ticket` that has no snapshot filename. Omit the "last updated" clause when `last_updated` is null.}

{When the chosen source is the local snapshot and a remote candidate existed, compare their acceptance criteria by the same extraction rule that the table below uses. Add a callout only when they differ materially: a criterion on one side without a counterpart on the other (absence on either side counts), or worded differently enough that the verdict could differ. Rewording that cannot change a verdict is not material. The callout names the difference with a ⚠️, states that this review measured against the snapshot rather than the published ticket, and points to `--spec-source=remote` to re-resolve against the remote. Say nothing when the criteria agree, whatever the timestamps. Omit entirely when the chosen source is the remote candidate, when resolution did not find a competing candidate (single source or explicit `--ticket`), or for a `pr_description` source.}

#### Acceptance criteria

| #   | Criterion        | Status   | Notes   |
| --- | ---------------- | -------- | ------- |
| 1   | {criterion text} | {status} | {notes} |

Status values: ✅ Met, ⚠️ Partial, ❌ Not addressed

Assign the status against the criterion's substantive guarantee, not its wording. A criterion is ✅ Met when the implementation delivers that guarantee, whatever shape it took: A criterion phrased "merges additively" is met by an implementation that refuses by default and merges under a flag, because it never overwrites. Implementation that goes beyond a criterion is ✅ Met as well; the excess is reported under Unplanned work and is never a shortfall.

⚠️ Partial and ❌ Not addressed mean the guarantee is undelivered. Two situations produce them, and the Notes cell states which, because only one is a deviation:

- **Unbuilt**: The work is incomplete. At review time this is ordinary, and the contract is not in question.
- **In conflict**: The implementation took a direction that the criterion contradicts, such that a reader who has the criteria would judge the implementation wrong. In a ticket source, this is the sole input to the Deviations sub-block in [next-steps options](#next-steps-options).

Extract criteria from whatever structure the source uses (numbered lists, checkboxes, prose). If the source does not have clearly delimited acceptance criteria, derive them from its problem statement and solution description. PR descriptions typically expose criteria as the bullet items under `## What`, `## Summary`, or an explicit acceptance-criteria heading; fall back to the description body when the description does not contain a list.

#### Unplanned work

{Bullet list of changes not traceable to any criterion in this source. If none, state "None."}

#### Assessment

{1-2 sentence summary of alignment between the implementation and this source.}

## Specification consistency

{Omit this entire section when fewer than two spec sources are present. Otherwise assess semantic alignment across (ticket, PR description, implementation) and render the verdict line plus the per-aspect table below. Include the Details subsection only for rows whose Summary cell cannot fit the explanation.}

🔗 **Consistency:** {emoji} `{verdict}`

| #   | Aspect         | Ticket  | PR description | Implementation             | Summary                                   |
| --- | -------------- | ------- | -------------- | -------------------------- | ----------------------------------------- |
| D1  | {aspect label} | {state} | {state}        | {ticket-state}, {PR-state} | {one-line synthesis with concrete values} |

Verdict scale (max across all rows): 🟢 `none` (all three aligned; section omitted entirely) / 🟠 `partial` (implementation aligns with one spec source but not the other) / 🔴 `severe` (implementation aligns with neither, or sources contradict each other on a central claim).

Cell encoding:

| Symbol      | Meaning                                          |
| ----------- | ------------------------------------------------ |
| ⚫ baseline | This source defines the aspect on this row       |
| ⚪ omitted  | This source does not make a claim to compare     |
| 🟢 {ref}    | Matches the named reference (semantic alignment) |
| 🟠 {ref}    | Partial mismatch with the named reference        |
| 🔴 {ref}    | Severe mismatch with the named reference         |

Baseline-selection rule: Ticket is baseline when it mentions the aspect; otherwise PR description is baseline. An aspect introduced only by the implementation belongs in `## Specification compliance`'s "Unplanned work" sub-section, not here.

Implementation-column ordering: always `{ticket-state}, {PR-state}` regardless of which is meaningful, so that every row reads in the same order.

Only rows in which at least two of (ticket, PR description, implementation) differ belong in this table. Fully-aligned aspects appear in `## Specification compliance`, not here.

### Details

**D{n}: {aspect label}.** {Free-form prose elaborating aspects that the Summary cell cannot fit. Each entry keys to a `D{n}` ID for cross-reference.}

Paraphrasing is not divergence: Evaluate semantic alignment, not textual overlap. The verdict is independent of the F/W/T/R/S finding scheme; author-actionable issues continue to be reported in the existing finding sections. When the PR description defers entirely to the ticket (e.g., a body of just `Closes #N` and a sentence), render a single Details paragraph noting the deferral and emit verdict `none` without a table.
```

### Clean reviews

When a change does not warrant any findings, render it on this shape rather than as empty `### FIXMEs` / "None." scaffolding:

```markdown
## Action required

None.

## Areas for improvement

None.

## Technical assessment

{Why the change is correct and adequately tested. For a change to a visible component, what the browser check in {rulebook:accessibility-conventions} found, or that it did not run and which elements it would have covered.}

## Conclusion

A focused, well-tested change without outstanding issues. Merge-ready.

Score: 10/10
```

## Scoring

The score is an honest, at-a-glance quality signal.

- A no-findings review is 10/10.
- Every authored finding that survives the self-challenge lowers the score, weighted by severity from `F` (heaviest) down to `S` (lightest). Every tier lowers the score: A finding worth raising is a finding worth a deduction.
- Score only the change under review; Legacy and other pre-existing observations never affect the score.
- Never suppress a real finding to protect a perfect score. An honest 8 is better than a flattering 10.

## Saving

### Path resolution

Use `artifact_base_dir`, `project_slug`, and `ticket_id` from step 1.

Follow [artifact conventions](../_data/artifact-conventions.md).

### Run artifact

The review is saved as a run artifact: `{timestamp}_reviewer_review.md`

1. Resolve ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`. When `ticket_id` is null, auto-generate one in the format `{YYYYMMDD}-{4 random hex}` per [artifact conventions](../_data/artifact-conventions.md#ticket-id); never construct a path with a literal `null` segment.
2. Open the run directory: Invoke `node {harness_home_dir}/scripts/resolve-review-run.mjs open --ticket-dir <ticket-dir> --timestamp <timestamp>` via Bash, passing this review's UTC `YYYYMMDD-HHMMSSZ` timestamp. The helper prints `{ "runDir": "<path>" }`: the ticket's active run, or a new `{timestamp}-interactive` run when the ticket directory does not contain one. On a malformed timestamp it exits non-zero and names the problem on stderr.
3. Save: `{runDir}/{timestamp}_reviewer_review.md`

Each review is a separate artifact in the run directory. Do not append to existing files: The chronological sequence of files is the history.

## Next-steps options

The next-steps block has four independent sub-blocks. Each is shown only when its condition is met. If every condition is unmet, the next-steps block does not appear. Whatever combination of sub-blocks is shown, always wrap the output in a `Next steps:` header. When two or more sub-blocks appear, label each with its `A` identifier as a bold prefix (`**A1: Deviations from ticket**`, and so on) and keep each sub-block's own 1-based numbering, so the user answers `A1: 1, A2: 2`; a lone sub-block does not take an identifier.

Use `~/`-relative paths when possible and absolute paths otherwise. Every line subordinate to an option (invocation guidance as much as a pro or con) is a nested list item, never a whitespace-indented continuation; see [option format](#option-format).

**Naming a skill in the render.** Name a skill in the rendered option only when the user must carry the invocation across a session boundary: clearing context, handing off to another session, or waiting for someone else to act. When the agent runs the skill in the current session, the skill name appears in the sub-block's Options table and the rendered line is a bare action. This limits each rendered line to the step that the user performs.

**Reviewer and author roles.** A review reports findings; the author disposes of them. The options below send the reviewer's output to the author or record what the review found; they never ask the reviewer to re-design, re-plan, or coordinate a workflow, none of which is the reviewer's job.

### Proposed-edit preview

Three of the sub-blocks below offer options that rewrite an artifact, one each: the Deviations sub-block rewrites the ticket's acceptance criteria, the source-divergence sub-block rewrites the PR description, and the Findings sub-block rewrites the source. The user consents to that rewrite by picking a number, so every such option renders a preview of the edit that it would make. The reviewer judges which criteria are genuinely in conflict with the implementation and which findings name a change that it can carry out; the preview makes those judgments reviewable instead of silent.

**Placement.** The preview renders above the numbered options, inside its sub-block, under a `Proposed edit to the {target}:` label naming what it would change; the source target's label is plural, `Proposed edits to the source:`, because it covers every open finding. Option lines stay bare actions: The preview is never a pro, a con, or a line nested beneath an option. An option that mutates nothing, such as "Leave as-is", does not render a preview.

Ticket and PR-description deltas render as a flat list, one line per change. Source entries render as blocks instead, each led by its bolded finding ID.

**Notation.** The preview is a delta. It never restates the ticket, the PR description, or a finding's Recommendation, which would duplicate the artifact in the terminal, and it contains one entry per change:

- **Ticket targets** derive their delta from the in-conflict criteria rows of `## Specification compliance`'s ticket subsection, and from nothing else. Unplanned work is never a source: Implementation that goes beyond the criteria is not a deviation, so it does not yield a line. Because a ticket's `## Problem`, `## Context`, and `## Proposed solution` record what was known and proposed when it was written, this menu does not offer an edit that changes them; a divergence between one of them and the implementation is reported in the PR description instead.
  - `Reword: {old} → {new}` for a criterion whose direction the implementation deliberately contradicts
  - `Drop: {criterion}` for a criterion that the implementation deliberately abandoned, never for one that it has not yet reached
- **PR-description targets** render the concrete claim changes, each keyed to the divergent `D{n}` row from which it came: `D2: {claim as written} → {claim as built}`.
- **Source targets** derive their delta from the open findings, one entry per finding, keyed to its ID. An entry states two things: the surface that the change touches (source, test, comment, docs, config) and the substance of the edit. Its form follows the edit's own granularity rather than a fixed notation, so a literal single-site edit is a `{old} → {new}` clause, many sites sharing one edit are a table captioned with what is invariant across its rows, and a structural edit is a prose clause naming the shape of the resulting diff. A code snippet is one rendering among these, never the required form.
  - When an entry covers several sites and deliberately leaves one of them alone, it names that site with the reason. The entry states its own boundary rather than leaving the reader to infer it from silence.

Every finding has one of the two shapes that the [Proposed-change gate](../review-criteria/SKILL.md#proposed-change-gate) defines, and a source entry renders which one it has: a single named change, or a choice among named alternatives that the author decides. The second is tagged as the author's choice, and its alternatives are named rather than resolved.

Do not render an exclusions line. A criterion genuinely arguable as in conflict belongs in the delta, where the user can strike it. Listing what was left out adds noise and hides the proposal that it was meant to qualify.

**Open findings.** When a ticket or PR-description delta line would settle or obviate an open finding, follow it with a sibling `⚠️` list item naming that finding, so that the user can see that accepting the edit pre-empts the finding's disposition. Those preview lists stay flat; nothing nests beneath a delta line.

**The preview is the contract.** The edit executed is the edit previewed. When carrying it out reveals a change that the preview did not contain, stop and re-confirm with the new line shown; never widen the edit under consent already given.

**Empty delta.** When the judgment drops every line, the Deviations sub-block has nothing to propose and does not render at all; see its [trigger](#deviations-sub-block). When a source divergence proposes a PR-description edit, that delta is never empty, because a divergence that the implementation resolves in the ticket's favor always leaves a claim to reconcile.

### Deviations sub-block

Shown when at least one criterion in the ticket subsection of `## Specification compliance` is in conflict with the implementation, equivalently when the criteria delta contains at least one line. Compute the delta first: When it is empty, do not render the sub-block.

A criterion from another spec source never fires this sub-block, whose only edit rewrites the ticket. Every ticket edit offered by a review is this sub-block's, and a PR description at odds with the implementation is the [source divergence sub-block](#source-divergence-sub-block)'s.

A criterion that is merely unbuilt does not contribute a line. The work is unfinished, not redirected, and a contract is not revised to match a moving target. Implementation that exceeds the criteria contributes none either.

#### Options

| #   | Emoji | Option                         | Description                                                                                                                                                      |
| --- | ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 📝    | Update the acceptance criteria | Run `align-ticket-with-implementation`, which revises acceptance criteria alone, bound to the previewed delta, and writes the ticket of record when one resolves |
| 2   | ⏭️    | Leave as-is                    | Accept the deviation without updating the ticket                                                                                                                 |

#### Output format

Render the list per [option format](#option-format). Each option has a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker. Option 1 renders the criteria delta above the list per [proposed-edit preview](#proposed-edit-preview). Pros and cons are omitted by default; add a `➕` or `➖` line only when the specific deviation presents a tradeoff that survives the option-format tests (e.g., "the abandoned criterion was load-bearing for downstream tests"). Generic restatements ("ships faster," "ticket drifts from reality") are noise and must be omitted. That default applies to pros and cons alone: It never suppresses the proposed-edit preview, which is required content.

**Name the artifact that the edit writes.** Option 1's rendered line ends with its target: `on {ticket_ref}` when a ticket of record resolves, whichever artifact supplied the spec source, and `in the local ticket snapshot` when none does. A ticket of record is the manifest's `ticket_url`, or `ticket_id` with `scm`; when auto-resolve passed over a remote candidate on recency, it already has one.

**Offer the local-only form when the snapshot may be the contract.** When the review measured against the local snapshot while a remote candidate existed, nest one invocation line under option 1; omit it otherwise:

```
1. 📝 ■■□ Update the acceptance criteria on {ticket_ref}
   - or `1 local`: update the local snapshot alone, leaving {ticket_ref} as it stands
2. ⏭️ ■□□ Leave as-is
```

For a selection qualified `local`, run the delegate with `--write-target=local`.

Example (rendered for the recommendation case):

```
Next steps:

Deviations from ticket:

Proposed edit to the acceptance criteria:
- Reword: "Warns on an unknown directive" → "Fails on an unknown directive"
- ⚠️ W2 asks whether an unknown directive should fail the run at all; accepting this reword settles it as the contract
- Drop: A `--strict` flag gates the new validation

1. 📝 ■■□ Update the acceptance criteria on {ticket_ref}
2. ⏭️ ■□□ Leave as-is
```

When the recommendation rules do not indicate a preference, omit markers from both options per the gradient's pure-taste-call form.

#### Recommendation rules

1. **Recommend "Update the acceptance criteria"**: The implementation's direction is deliberate and sound, so the criteria as written would lead a later reader to judge correct code wrong.
2. **Recommend "Leave as-is"**: The review raised a finding on the conflicting behavior. The code is in question, and revising the contract to match it would hide the finding.
3. **No recommendation** (omit markers from both options): The reviewer cannot tell whether the criteria or the implementation is the wrong one. The user decides.

#### Marker strengths

For rules 1 and 2, the recommended option's marker follows how cleanly the rule's test is met: ■■■ when the evidence is unambiguous (the direction is plainly deliberate and sound for rule 1, or the finding plainly stands for rule 2), and ■■□ when the reading is defensible but arguable. The other option takes ■□□. Under rule 3, both options go unmarked.

### Source divergence sub-block

Shown when the consistency section of the review reports a `partial` or `severe` verdict, and the divergence leaves a PR-description claim to reconcile. The consistency section renders only when two spec sources are present (ticket and PR description), so this sub-block appears in PR reviews. The case (which spec source the implementation matches) is drawn from the consistency-section table; see `review-branch/SKILL.md` § Specification consistency.

This sub-block edits the PR description alone. Because a ticket delta derives from in-conflict criteria rows, which are the [Deviations sub-block](#deviations-sub-block)'s trigger, a ticket edit offered here would duplicate that sub-block's preview and menu for one decision. Case 3 (the ticket is the stale source) therefore renders nothing of its own: When its divergence rests on a criterion, Deviations proposes the edit, and when it rests on a narrative section, the ticket's authoring-time record stands and nothing is proposed.

#### Options

The options are:

| Emoji | Option                | Action                                              |
| ----- | --------------------- | --------------------------------------------------- |
| 📝    | Update PR description | Edit the PR description to match the implementation |
| ⏭️    | Leave as-is           | Accept the divergence                               |

Every case that renders offers both, so the pair is fixed; what varies by case is which marker each takes.

#### Output format

Render the list per [option format](#option-format). Each option has a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker per case. Option 1 renders its PR-description delta above the list, per [proposed-edit preview](#proposed-edit-preview); "Leave as-is" has none. Pros and cons are omitted by default; add a `➕` or `➖` line only when the specific divergence presents a tradeoff that survives the option-format tests (e.g., "the diverging AC was load-bearing for adjacent work that has already shipped"). Generic restatements are noise and must be omitted. That default applies to pros and cons alone: It never suppresses the proposed-edit preview, which is required content.

Case 2 (implementation matches ticket; PR description is the stale source):

```
Source divergence:

Proposed edit to the PR description:
- D2: "Retries use a fixed 200ms delay" → "Retries use exponential backoff from 200ms"

1. 📝 ■■□ Update PR description
2. ⏭️ ■□□ Leave as-is
```

Case 3 (implementation matches PR description; ticket is the stale source) renders nothing; see [the sub-block's own scope](#source-divergence-sub-block).

Case 4 (implementation matches neither source, severe) renders the same pair as case 2, marker-free: The reviewer cannot tell whether the code or the specs are the wrong one, so it recommends neither. The "code is wrong" path is not offered here: The review's findings already report a divergence when the code is at fault, and disposing of those findings is the author's job (see the Findings sub-block).

Source-divergence options preserve conversation context, and the preview that each renders binds the reconciliation that follows, per [proposed-edit preview](#proposed-edit-preview).

#### Recommendation rules

In the typical flow, the ticket is written first and rarely revised, while the PR description describes the implementation as built. When the two diverge and the implementation matches one of them, the unmatched source is the stale one; update it to match reality. When the implementation matches neither (severe), the reviewer cannot attribute the fault, so the menu offers only ratification of the PR description and leaves the code-is-wrong path to the findings.

Determine the case from the implementation column of the consistency-section table:

| Implementation column shows                   | Verdict      | Case | Recommended option     |
| --------------------------------------------- | ------------ | ---- | ---------------------- |
| `🟢 ticket, 🟠/🔴 PR` on every divergent row  | 🟠 `partial` | 2    | Update PR description  |
| `🟠/🔴 ticket, 🟢 PR` on every divergent row  | 🟠 `partial` | 3    | None (does not render) |
| `🟠/🔴 ticket, 🟠/🔴 PR` on any divergent row | 🔴 `severe`  | 4    | None (marker-free)     |

#### Marker strengths

For case 2, the recommended option's marker follows how cleanly the case's own test is met: ■■■ when the divergence is unambiguous and the PR description is plainly the stale source, ■■□ when which source leads is arguable. The other option takes ■□□. In case 4, both options go unmarked.

### Findings sub-block

Shown when the review has at least one finding.

The trigger does not include a tier condition; do not reintroduce one. Every finding emitted by a review has already cleared the [Proposed-change gate](../_data/artifact-conventions.md#proposed-change-gate), which requires it to name a change on which the author can act; anything without an envisioned change was dropped before it was written to the artifact. Severity orders how findings rank and what blocks merge. It never decides whether they are shown, or whether the user is offered a way to act on them.

Stating the trigger as a list of tiers is the failure that this rule replaces: An enumeration goes stale the next time the finding scheme changes, and silently withdraws the menu from whichever tier it omits.

Legacy (`-L`) findings trigger the sub-block on the same terms, with the full option pool. Do not trim the author hand-offs for a legacy-only review: That would leave implementing-in-place as the only route and forfeit the adversarial second look, which pre-existing code needs at least as much as authored code, since a legacy fix is not constrained by any ticket criterion or supported by any design discussion. The recommendation rules handle legacy findings without a carve-out: A legacy fix naming a single change satisfies rule 2 like any other, and one leaving its choice to the author falls through to a ticket or a hand-off.

The option set depends on whether the review covers a pull request. Select the variant by the review that the agent just produced: A `review-pr` run has a PR reference in the review header and a PR-description spec source, and its author is typically someone else; a `review-branch` run has neither, and its code is typically our own.

#### Options: Local-branch variant (review-branch)

| #   | Emoji | Option                                                      | Description                                                                                                             |
| --- | ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | 🚀    | Implement directly and commit                               | Fix the findings in this session and commit the fix                                                                     |
| 2   | 📋    | Ask the author to address the findings                      | Hand the findings to the author for disposition                                                                         |
| 3   | 📋🔍  | Wait for the author to address the findings, then re-review | Wait for the author's fixes, then re-review the branch                                                                  |
| 4   | 🎫    | Create a follow-up ticket                                   | Spin the separable findings into their own ticket, per `scope-and-deferral.md`; the next matching rule decides the rest |

#### Options: PR variant (review-pr)

| #   | Emoji | Option                        | Description                                                                                                                                                                                                             |
| --- | ----- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 📋    | Post findings on the PR       | Post the findings as comments anchored to file and line. On Bitbucket, use the tool named in [Bitbucket pull-request access](../_data/bitbucket-pr-access.md); GitHub does not have a posting mechanism yet (see #1018) |
| 2   | 🚀    | Implement directly and commit | Fix the findings in this session and commit the fix                                                                                                                                                                     |
| 3   | 🎫    | Create a follow-up ticket     | Spin the separable findings into their own ticket, per `scope-and-deferral.md`; the next matching rule decides the rest                                                                                                 |

#### Output format

Render the list per [option format](#option-format). Each option has a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker. Whenever an option would change source, which is every rendering of this sub-block that offers "Implement directly and commit", the source delta renders above the list per [proposed-edit preview](#proposed-edit-preview). Pros and cons are omitted by default: Add a `➕` or `➖` line only when the specific findings present a tradeoff that survives the option-format tests bearing on which option fits (e.g., "the fixes touch a shared contract used outside this package"). Generic option properties are noise and must be omitted. That default applies to pros and cons alone: It never suppresses the proposed-edit preview, which is required content.

**What the commit records.** Selecting the option applies the previewed edits and commits them, composed per `{skill:create-commit}`, whose one-unit rule decides whether they form one commit or several. The commit is always a new one, never an amend: The separate commit keeps the fix visible as a diff and revertible while the branch exists, and a squash merge discards the history that an amend would tidy. Nothing is pushed, which matters most in the PR variant, in which the branch belongs to someone else.

**Naming the ticket's subset.** When only some open findings clear rule 1's spin-off bar, the follow-up-ticket line names the ones that it would cover, as `Create a follow-up ticket for R2, S1`. Choosing it disposes of those findings alone. In this case the ticket option composes with the recommendation rather than replacing it: The cascade's remaining rules run on the findings that the ticket does not cover, the option selected by those rules is the one marked, and answering with both numbers disposes of every open finding. A ticket option covering every open finding renders bare.

Local-branch variant, rendered for a review whose findings are all discretionary and all a single named change:

```
Next steps:

Actionable findings:

Proposed edits to the source:

**T1: test code.** Assert the corrected error classes in `parseRange.test.ts`. Every changed row keeps its message text and only gains the wrapper.

| Line         | Case                | `toThrow(…)` becomes                   |
| ------------ | ------------------- | -------------------------------------- |
| 62           | index out of bounds | `toThrow(new RangeError(msg))`         |
| 33, 38, 43   | missing key         | unchanged; that throw is still `Error` |

**S1: comment.** Replace the stale `@returns` line on `resolveBase` (`resolve.ts:88`) with a `todo:` naming what went stale.

1. 🚀 ■■□ Implement directly and commit
2. 📋 ■□□ Ask the author to address the findings
3. 📋🔍 ■□□ Wait for the author to address the findings, then {skill?:review-branch}
4. 🎫 ■□□ Create a follow-up ticket

If the author is an agent, run {skill?:respond-to-review} in that session.
```

Local-branch variant, rendered when a finding names alternatives that the author owns. The entry states the alternatives; choosing option 1 hands that call to whoever implements:

```
Next steps:

Actionable findings:

Proposed edits to the source:

**W2: source, author's choice.** `flush()` in `writer.ts:140` swallows the write error. Propagate it, or log and continue; which one turns on whether callers can recover.

1. 🚀 ■□□ Implement directly and commit
2. 📋 ■■□ Ask the author to address the findings
3. 📋🔍 ■□□ Wait for the author to address the findings, then {skill?:review-branch}
4. 🎫 ■□□ Create a follow-up ticket

If the author is an agent, run {skill?:respond-to-review} in that session.
```

Local-branch variant, rendered when three findings naming a single change each appear next to one separable recommendation. The ticket option's findings keep their entries, since the user is consenting to their disposition too:

```
Next steps:

Actionable findings:

Proposed edits to the source:

**S1: source.** Rename `x` to `descriptiveName` at its four sites in `resolve.ts`.

**S2: comment.** Drop the paraphrase above the `useDocumentTitle` call in `Header.tsx:31`.

**S3: test code.** Add the empty-input case to `parseRange.test.ts`, asserting the `RangeError` that the guard now throws.

**R2: source.** Extract the retry loop from `client.ts` into a helper shared by the three callers.

1. 🚀 ■■□ Implement directly and commit
2. 📋 ■□□ Ask the author to address the findings
3. 📋🔍 ■□□ Wait for the author to address the findings, then {skill?:review-branch}
4. 🎫 ■□□ Create a follow-up ticket for R2

If the author is an agent, run {skill?:respond-to-review} in that session.
```

PR variant, rendered for the default case. "Implement directly and commit" is on the menu, so the preview renders here too:

```
Next steps:

Actionable findings:

Proposed edits to the source:

**F1: source.** Guard the null branch in `parseRange.ts:44` before the index read, returning the empty result that the caller already handles.

**S1: test code.** Add the empty-input case to `parseRange.test.ts`.

1. 📋 ■■□ Post findings on the PR
2. 🚀 ■□□ Implement directly and commit
3. 🎫 ■□□ Create a follow-up ticket
```

Per the session-boundary rule, two options name a skill in the render:

- **Ask the author to address the findings**: The author's disposition happens in another session. The separate line below the list names `respond-to-review` for the case in which that author is an agent.
- **Wait for the author to address the findings, then re-review**: Names `review-branch` in the render, because the re-review runs after a wait that only the user can end. It does not have a "Clear context" prefix: The saved review records the findings, so the re-review works the same in this session or a fresh one.

#### Recommendation rules

Both variants share one cascade. Check the rules in order and stop at the first match. Every rule states a firing condition, and an option is never a default that fires for lack of one: A conditionless option outranks a conditioned one in practice, however the conditions are worded.

1. **Create a follow-up ticket**: Every open finding clears one of [`scope-and-deferral.md`](../_data/scope-and-deferral.md)'s affirmative reasons for spinning off, namely a genuinely separable concern, a materially different risk surface, size that would overwhelm the current change, or independent prioritization. "The ticket didn't mention it" is never such a reason. Absent an affirmative reason the fold-in default applies and the cascade continues.
2. **Implement directly and commit**: Every open finding names a single change rather than a choice among alternatives, which are the two shapes that the [Proposed-change gate](../review-criteria/SKILL.md#proposed-change-gate) admits. Implementing forfeits the second look, and the single-change shape makes that acceptable: The fix's diff is the finding restated, so a reviewer would be re-reading text that the review already contains. One finding leaving its choice to the author is enough to fail this rule, however small the alternatives look, since implementing would settle it on the author's behalf.
3. **Wait for the author to address the findings, then re-review**: The findings need judgment that the author owns, and the fixes are substantial enough that the result needs another review pass. PR variant: Skip this rule.
4. **Ask the author to address the findings**: Residual. The reviewer reports; the author disposes. PR variant: **Post findings on the PR**, since the author is typically someone else and comments on the PR are how they receive the findings.

Every rule tests the open findings as a collection, which lets one recommendation stand for the set. When only some findings clear rule 1's spin-off bar, the cascade evaluates the remainder: The recommendation comes from the findings that stay, while the separable ones go to the follow-up-ticket option, whose rendered line names them.

Whether a change is discretionary and which shape it has are independent axes. Whether a change is optional is a different question from who decides it: An `S` reading "rename `x` to `descriptiveName`" is discretionary and still a single named change, since the only decision left is yes or no and the person reading the menu is the one making it. Handing that to the author sends an edit that is already settled through a second session.

Do not attempt to detect whether the author is the person reading the review. Agents commit under the user's git identity, so the review's resolved `{author}` cannot distinguish them. Rule 2 turns on the review's own content, which is decidable.

#### Marker strengths

The selected option's marker follows how cleanly its rule matched: ■■■ when the rule's test is met squarely and the alternatives are worse on the criteria that decided it, ■■□ when the fit is good but an alternative stays defensible, ■□□ when little separates the options. The others take ■□□ by default, and □□□ when one has a clear drawback in the current context.

Complexity levels classify individual findings, but the recommendation applies to the collection.

When the cascade's conditions leave two options genuinely in balance, prefer the one that keeps a human in the loop. That resolves a tie and nothing more: It never overrides a rule that fired, and a fix that satisfies rule 2's single-change test is not a tie.

### Blocked-step sub-block

Shown when something that the user can clear, such as a sandbox denial, a missing credential, or a stopped service, blocked a review step and remains once the routes that do not need any action from the user, such as an ephemeral runner for a missing tool, are exhausted. A clean review renders it like any other trigger. The line above the options names the step and the blocker, and the first option names the action that supplies the missing resource, such as a login or a grant, never the blocked step for the user to run:

```
{step} was blocked: {blocker}.

1. 🔓 ■■■ {Action that supplies the resource, e.g. run `! {login command}`}, then re-run {step}
2. ⏭️ ■□□ Accept the review without {step}
```

### Combined output format

When multiple sub-blocks are shown, present them as separate sections within a single next-steps block. Ordering is Blocked step → Deviations → Source divergence → Actionable findings. Each sub-block that edits an artifact edits a different one, so selecting several runs each edit against its own preview. Because source divergence appears only in PR reviews, a block that includes it renders the Findings PR variant. The example below illustrates one such arrangement; each sub-block's recommendation rules and marker strengths determine which marker applies to each option:

```
Next steps:

**A1: Deviations from ticket**

Proposed edit to the acceptance criteria:
- Drop: A `--strict` flag gates the new validation

1. 📝 ■■□ Update the acceptance criteria on {ticket_ref}
2. ⏭️ ■□□ Leave as-is

**A2: Source divergence**

Proposed edit to the PR description:
- D2: "Unknown directives are warned on" → "Unknown directives fail the run"

1. 📝 ■■□ Update PR description
2. ⏭️ ■□□ Leave as-is

**A3: Actionable findings**

Proposed edits to the source:

**F1: source.** Fail on an unknown directive in `directives.ts:52`, replacing the warning that the loop currently emits.

**S1: test code.** Add the unknown-directive case to `directives.test.ts`, asserting the failure.

1. 📋 ■■□ Post findings on the PR
2. 🚀 ■□□ Implement directly and commit
3. 🎫 ■□□ Create a follow-up ticket
```

<!-- include: ../_partials/option-format.md / -->
