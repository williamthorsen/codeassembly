# Next-ticket helper

`src/pull-from-backlog/` contains the helper that the `pull-from-backlog` skill runs, bundled to `content/skills/pull-from-backlog/pull-from-backlog.mjs`. It reads GitHub through `gh`, the repository through `git`, and groom-backlog's [ledger](groom-backlog-helper.md), using groom-backlog's fetch, in-progress, and ledger modules. It does not write anything to GitHub: The skill assigns the picked ticket.

## Commands

Every command prints one JSON result to stdout. A result has `ok: true`, or `ok: false` with an `error` code and a `message`; either exits 0. An `error` is `invalid-args`, `invalid-config` (a `ticket.pull` key fails the [schema](#configuration)), or `command-failed` (a `gh` or `git` call failed).

```bash
pull-from-backlog.mjs survey [--limit <N>] [--now <milestone>]
pull-from-backlog.mjs record --ticket <N> [--ticket <N>]...
```

- **`survey`** reports the backlog and writes nothing. The result contains:
  - `user`: the `gh` user's login.
  - `now`: the [Now set](#now-set), with `source` and `notFound`.
  - `counts`: the open tickets (`open`), the [excluded](#excluded-tickets) ones (`excluded`), the eligible ones in Now (`inNow`), and the Now candidates before `--limit` (`candidates`).
  - `umbrellas`: each open ticket with sub-issues that is in Now or is the parent of a Now ticket, with `completed` and `total`.
  - `inProgress`: each open ticket with an [in-progress signal](groom-backlog-helper.md#in-progress-signals) or an assignee, with `ref`, `lastCommitAt`, `daysSinceLastCommit`, and `assignees`; `yours` lists those assigned to `user`.
  - `blocked`: each Now ticket with its open blockers.
  - `candidates`: the top `--limit` (default 3) [candidates](#candidates), each with `reasons`, the ranking rules that fired, and `inNow`, which is `false` for a candidate that [fills the menu](#filling-the-menu) from outside Now.
  - `warnings`: the [warnings](#warnings).
  - `groomStale`: the [groom staleness](#groom-staleness).
  - `assignOnPick`, `ledger`, and `ledgerDefects`.
- **`record`** appends one `pull` record to the ledger: `picked` (the `--ticket` values), `sha` (the short `HEAD`), `recordedAt`, and the run id `pull-{YYYY-MM-DD}`.

## Now set

The Now set is a milestone, resolved in this order:

1. `--now`, then `ticket.pull.now`, when it names an open milestone. Otherwise `notFound` names it and resolution continues.
2. The open milestone with the nearest due date, overdue ones included.
3. The open milestone with the most open eligible issues.
4. The whole backlog, with `milestone: null`.

Steps 2 and 3 skip a milestone that does not have any open eligible issue.

## Excluded tickets

An open ticket that carries one of the `excludeLabels` labels, compared trimmed and without regard to case, is excluded: It is never a candidate, and it does not count toward resolving Now or toward `counts.inNow`. It still appears in `umbrellas`, `inProgress`, `blocked`, and `warnings`, and it still blocks the tickets whose `blockedBy` names it.

## Candidates

A candidate is an open, non-excluded ticket in Now whose `blockedBy` tickets are all closed, that has neither an in-progress signal nor an assignee, and that does not have open sub-issues of its own. Candidates rank by these keys, in order:

| Key      | Ranks first                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Umbrella | A child of an open parent with some, but not all, children completed; among them, the higher completed ratio, then the older parent. |
| Blocking | More open tickets whose `blockedBy` names it.                                                                                        |
| Priority | The highest of its labels under `priorityPrefix`: `high`, `medium`, `low`, then any other value or none.                             |
| Age      | The older `createdAt`, then the lower number.                                                                                        |

A repository that does not use sub-issues or blockers ranks by priority and age alone.

### Filling the menu

When Now is a milestone and yields fewer than `--limit` candidates, the remaining places are filled with the tickets outside Now, unmilestoned or in another milestone, that would otherwise be candidates. They are ranked by the same keys and placed after every Now candidate, with `inNow: false`.

## Warnings

In this order:

| Kind                  | Fires when                                                             |
| --------------------- | ---------------------------------------------------------------------- |
| `now-not-found`       | The configured Now milestone is not open.                              |
| `milestone-past-due`  | An open milestone's due date is at least a day past.                   |
| `stale-branch`        | An in-progress ticket's last commit is at least `staleBranchDays` old. |
| `blocked-outside-now` | A Now ticket is blocked by an open ticket outside Now.                 |
| `groom-stale`         | The groom is [stale](#groom-staleness).                                |

## Groom staleness

The last groom is the latest `policy` record of a run whose id neither starts with `ripple-`, which earlier ripple runs wrote, nor ends with `-dry-run`. The groom is stale when there is none, when it is at least `staleGroomDays` old, or when at least `staleGroomNewTickets` open tickets were created after it. `reasons` lists `never`, `age`, and `new-tickets` as they apply.

## Configuration

`survey` reads `ticket.pull` from the project's `.agents/preferences.yaml`, not from the global file. The keys and their defaults are listed in [Preferences](preferences.md#ticketpull).
