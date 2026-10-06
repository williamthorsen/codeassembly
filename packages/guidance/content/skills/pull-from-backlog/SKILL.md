---
name: pull-from-backlog
description: Recommend the next ticket to pull from a GitHub backlog, with the backlog's picture, its warnings, and a ranked menu of candidates with each one's reasons
user-invocable: true
---

# Pull from backlog

Recommend the next ticket to work on. A bundled helper reads GitHub, the repository's branches, and groom-backlog's ledger, and reports the picture, the warnings, and the ranked candidates. You present them, offer the grooms that the backlog needs, record the pick, and assign the user on consent.

The skill is re-entrant: Everything it reads is in GitHub and the ledger, so a fresh session and a warm one reach the same menu. When the user says "merged #N" or "done with #N" after a pick, start again at step 1.

**Announce at start:** "Using pull-from-backlog to recommend the next ticket of {repository}."

## Arguments

| Argument            | Description                                                      | Default                |
| ------------------- | ---------------------------------------------------------------- | ---------------------- |
| `--limit <N>`       | Offer the top `N` candidates.                                    | 3                      |
| `--now <milestone>` | Take this open milestone as the Now set, over `ticket.pull.now`. | Resolved by the helper |

GitHub alone is supported, through `gh`. On any other platform, stop at step 1 and report that the skill does not support it.

## Boundary

The skill's one write to GitHub is the assignee, with the user's consent or under `ticket.pull.assignOnPick`. It does not comment on, label, close, or edit any ticket, and its one ledger write is the `pull` record.

## Process

Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `error` and `message`. Invoke the helper as:

```bash
node {harness_home_dir}/skills/pull-from-backlog/pull-from-backlog.mjs {command} {flags}
```

The ledger is `local/ticket-triage/ledger.jsonl` in the primary worktree, shared with groom-backlog; the helper reports its path. If the sandbox denies a write there, stop, and ask the user to allow that path.

### 1. Preflight

1. Run `gh auth status` and `gh repo view --json nameWithOwner`. If either fails, or the repository is not on GitHub, stop and report why.
2. Run the survey, passing only the flags that the invocation names:

   ```bash
   node {harness_home_dir}/skills/pull-from-backlog/pull-from-backlog.mjs survey --limit {N} --now {milestone}
   ```

### 2. Present the picture and the warnings

Present, in this order, and omit a section that is empty rather than reporting a zero:

1. **Now**: the milestone and its due date, with how it was resolved (`now.source`). For `backlog`, say in one line that the repository does not have an open milestone with open issues, so the whole backlog is the Now set.
2. **Umbrellas**: each as `#N title: completed/total done`.
3. **In progress**: each ticket with its branch (`ref`) and the days since its last commit, or its assignees when it does not have a branch. List the user's own (`yours`) first, under their own heading.
4. **Blocked**: each blocked Now ticket with its open blockers.
5. **Warnings**: one line each. `now-not-found`: the configured milestone is not open. `milestone-past-due`: the milestone and the days overdue. `stale-branch`: the ticket, the branch, and the days since its last commit. `blocked-outside-now`: the Now ticket and its blockers outside Now. `groom-stale`: the last groom's date and age, the open tickets created since it, or that the backlog has never been groomed.

### 3. Present the candidates

Render `candidates` as a numbered gradient menu, per [Option format](#option-format), with every candidate's `reasons` as its `➕` lines and its URL. The candidate ranked first takes the strongest marker. The menu is always rendered: Which ticket the user works on next is a preference about their time, which is in the gated class. When `candidates` is empty, say so, name the counts from `counts`, and skip step 4.

Close the turn with an action-items block that asks for the pick. When `groomStale.stale`, the block contains, before the pick, an offer to groom the backlog: `{skill:groom-backlog}` without arguments. When the user takes it, run it, then start again at step 1: A groom can change the candidates.

### 4. Record the pick

1. Record it:

   ```bash
   node {harness_home_dir}/skills/pull-from-backlog/pull-from-backlog.mjs record --ticket {N}
   ```

2. Assign the user. When the survey's `assignOnPick` is `true`, run the command directly; otherwise ask first, with `👍🏼👎🏼`, and run it only on a clear yes:

   ```bash
   gh issue edit {N} --add-assignee @me
   ```

   If the command fails, report `gh`'s message and do not retry. The `pull` record stands: The pick happened, and only the assignee did not.

3. Close with one line: "Start #{N} in its own session."

<!-- include: ../_partials/option-format.md / -->

<!-- include: ../_partials/action-items.md / -->
