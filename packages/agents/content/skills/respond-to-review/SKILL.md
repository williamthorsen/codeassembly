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
7. **Resolve frontmatter fields** per [Frontmatter resolution](#frontmatter-resolution)
8. **Save** per the [Saving](#saving) section

## Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

<!-- include: ../../_partials/frontmatter-via-script.md -->

- `provenance.skill`: always `respond-to-review`.
- `provenance.isInteractive`: always `true`.
- `provenance.model`: the model identifier you are executing under. Read this from your system-prompt environment block — the line `model named ... model ID is ...`.
- `responding_to` (response-artifact extension): the bare filename of the review being responded to (e.g., `09_reviewer_review.md`).
<!-- /include -->

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

1. **Verify before accepting.** Read the actual code referenced in each finding. Do not accept a finding at face value. "The reviewer may have a point" is not rigorous — either the finding is valid or it isn't.
2. **Check correctness.** Is the reviewer's claim technically accurate for this specific codebase and context?
3. **Treat hedging language as a signal.** When a recommendation grounds itself in "plausibly", "arguably", "could", or "no current evidence against", treat the premise as an unverified hypothesis. Require independent verification before acceptance. If the premise cannot be verified, default to REJECT.
4. **Consider intent.** Is the current implementation a deliberate design choice? Check commit messages, comments, and surrounding patterns.
5. **Pushback is the default for structural recommendations.** When a recommendation is to move, promote, or restructure code or guidance across files, modules, or sections, read the destination's stated scope, conventions, and invariants in full and verify the item fits — not just that it could syntactically live there. Acceptance requires affirmative evidence; rejection does not. Reject moves that conflict with the destination's stated category, conventions, or framing, even when the destination would "read cleaner." Accept when the destination's stated doctrine clearly accommodates the item and the move resolves a duplication or location problem the original placement created.
6. **Partial acceptance is fine.** A finding may be partly correct. Accept the valid parts, reject the invalid parts, and explain the boundary.
   </HARD-GATE>

## Worked examples

### Bad → Good — hedged move with doctrinal conflict

**Review recommendation:** "Move `validateSessionToken` from `auth/validators.ts` into `shared/utils.ts`. It plausibly belongs in a general utility module — there's no current evidence the function needs auth-specific context."

**Bad — uncritical acceptance:**

> R1: ACCEPT. `validateSessionToken` is a small input-to-boolean function with no side effects; it composes naturally with the other helpers in `shared/utils.ts`. Moving it consolidates similar shape-based utilities.

The acceptance reads the function's signature without reading the destination's doctrine.

**Good — doctrine-grounded REJECT:**

> R1: REJECT. The helpers already in `shared/utils.ts` (`debounce`, `formatBytes`, `clamp`) all share a no-domain-knowledge shape; the file header confirms the invariant with `// Pure, framework-agnostic helpers with no domain knowledge.`. `validateSessionToken` imports `SessionContext` from `auth/types.ts` and decodes a JWT against an auth-specific schema — both violate that invariant, whether read from the surrounding code or from the header. The reviewer's "plausibly belongs" framing did not survive a read of the destination's actual doctrine. The function stays in `auth/validators.ts`.

### Bad → Good — structural move with destination doctrine satisfied

**Review recommendation:** "Move the `MAX_RETRY_COUNT` constant from `network/http-client.ts` to `config/limits.ts`. It's hard-coded near the call site; `config/limits.ts` already holds `MAX_REQUEST_BYTES` and `MAX_CONNECTION_POOL_SIZE`, so grouping operational limits there reduces scatter."

**Bad — reflexive rejection:**

> R1: REJECT. Pushback is the default for structural recommendations. The current placement works.

The rejection invokes the default posture but never reads the destination's doctrine to check whether the affirmative-evidence bar is met.

**Good — doctrine-grounded ACCEPT:**

> R1: ACCEPT. `config/limits.ts` is the documented home for numeric operational ceilings; its existing members (`MAX_REQUEST_BYTES`, `MAX_CONNECTION_POOL_SIZE`) confirm the category, and `MAX_RETRY_COUNT` shares that exact shape. The constant is currently referenced from three modules that each re-import it from `network/http-client.ts` — a location problem the original placement created. The destination's stated doctrine accommodates the rule, and the move resolves the duplication; both conditions for the carve-out are met.

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

The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema. The `responding_to` field is a response-artifact-specific extension that records the review being addressed.

```markdown
---
provenance:
  skill: respond-to-review
  timestamp: '{ISO 8601 UTC timestamp}'
  baseSha: '{short SHA of origin/main, omit if unresolvable}'
  isInteractive: true
  model: '{model id}'
ticket_id: '{ticket ID from session context, omit if null}'
ticket_ref: '{ticket display ref, omit if null}'
branch: '{branch name from session context}'
commit: '{short hash of HEAD}'
pr: '{full PR URL, omit if not resolved}'
responding_to: '{filename of the review being responded to}'
---

# Change summary: {ticket_ref}: {description}

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
