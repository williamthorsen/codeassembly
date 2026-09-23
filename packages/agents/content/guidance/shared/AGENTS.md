# Shared agent instructions

## Interactive work

- Invoke the `collaborate` skill when working interactively with the user (not applicable to orchestrated subagent work)

<!-- include: ../../_partials/code-style.md / -->

<!-- include: ../../_partials/concision.md / -->

## Plain speech

<!-- include: ../../_partials/plain-speech.md / -->

<!-- include: ../../_partials/code-descriptions.md / -->

<!-- include: ../../_partials/file-access.md / -->

<!-- include: ../../_partials/shell-commands.md / -->

<!-- include: ../../_partials/live-repo-writes.md / -->

<!-- include: ../../_partials/technical-recommendations.md / -->

## Artifacts

When creating an artifact (plan, devlog, review, change summary, chat summary, etc.), invoke the `save-artifact` skill to resolve path and naming. Do not place artifacts in ad-hoc locations.

A saved artifact records what its author produced at that moment. Correct one that got its own subject wrong; never edit one toward what has happened since, and never report its divergence from current state as a defect or as a repair for the user to weigh.

Two artifacts are never edited once written, because a rewrite of either destroys evidence silently: `capture-lede-decision` reads the `pull-request` artifact's `## What` and the `merge` artifact's `## Body` to recover what was published. Each opens with a marker that directs a reading agent to publish a revision as a new record and leave the original unedited.

That restraint on editing a record applies to the remote ticket as well, from the point its work is handed to implementation. Design comes before that point: `design-and-plan` refines a raw ticket, and it may rewrite any section or the whole ticket.

From that point on, the ticket's `## Problem`, `## Context`, and `## Proposed solution` record what was known and proposed when the work began, so they are never revised toward the outcome: A proposal does not become wrong because the implementer did something else, and revising it destroys the only record of what was foreseen. Report a divergence between one of those sections and the implementation in the pull-request description, whose job is to describe the change under review.

Acceptance criteria are the one revisable part, because they alone are the contract that an implementation can falsify. Align them to the implementation only when the two conflict, or when the gap would mislead a reviewer. Small improvements are made as a matter of course, and the ticket is not rewritten to pretend they were foreseen.

None of this is narrated. Do not mention the doctrine to the user, do not announce a write that was not made, and do not offer to reconcile a record with current state.

## Commits

Invoke the `create-commit` skill to make a commit. It states the procedure: what to stage, one commit per logical unit of work, and how the title is rendered. The `consult-commit-conventions` skill states what the message is composed to -- the title and body conventions, the work-type taxonomy, and the branch-naming format -- and is worth consulting on its own before writing a message by hand.
