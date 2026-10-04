---
name: implement-plan
description: Implement a feature plan's tasks in order against the ticket's acceptance criteria
user-invocable: true
---

# Implement plan

Implement the work described by a feature plan. This skill is the canonical path for implementing a plan: It governs the phase the same way whether the plan was produced moments ago in this conversation or handed to a fresh session on another harness, because it re-resolves everything it needs from the environment rather than relying on conversation history.

## Arguments

| Flag                | Effect                                                                                                          | Default                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `--plan=<path>`     | The plan artifact to implement.                                                                                 | Auto-resolved (see below) |
| `--ticket=<source>` | The ticket that the plan serves. Resolved per [ticket source resolution](../_data/ticket-source-resolution.md). | Auto-resolved (see below) |

## Scope

This skill implements a feature plan, the `## Tasks` / `## Verification` shape defined by the plan template. A spike plan has `## Investigation steps` and a `## Deliverable` instead (see [spike conventions](../_data/spike-conventions.md)): It is carried out to produce findings rather than implemented to produce a diff, and none of the steps below read its shape. Step 4 rejects one.

## The contract

The ticket's acceptance criteria are the contract; the plan is the mechanism by which they are met. When the plan and the facts on the ground disagree, the acceptance criteria decide: A plan step that no longer serves them is the one to abandon.

The plan artifact is read-only. It is a record of what was decided at plan time, and a later reader compares it against the diff to see how implementation departed from it. Never edit it to match what was built: The commits themselves record progress.

## Process

1. **Get context**: Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `default_branch`, `ticket_id`, `ticket_ref`, `ticket_url`, `scm`, `project_slug`, and `artifact_base_dir` from it.

2. **Resolve the plan**: Stop at the first source that yields one:
   - **Explicit `--plan=<path>`**: Read it.
   - **Already in context**: This session produced or read the plan. Use it as-is; do not re-read the file.
   - **Newest plan for the ticket**: The newest of `*_plan.md` and `*_plan-v*.md` under `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` (run subdirectories included), by the greatest `YYYYMMDD-HHMMSSZ` filename prefix. Both forms have that prefix, so they sort chronologically together and the lexicographically greatest is the newest across the two. Because `refine-plan` writes its revision as `_plan-v2.md` under a later prefix than the plan that it revises, matching both forms lets a refined plan take precedence over the original that it supersedes. Do not widen to `*_plan*.md`, which also matches the `_plan-review.md` artifact written beside the revision.
   - **Ask**: The sources above do not resolve a plan. Ask the user for a path rather than implementing from the ticket alone: A caller who invoked this skill has a plan in mind.

   Announce the resolved path and its timestamp before executing anything. Several plans can exist for one ticket, and the newest is not always the intended one: This announcement is how the user catches a superseded plan while the choice is still free. It is not ceremony, and it is not skippable when the resolution was unambiguous.

