---
name: align-ticket-with-implementation
description: Align an issue ticket with the current branch's implementation
user-invocable: true
---

# Align ticket with implementation

Produce or revise an issue ticket (e.g., GitHub issue, Jira issue) to describe what the current branch's implementation accomplishes.

## Process

1. **Analyze branch changes**: Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch` from the manifest JSON it emits on stdout, then run:

```bash
git diff $DEFAULT_BRANCH...HEAD
```

2. **Write ticket** describing issues that were addressed

## Output structure

The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema. See [Frontmatter resolution](#frontmatter-resolution) below for field resolution. The frontmatter conforms to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter).

```markdown
<!-- include: ../_partials/ticket-skeleton.md / -->
```

<!-- include: ../_partials/ticket-skeleton-tiers.md / -->

## Guidance

<!-- include: ../_partials/ticket-concision.md / -->

<!-- include: ../_partials/ticket-placement.md / -->

When aligning to an existing implementation, _the implementation_ is the code on the branch — describe what the code now does, and resist transcribing its mechanism back into the ticket.

The skeleton's `## Proposed solution` section is forward-looking by default; here it records the approach the branch actually took, not a proposal still under consideration.

<!-- include: ../_partials/ticket-criteria-conventions.md / -->

**Criteria-only mode.** When the caller scopes the revision to acceptance criteria, revise `## Acceptance criteria` alone and reproduce `## Problem`, `## Context`, and `## Proposed solution` verbatim from the source ticket the caller names. A review names it in its `## Specification compliance` section, which records the source the review measured against, the remote issue or the local snapshot. The saved artifact is still a complete ticket; only its generation is partial. A caller that ratifies the whole ticket gets the default behavior.

**Ratified-delta mode.** When the caller supplies a delta it has already put to the user, such as a review's proposed-edit preview, the previewed delta is the whole of the revision. Apply exactly its lines and reproduce every other criterion and section verbatim. Seek no further divergence between the ticket and the implementation: What the caller's user consented to is those lines, not alignment as such. When applying a line reveals a change the delta does not contain, stop and report it rather than widening the edit.

Invoked with no delta, the skill aligns to the implementation as described above. The two modes are orthogonal and compose: Criteria-only mode limits which sections change, ratified-delta mode limits how much changes within them.

**Spike mode.** If the branch implements a spike, use the spike ticket template in [spike conventions](../_data/spike-conventions.md), reconciling whether the investigation answered its questions rather than whether the branch met acceptance criteria.

- Keep tone professional and objective
- Focus on what was broken and what needed fixing
- Prioritize functional issues in "Must have"
- Place code quality/maintenance items in "Should have"

## Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`.

Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill align-ticket-with-implementation --interactive true --model "$MODEL_ID"` via Bash. Prepend the output verbatim to the artifact body.

## Saving

### Path resolution

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; read `artifact_base_dir`, `project_slug`, and `ticket_id` from it (the same invocation in step 1 already populated the manifest file, so this is a fast-path read).

Follow [artifact conventions](../_data/artifact-conventions.md).

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Artifact type: `ticket`. Filename format:

```
{timestamp}_{slug}_ticket.md
```

Example: `20250809-1430Z_fix-memory-leak_ticket.md`
