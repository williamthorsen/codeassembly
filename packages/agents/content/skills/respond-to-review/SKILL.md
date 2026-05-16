---
name: respond-to-review
description: Produce structured response to code review findings with dispositions for each finding
user-invocable: true
---

# Respond to review

Evaluate code review findings with technical rigor and produce a change summary with embedded dispositions.

## Purpose

This skill bridges the gap between receiving a code review and implementing fixes. The agent evaluates each finding against the actual codebase, decides what to accept or push back on, and documents that reasoning — all embedded in a `coder_change-summary` artifact alongside any code changes made.

## Arguments

- No arguments: locate the most recent `reviewer_review` in the active run for the current ticket
- `<path>`: respond to the review at the specified path

## Process

1. **Get context** using `get-session-context` to obtain `ticket_id`, `ticket_ref`, `project_slug`, and `artifact_base_dir`
2. **Locate the review** per the [Locating the review](#locating-the-review) section
3. **Read prior artifacts** in the run directory chronologically for full context
4. **Parse findings**: extract all numbered findings (F{n}, W{n}, T{n}, R{n}, S{n}, and legacy variants with `-L` suffix). See [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix) for category definitions.
5. **Evaluate each finding** following the evaluation protocol below
6. **Write response** per the output format
7. **Save** per the [Saving](#saving) section

## Locating the review

### Explicit path

If a path argument is provided, read the review directly from that path. If the file does not exist or contains no parseable findings, stop and report the error.

### Auto-discovery (default)

If no path is provided, find the most recent `reviewer_review` in the active run:

1. Resolve the ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`
2. Find the most recent run directory (highest timestamp in directory name)
3. List files matching `*_reviewer_review.md` or `*_overseer_review.md` in the run directory
4. Select the file with the highest timestamp

If no review artifact is found, stop and report the error.

## Evaluation protocol

For each finding, apply technical rigor:

<HARD-GATE>
**Anti-sycophancy rules for review response:**

1. **Verify before accepting.** Read the actual code referenced in each finding. Do not accept a finding at face value.
2. **Check correctness.** Is the reviewer's claim technically accurate for this specific codebase and context?
3. **Consider intent.** Is the current implementation a deliberate design choice? Check commit messages, comments, and surrounding patterns.
4. **Push back when warranted.** If a finding is incorrect, provide specific technical justification. "The reviewer may have a point" is not rigorous — either the finding is valid or it isn't.
5. **Partial acceptance is fine.** A finding may be partly correct. Accept the valid parts, reject the invalid parts, and explain the boundary.
   </HARD-GATE>

## Disposition vocabulary

These dispositions express **pre-implementation intent**:

- **ACCEPT** — finding is valid, will implement as recommended
- **REJECT** — technically incorrect or intentional choice (must include justification)
- **PARTIAL** — some aspects accepted, others pushed back (must specify which)

This is distinct from the **post-implementation** vocabulary used by the orchestrated-coder (`FIXED`/`NOT_FIXED`/`ALREADY_RESOLVED`), which reports outcomes after changes are made.

## Disposition scope

Per [artifact conventions](../_data/artifact-conventions.md#disposition-rules):

| Role     | Can disposition                                              | Cannot disposition                                       |
| -------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Coder    | Reviewer/overseer findings on the code                       | Own changes (self-review)                                |
| Reviewer | Own prior findings (revise/withdraw in light of new context) | Coder rejections (re-raise as escalated finding instead) |
| Overseer | Any finding (arbiter authority)                              | —                                                        |

## Output format

When `ticket_ref` is null (no ticket on the branch), omit the `{ticket_ref}: ` portion so the heading reads `# Change summary: {description}`.

```markdown
# Change summary: {ticket_ref}: {description}

Responding to: {filename of review being responded to}
Timestamp: {YYYY-MM-DD HH:MM UTC}
Author: {Agent name} (model: {model})

## Changes made

{Summary of code changes made in response to the review, or "No code changes" if responding with dispositions only}

## Dispositions

### FIXMEs 🚨

#### F1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what was done, or what subset}

### Warnings ⚠️

#### W1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what was done, or what subset}

### TODOs 📋

#### T1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what was done, or what subset}

### Recommendations 🧠

#### R1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what was done, or what subset}

### Suggestions ☝️

#### S1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what was done, or what subset}

### Legacy 🔍

#### F3-L: {title from review}

- **Disposition:** ACCEPT | REJECT
- **Rationale:** {reasoning}

## Summary

- Accepted: {count}
- Rejected: {count}
- Partial: {count}
- Implemented in this iteration: {list of IDs}
- Deferred to follow-up: {list of IDs}
```

## Section handling

- Omit category sections that have no findings (e.g., if the review has no TODOs, omit the `### TODOs` section)
- Preserve the finding IDs exactly as they appear in the review
- File references in Rationale or Action-taken prose follow the path-format rule in [`review-criteria` § Finding references](../review-criteria/SKILL.md#finding-references) — use repo-relative paths
- Legacy findings (IDs with `-L` suffix) use only ACCEPT (acknowledge the observation) or REJECT (disagree with the observation) — PARTIAL does not apply
- If the review contains no actionable findings, produce a change summary noting that no findings require disposition and omit the Dispositions section
- A change summary with dispositions only (no code changes) is valid — this is how the coder can close a run by dispositioning all remaining findings

## Saving

### Path resolution

Use `get-session-context` to obtain `artifact_base_dir` and `project_slug`.

Follow [artifact conventions](../_data/artifact-conventions.md).

### Run directory

The response is saved as a run artifact: `{timestamp}_coder_change-summary.md`

1. Save into the same run directory where the review was found
2. The timestamp should reflect when this response was produced

Dispositions are embedded in this document — no separate disposition artifact.