3. **Resolve the ticket**: Stop at the first source that yields one:
   - **Explicit `--ticket=<source>`**: Resolve per [ticket source resolution](../_data/ticket-source-resolution.md).
   - **Already in context**: This session already resolved the ticket. Use it as-is.
   - **Stored URL**: `ticket_url` from step 1, fetched per [Stored ticket URL](../_data/ticket-source-resolution.md#stored-ticket-url).
   - **Plan provenance**: The plan's frontmatter `ticket_ref` / `ticket_id`, resolved per [auto-resolve](../_data/ticket-source-resolution.md#auto-resolve).
   - **No ticket**: Every source failed; the plan was produced from a free-form description, or the ticket is unreachable. Announce that a ticket does not govern the run and execute against the plan as the sole contract. Do not stall on a missing ticket; do not silently substitute the plan for one without saying so.

4. **Read the plan and the ticket** in full before touching code, including the plan's `## Risks` section: It names where the author expected the work to need adaptation.

   Check the shape as you read: A plan with `## Investigation steps` rather than `## Tasks` is a spike, which this skill does not implement (see [Scope](#scope)). Stop and tell the user the plan is a spike, to be carried out directly rather than implemented here.

5. **Execute the tasks in plan order.** Each task is done when its own acceptance criteria are met, not when its files have been touched. Task order encodes dependencies; do not reorder for convenience. Audit the comments that you write along the way per [Comment discipline](#comment-discipline).

   Raise material divergence to the user before proceeding, rather than rerouting silently. **Material** means the plan's approach no longer fits what the code turns out to be: A named file or symbol does not exist, a task's premise is false, or meeting the acceptance criteria requires an approach that the plan did not consider. Adapting details within the plan's approach (a different helper name, an extra test case, a step that turns out unnecessary because the code already does it) is ordinary implementation; carry on and note it in the closing summary.

   Commit each task's work as its own commit with the `{skill:create-commit}` skill. Everything the closing menu offers reads committed history, so work left uncommitted is work that the next step cannot see.

6. **Audit the diff** per [Diff audit](#diff-audit). Because the audit runs over the work of every task, ahead of the gates, a repair that it forces is itself covered by them. A repair made once the tasks are committed, whether the audit forces it or a gate does, is committed the same way: amended into the commit that it corrects, or made as a commit of its own, composed with the `{skill:create-commit}` skill.

7. **Run the plan's verification gates.** Execute the `## Verification` section's checks and report the actual results. A gate that fails is not done: Fix the cause, or report the failure. Never claim a gate passed without having seen it pass.

8. **Report completion.** Route each fact surfaced by the run per [Fact routing](#fact-routing), then summarize what was built against the ticket's acceptance criteria, naming any criterion left unmet and any divergence from the plan. Every sentence of that summary is read back from the diff per [Diff audit](#diff-audit), a criterion reported unmet as much as one reported met.

9. **Present next steps** following [next-steps options](#next-steps-options).

<!-- include: ../../_partials/comment-discipline.md / -->

<!-- include: ../../_partials/diff-audit-checklist.md / -->

## Fact routing

The audience decides where a fact goes. A fact that the user acts on, such as a decision that is theirs or a divergence that they must weigh, belongs in the response. A fact that a reviewer acts on belongs in the commit body, the pull-request description, or a comment in the source. A fact needed by both goes in the artifact and may be summarized in the response; the artifact is never skipped.

The failure that this prevents is visible in the phrasing: Any wording that treats the reader as an intermediary, such as "worth a reviewer's attention", "flag this in review", or "mention that...", marks a fact that belongs in an artifact. When one is found after the artifact is written, amend the artifact rather than narrate the gap.

None of this suppresses the closing report. Reporting what was built, which acceptance criteria are met, and what diverged from the plan is owed to the user, whose call it is what happens next.

<!-- guidance-hook: implementation-preferences -->

## Next-steps options

### Options

| #   | Emoji | Option                   | Description                                               |
| --- | ----- | ------------------------ | --------------------------------------------------------- |
| 1   | 🚢    | Create PR without review | Open the PR straight from the implementation              |
| 2   | ✂️    | Split the branch         | Cut the branch at a seam into pieces that each ship alone |
| 3   | 🔍    | Review branch            | Run a single end-of-work review pass over the branch      |

### Output format

Present all three options as a numbered list per [option format](#option-format). Each option has a strength marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker. Pros and cons are omitted by default; add a `➕` or `➖` line only when the realized diff presents a tradeoff that survives the option-format tests bearing on which option fits (e.g., "the only behavioral change is a guard in one function, so a review pass has one site to read"). Generic option properties ("structured review pass," "longer wall time") are noise and must be omitted. Include the ticket path in each skill-invoking option line; omit it when a ticket did not govern the run.

**One `➕` line is mandatory rather than omitted.** When Split the branch is the selected option, it must include a `➕` line naming the diff's size, in commits and files changed, and each piece with its commit range as `<first short SHA>..<last short SHA>`, adding the task numbers when the commits map to tasks (rule 2). Selecting it without the line is a defect: If the line cannot be written, the rule did not match and the cascade continues.

Options that invoke a skill include context-clearing guidance:

- **Create PR without review**: No "Clear context" prefix; the PR description is composed from the branch's commits and diff. `create-pr` requires the branch to be in sync with its remote and stops when it is not, so note on the option that it needs the branch pushed first.
- **Split the branch**: No "Clear context" prefix, and no pasted invocation line; the split runs in this session because no skill performs it on its own, and it cuts the pieces from the branch's commits and the saved plan. See [Splitting the branch](#splitting-the-branch).
- **Review branch**: Prepend "Clear context and use..."; a reviewer that watched the code being written inherits the author's blind spots.

Example (rendered for the default case, in which the recommendation rules below select Review branch):

```
Next steps:
1. 🚢 ■□□ Create PR without review:
   - Push the branch first, then use the `create-pr` skill
2. ✂️ ■□□ Split the branch:
   - Selection runs the split in this session
3. 🔍 ■■□ Review branch:
   - Clear context and use the `review-branch` skill with ticket: {ticket_source}
```

Skill names for each option:

- 🚢 **Create PR without review** -> `create-pr`
- ✂️ **Split the branch** -> `{skill:create-ticket}`, once per new piece, in this session
- 🔍 **Review branch** -> `review-branch`

### Recommendation rules

Select the recommended option by checking these rules in order and stopping at the first match. Judge the diff that you actually produced, not the work predicted by the plan's author: A plan-time estimate of how much review the work would need was made before anyone knew what the code would look like, and that estimate is corrected at this menu.

1. **Create PR without review**: The realized diff is trivial enough that a review pass would catch nothing meaningful ([complexity levels 1–2](../_data/complexity-classification.md)): a mechanical rename, a typo fix, a single-file change without a behavioral surface.
2. **Split the branch**: Recommend only when the realized diff is too large for one `review-branch` pass, and its commits contain a seam: a prefix of commits that ships on its own and that you expect to pass the plan's verification gates at its last commit. Both halves are required: Too large without a seam is not a match, and a seam in a diff that one pass would carry is not one either. Pieces whose commits interleave are not a seam, because separating them would take a rebase.

   Structural properties (the diff spans packages or module boundaries, changes a shared contract, or has consequences that ripple past the change sites) make a diff _more likely_ to be too large. They are evidence to weigh, and none of them matches rule 2 on its own.

   With two pieces, rule 2 also fails when any commit after the seam is already on the branch's remote: The split resets the current branch to the seam, and removing a pushed commit would take a force-push.

   When rule 2 matches, the rendered option must name the size and the pieces on a `➕` line. Being unable to write the line means rule 2 did not match.

3. **Review branch**: All other cases (default), whatever the size of the diff.

#### Marker strengths

The selected option's marker follows how cleanly its rule matched: ■■■ when the rule's test is met squarely and the alternatives are worse on the criteria that decided it, ■■□ when the fit is good but an alternative stays defensible, ■□□ when little separates the options. Rule 3 is the cascade's fallthrough rather than a positive match, so its marker follows how squarely rules 1 and 2 failed: ■■■ when neither came close, ■■□ when one stayed defensible. The other two options take ■□□ by default, and □□□ when one has a clear drawback in the current context.

#### Splitting the branch

**Pre-check.** Record the original `HEAD` SHA. Confirm that `git status --porcelain` prints nothing; ignored files, such as installed dependencies, are left alone. With two pieces, confirm that no commit after the seam is on a local remote-tracking ref, without fetching; a branch without an upstream counts as not pushed. When a check fails, report it and stop.

<!-- include: ../_partials/split-ticket-compose.md / -->

**Keep the originating ticket's record.** The work was handed to implementation before this menu, so the originating ticket's new body keeps its `## Problem`, `## Context`, and `## Proposed solution` as written, whatever the number of pieces, and changes its acceptance criteria alone. With two pieces, they become the first piece's criteria, followed by a line naming the ticket that takes the rest.

The confirmation also lists each piece's commit range and boundary SHA, each branch to be created, and, with two pieces, the reset of the current branch to the seam. When the developer changes a boundary at the confirmation, recompose and confirm again.

**Verify the seams.** Before any ticket is created, verify each seam: For each boundary from the last seam back to the first, run `git reset --hard` on the current branch to the boundary, reinstall dependencies when the boundary's lockfile differs from the installed one, and run the plan's `## Verification` gates. Then reset to the original `HEAD`, reinstalling when needed. When a gate fails, reset to the original `HEAD`, report the seam that failed with the gate's output, and stop; nothing has been created.

<!-- include: ../_partials/split-ticket-create.md / -->

**Create the branches.** Create a branch for each piece that the current branch does not keep, at its piece's boundary commit, named per [branch format](../_data/branch-format.md) from the piece's ticket reference and a kebab-case description of its title. With two pieces, the current branch keeps the first piece: The second piece's branch is created at the original `HEAD`, and the current branch is then reset to the seam, so that it holds the first piece under the originating ticket. When no ticket governs the work, the first piece's new ticket does not get a branch of its own; the report names that ticket, which the current branch's name does not encode. With three or more, every piece gets a new branch, and the current branch stays at the original `HEAD` as the umbrella's branch, which is never opened as a pull request.

Never push, force-push, or delete a remote branch, never create a worktree, and never check out a new branch. The resets above are the only history operations, and the recorded SHA and the new branches keep every commit reachable.

**Report.** Report each ticket reference, each branch with its base, and each piece's next step. With two pieces, the first piece continues in this session at Review branch. A piece reviewed in its own worktree runs `review-branch --diff-base=<previous piece's branch>`, which reviews that piece alone because its predecessor's branch is a prefix of its own; the first piece of three or more uses the default diff base. Tell each later piece's session to rebase onto the default branch before its first push, once its predecessor has merged.

<!-- include: ../_partials/option-format.md / -->
