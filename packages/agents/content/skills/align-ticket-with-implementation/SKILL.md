---
name: align-ticket-with-implementation
description: Align an issue ticket with the current branch's implementation
user-invocable: true
dependencies:
  skills:
    - update-jira-ticket
---

# Align ticket with implementation

Produce or revise an issue ticket (e.g., GitHub issue, Jira issue) to describe what the current branch's implementation accomplishes.

## Process

1. **Resolve the source ticket**: Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch`, `ticket_url`, and `ticket_id` from the manifest JSON it emits on stdout. Resolve the ticket the caller names, or failing that the manifest's, per [ticket source resolution](../_data/ticket-source-resolution.md). Whether a source ticket resolves is what selects the branch in [Two branches](#two-branches). Where resolution is ambiguous or fails, take the alignment branch and ask: A lookup that fell through must not be read as licence to author a proposal over one that already exists.

2. **Analyze branch changes**:

```bash
git diff $DEFAULT_BRANCH...HEAD
```

3. **Write the ticket** on the branch step 1 selected, describing issues that were addressed, then write it to the targets [Saving](#saving) names

## Output structure

The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema. See [Frontmatter resolution](#frontmatter-resolution) below for field resolution. The frontmatter conforms to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter).

```markdown
<!-- include: ../_partials/ticket-skeleton.md / -->
```

<!-- include: ../_partials/ticket-skeleton-tiers.md / -->

## Guidance

<!-- include: ../_partials/ticket-concision.md / -->

<!-- include: ../_partials/ticket-placement.md / -->

When aligning to an existing implementation, _the implementation_ is the code on the branch; describe what the code now does, and resist transcribing its mechanism back into the ticket.

### Two branches

What the skill does turns on whether a prior ticket exists, not on how the caller scoped the call.

**Generation, where no prior ticket exists.** The work reached the branch without a ticket, so every section is authored now from the implementation and nothing is overwritten. The skeleton's `## Proposed solution` section is forward-looking by default; here it records the approach the branch actually took, not a proposal still under consideration.

**Alignment, where a prior ticket exists.** `## Problem`, `## Context`, and `## Proposed solution` record what was known and proposed when the ticket was written. Reproduce all three verbatim from the source ticket and revise `## Acceptance criteria` alone, because the criteria alone are the contract an implementation can falsify. A proposal does not become wrong because the implementer did something else, and revising it destroys the only record of what was foreseen. A section the source ticket omits stays omitted: Alignment revises the record and adds nothing to it. The saved artifact is still a complete ticket; only its revision is partial.

Where the implementation diverges from what was proposed, report that divergence in the pull-request description, whose job is to describe the change under review. Do not raise it as a ticket edit, and do not offer it as an option. A reviewer reads the diff to learn what the code does, so an implementation outgrowing its proposal is an ordinary finding rather than a defect in the ticket.

The source ticket is the one the caller names. A review names it in its `## Specification compliance` section, which records the source the review measured against, the remote issue or the local snapshot.

<!-- include: ../_partials/ticket-criteria-conventions.md / -->

**Ratified-delta mode.** When the caller supplies a delta it has already put to the user, such as a review's proposed-edit preview, the previewed delta is the whole of the revision. Apply exactly its lines and reproduce every other criterion and section verbatim. Seek no further divergence between the ticket and the implementation: What the caller's user consented to is those lines, not alignment as such. When applying a line reveals a change the delta does not contain, stop and report it rather than widening the edit.

Invoked with no delta, alignment revises whichever criteria the implementation falsifies. The mode bounds how much of `## Acceptance criteria` changes; it never widens what alignment may touch. It also decides whether the remote write is confirmed first, per [Write targets](#write-targets).

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

### Write targets

The skill writes two artifacts: the ticket of record on its platform, and a local ticket artifact at the path [Path resolution](#path-resolution) derives. The frontmatter belongs to the local artifact alone; the body written to the platform carries none.

**The ticket of record** resolves from the session-context manifest, from `ticket_url` or from `ticket_id` with `scm`. Which artifact supplied the source content in step 1 does not decide it: A caller can name a local snapshot while a remote issue exists, so a source that resolved locally still writes the remote the branch belongs to.

**Alignment writes it; generation does not.** On the alignment branch, apply the criteria revision to the remote's current body and write it per [platform-specific write](../_data/ticket-source-resolution.md#platform-specific-write), which is what leaves `## Problem`, `## Context`, and `## Proposed solution` as the platform holds them. The generation branch reached the branch with no prior ticket, so no ticket of record exists to write.

**Consent comes from the caller.** Ratified-delta mode carries the user's consent to the remote write: The caller put the delta to the user and the user selected it, so no further ask precedes the write. Invoked with no delta, render the criteria revision as a delta and confirm before writing.

**Order and reporting.** Write the remote, then save the local artifact, then report. A remote write that fails leaves the artifact saved and is reported as a failure, naming the manual step that remains; where no remote resolved, report that the remote was not updated. Never report the criteria as updated on the strength of the local artifact alone.

### Path resolution

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; read `artifact_base_dir`, `project_slug`, and `ticket_id` from it (the same invocation in step 1 already populated the manifest file, so this is a fast-path read).

Follow [artifact conventions](../_data/artifact-conventions.md).

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Artifact type: `ticket`. Filename format:

```
{timestamp}_{slug}_ticket.md
```

Example: `20250809-1430Z_fix-memory-leak_ticket.md`
