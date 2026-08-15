---
name: respond-to-review
description: Produce structured response to code review findings with dispositions for each finding
user-invocable: true
dependencies:
  skills:
    - emit-event
---

# Respond to review

Evaluate code review findings with technical rigor and produce a change summary with embedded dispositions.

## Purpose

This skill bridges the gap between receiving a code review and implementing fixes. The agent evaluates each finding against the actual codebase, decides what to accept or push back on, and documents that reasoning — all embedded in a `coder_change-summary` artifact alongside any code changes made.

## Arguments

- No arguments: Locate the most recent `reviewer_review` in the active run for the current ticket
- `<path>`: Respond to the review at the specified path

## Process

1. **Get context**: Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `ticket_id`, `ticket_ref`, `project_slug`, `artifact_base_dir`, and `pr_url` from it. Then emit `skill.started` (payload `{"skill":"respond-to-review"}`) per [Lifecycle events](#lifecycle-events).
2. **Locate the review** per the [Locating the review](#locating-the-review) section
3. **Read prior artifacts** in the run directory chronologically for full context
4. **Parse findings**: Extract all numbered findings (F{n}, W{n}, T{n}, R{n}, S{n}, and legacy variants with `-L` suffix). See [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix) for category definitions.
5. **Evaluate each finding** following the evaluation protocol below.
6. **Audit the diff** per [Diff audit](#diff-audit). Every fix you implemented is verified here, before any of it is written down.
7. **Write response** per the output format
8. **Resolve frontmatter fields** per [Frontmatter resolution](#frontmatter-resolution)
9. **Save** per the [Saving](#saving) section

## Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`. Set `$review_filename` to the bare filename of the review being responded to (e.g., `09_reviewer_review.md`).

Resolve `$pr_url` per the [`respond-to-review` path](../_data/pr-source-resolution.md#respond-to-review-path) in PR source resolution:

- If the review's frontmatter carries a `pr:` field, set `$pr_url` to its value so the response inherits the same PR backlink, and persist it for future sessions: `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --set-pr-url "$pr_url"`.
- Otherwise, fall back to the stored manifest `pr_url` read from the session-context JSON emitted in step 1; if that is also null, leave `$pr_url` empty.

Run via Bash:

```bash
{harness_home_dir}/scripts/resolve-frontmatter.sh \
  --skill respond-to-review \
  --interactive true \
  --model "$MODEL_ID" \
  --extra "responding_to=$review_filename" \
  ${pr_url:+--override "pr=$pr_url"}
```

Prepend the script's output verbatim to the artifact body.

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

<!-- guidance-hook: ticketing-preferences -->

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
7. **Disposition is decided on substance, not on the reviewer's suggested handling.** Phrases like "consider a follow-up," "no action this PR," "future-coverage work" are the reviewer's priority signal, not a license to defer. The disposition (ACCEPT / REJECT / PARTIAL) is the agent's decision based on whether the change belongs in the codebase. There is no `ACCEPT (follow-up)`: If a change belongs but doesn't fit this PR, the disposition is ACCEPT and the follow-up is a separate decision; if the change does not belong, the disposition is REJECT.
   </HARD-GATE>

Implementing an ACCEPTed finding means editing code. Apply [Comment discipline](#comment-discipline) as you write. The reviewer conversation must not leak into the source.

## Worked examples

### Bad → Good: Hedged move with doctrinal conflict

**Review recommendation:** "Move `validateSessionToken` from `auth/validators.ts` into `shared/utils.ts`. It plausibly belongs in a general utility module — there's no current evidence the function needs auth-specific context."

**Bad: Uncritical acceptance:**

> R1: ACCEPT. `validateSessionToken` is a small input-to-boolean function with no side effects; it composes naturally with the other helpers in `shared/utils.ts`. Moving it consolidates similar shape-based utilities.

The acceptance reads the function's signature without reading the destination's doctrine.

**Good: Doctrine-grounded REJECT:**

> R1: REJECT. The helpers already in `shared/utils.ts` (`debounce`, `formatBytes`, `clamp`) all share a no-domain-knowledge shape; the file header confirms the invariant with `// Pure, framework-agnostic helpers with no domain knowledge.`. `validateSessionToken` imports `SessionContext` from `auth/types.ts` and decodes a JWT against an auth-specific schema — both violate that invariant, whether read from the surrounding code or from the header. The reviewer's "plausibly belongs" framing did not survive a read of the destination's actual doctrine. The function stays in `auth/validators.ts`.

### Bad → Good: Structural move with destination doctrine satisfied

**Review recommendation:** "Move the `MAX_RETRY_COUNT` constant from `network/http-client.ts` to `config/limits.ts`. It's hard-coded near the call site; `config/limits.ts` already holds `MAX_REQUEST_BYTES` and `MAX_CONNECTION_POOL_SIZE`, so grouping operational limits there reduces scatter."

**Bad: Reflexive rejection:**

> R1: REJECT. Pushback is the default for structural recommendations. The current placement works.

The rejection invokes the default posture but never reads the destination's doctrine to check whether the affirmative-evidence bar is met.

**Good: Doctrine-grounded ACCEPT:**

> R1: ACCEPT. `config/limits.ts` is the documented home for numeric operational ceilings; its existing members (`MAX_REQUEST_BYTES`, `MAX_CONNECTION_POOL_SIZE`) confirm the category, and `MAX_RETRY_COUNT` shares that exact shape. The constant is currently referenced from three modules that each re-import it from `network/http-client.ts` — a location problem the original placement created. The destination's stated doctrine accommodates the rule, and the move resolves the duplication; both conditions for the carve-out are met.

### Bad → Good: Deferral-framed recommendation, change does not belong

**Review recommendation:** "S1: `memoize` in `utils/memoize.ts` doesn't accept a TTL. Consider a follow-up to add an optional `ttlMs` parameter for time-bounded caching. No action this PR."

**Bad: Adopts framing as disposition:**

> S1: ACCEPT (follow-up). The reviewer is right that TTL is useful for some cases; we'll create a ticket and defer.

The disposition was lifted from the reviewer's handling suggestion; no substance check occurred, and `ACCEPT (follow-up)` is not a valid disposition.

**Good: Substance check, then REJECT:**

> S1: REJECT. The file header reads `// Pure memoization keyed on argument identity. For time-bounded caching, use timed-cache.ts.`, and `timed-cache.ts` is the documented home for the exact behavior the reviewer is suggesting we add. Adding TTL to `memoize` would muddle the two abstractions and break the invariant the file states explicitly. The change does not belong. The reviewer's "consider a follow-up" framing was a priority signal, not a license to defer the substance question.

### Bad → Good: Deferral-framed recommendation, change belongs (timing decided separately)

**Review recommendation:** "T1: `createApiKey` doesn't validate that `scopes` is a non-empty array. Consider a follow-up to add a guard. No action this PR — out of scope for the storage refactor."

**Bad: Collapses substance and timing:**

> T1: ACCEPT (follow-up). The reviewer is right; we'll create a ticket. Out of scope for this PR.

The disposition conflates two decisions: whether the change belongs (substance), and whether it ships in this PR (timing). `ACCEPT (follow-up)` is not a valid disposition.

**Good: Substance check (ACCEPT), then separate timing decision:**

> T1: ACCEPT. `createApiKey` is exported from the public `api/keys.ts` surface; the codebase's other public-API entry points (`createUser`, `createOrganization`) all validate their inputs at entry. The missing guard violates the established public-API invariant, so the change belongs. Timing is decided separately: The storage refactor's scope is otherwise tight, and adding the guard pulls in test fixtures unrelated to the refactor's purpose. The guard ships in a follow-up, and the follow-up ticket is filed now (per `create-tickets-immediately` guidance), not held as a maybe.

<!-- include: ../../_partials/comment-discipline.md / -->

<!-- include: ../../_partials/diff-audit-checklist.md / -->

<!-- guidance-hook: implementation-preferences -->

## Writing code after a review

Implementing an ACCEPTed finding puts you mid-conversation with the reviewer, and that is when the voice leaks. A comment must not narrate the change, retell the reviewer's concern, or cite a finding or acceptance-criterion ID.

**Before** (narrates the review, cites a finding and an acceptance criterion):

```ts
// Per F3, the reviewer worried a future refactor could move the toggle to a parent that
// always renders, silently violating acceptance criterion 4 — so pin it here.
expect(query).not.toHaveProperty('directReportsOnly', true);
```

**After** (states the invariant the code enforces):

```ts
// A non-manager viewer emits no directReportsOnly narrowing; the GraphQL surface is the binding contract.
expect(query).not.toHaveProperty('directReportsOnly', true);
```

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

The artifact begins with YAML frontmatter conforming to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the field-resolution steps in the [Frontmatter resolution](#frontmatter-resolution) section above. The `responding_to` field is a response-artifact-specific extension that records the review being addressed.

The body following the frontmatter has this structure:

```markdown
# Change summary: {ticket_ref}: {description}

## Changes made

{Summary of code changes made in response to the review, or "No code changes" if responding with dispositions only}

## Dispositions

### FIXMEs 🚨

#### F1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what the diff does, read back from it, or what subset}

### Warnings ⚠️

#### W1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what the diff does, read back from it, or what subset}

### TODOs 📋

#### T1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what the diff does, read back from it, or what subset}

### Recommendations 🧠

#### R1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what the diff does, read back from it, or what subset}

### Suggestions ☝️

#### S1: {title from review}

- **Disposition:** ACCEPT | REJECT | PARTIAL
- **Rationale:** {technical reasoning}
- **Action taken:** {what the diff does, read back from it, or what subset}

### Legacy 🔍

#### F2-L: {title from review}

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

- Code changes summarized under `## Changes made` must themselves satisfy [Comment discipline](#comment-discipline): Comments in the edited code state the code's current contract, not the change history or the reviewer's concern.
- `Action taken` and `## Changes made` report the diff, read back per [Diff audit](#diff-audit). A disposition asserting that something was left unchanged is a claim about the diff too, and takes the same evidence as one asserting that something changed.
- Omit category sections that have no findings (e.g., if the review has no TODOs, omit the `### TODOs` section)
- Preserve the finding IDs exactly as they appear in the review
- File references in Rationale or Action-taken prose follow the path-format rule in [`review-criteria` § Finding references](../review-criteria/SKILL.md#finding-references) — use repo-relative paths
- Legacy findings (IDs with `-L` suffix) use only ACCEPT (acknowledge the observation) or REJECT (disagree with the observation) — PARTIAL does not apply
- If the review contains no findings, produce a change summary noting that no findings require disposition and omit the Dispositions section
- A change summary with dispositions only (no code changes) is valid — this is how the coder can close a run by dispositioning all remaining findings

## Saving

### Path resolution

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `artifact_base_dir` and `project_slug` from the manifest JSON emitted on stdout (the same invocation in step 1 already populated the manifest file, so this is a fast-path read).

Follow [artifact conventions](../_data/artifact-conventions.md).

### Run directory

The response is saved as a run artifact: `{timestamp}_coder_change-summary.md`

1. Save into the same run directory where the review was found
2. The timestamp should reflect when this response was produced

Dispositions are embedded in this document — no separate disposition artifact.

Once the change summary is saved, emit `artifact.written` (payload `{"path":"<path>","kind":"change-summary"}`) per [Lifecycle events](#lifecycle-events), then emit `skill.completed` (payload `{"outcome":"response-saved"}`).

<!-- include: ../_partials/lifecycle-events.md / -->
