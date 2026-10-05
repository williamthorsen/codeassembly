# Backlog sweep helper

`src/groom-backlog/` contains the helper that the `groom-backlog` skill runs, bundled to `content/skills/groom-backlog/groom-backlog.mjs`. It reads GitHub through `gh` and the repository through `git`, keeps the ledger, and renders the digests and the ticket comments. It does not write anything to GitHub: The skill posts each comment and closes each ticket.

## Commands

Every command except `related` and `pending-ripples` takes `--run <id>`, and every command prints one JSON result to stdout. A result has `ok: true`, or `ok: false` with an `error` code and a `message`; either exits 0. An `error` is `invalid-args`, `invalid-reply`, `invalid-record`, `missing-reply`, `no-baseline`, or `command-failed` (a `gh` or `git` call failed).

```bash
groom-backlog.mjs collect --run <id> --out <dir> [--scope <name>]... [--exclude-label <label>]... [--older-than <N>d|<N>w] [--limit <N>]
groom-backlog.mjs collect --run <id> --out <dir> --related-to <N>
groom-backlog.mjs ingest --run <id> --ticket <file> < reply.md
groom-backlog.mjs record --run <id> < records.json
groom-backlog.mjs digest --run <id> [--page-size <N>]
groom-backlog.mjs comment --run <id> --number <N> --decision <decision> --decided-by <policy|user|bulk> --out <file> [--reason <text>] [--superseded-by <N>]
groom-backlog.mjs related --ticket <N>
groom-backlog.mjs pending-ripples [--ticket <N> | --since <iso>]
```

- **`collect`** fetches the open issues with their labels, comments, and relations (`assignees`, `milestone`, `parent`, `blockedBy`, `subIssues`), and applies the selectors. `--scope` keeps an issue that has the label `scope:<name>`, and accepts either `<name>` or `scope:<name>`. `--exclude-label` drops an issue that has the label, matched exactly. `--older-than` keeps an issue whose `updatedAt` is older than the age. Both `--scope` and `--exclude-label` repeat. It then skips the tickets that the [resume rule](#resume-rule) skips, and `--limit` caps the remainder. It writes one input file per ticket to `<dir>/<number>.json` and reports `sha`, `counts`, `resumed`, `pendingAutomatic`, `groups`, and `tickets`. `pendingAutomatic` lists each resumed ticket whose latest assessment has an auto-close class and does not have a decision after it, with its `class`. The groups are the tickets by scope label, alphabetically, with the unscoped group last; each group lists its tickets oldest first and packs them into waves of up to four.

  With `--related-to <N>`, `collect` selects the [related set](#related-set) of closed ticket `N` in place of the backlog, and refuses `--scope`, `--exclude-label`, `--older-than`, `--limit`, and a ticket that is still open as `invalid-args`. The resume rule applies as usual. The result has one unscoped group in tier order, and a `ripple` field containing the `ripple` record (`kind`, `number`, `pr`, `candidates`) for the skill to append once the set is assessed. Each ticket file has a `ripple` field: `closedNumber`, `closedTitle`, `pr`, `mergeSha` (the merge commit's first eight characters), `files` (at most 200 touched paths, in `gh`'s order), `filesTruncated`, and `tiers` (every tier that the ticket matched).

- **`ingest`** reads one assessor reply on stdin, validates it, and classifies it. The JSON is the reply's last fenced block, or the whole reply when it has none. A valid reply is stored as `assessments/<run>/<number>.json` beside the ledger, and its `assessment` record is appended. A reply that fails validation, or that assesses a ticket other than the one in `--ticket`, is reported as `invalid-reply` and not appended.
- **`record`** appends `decision`, `policy`, `note`, `ripple`, and `pull` records, read on stdin as one JSON object, a JSON array, or JSON lines. It fills in `run`, the timestamp when it is absent, and a decision's `actor` (`agent`). Every record is validated before any is appended.
- **`digest`** renders the run's open escalations: each ticket whose latest assessment in the run has the class `escalate` or `escalate-in-progress` and that does not have a decision recorded after it. `--page-size` is from 20 to 30, and defaults to 25. Each page is Markdown with a numbered entry per escalation, a hub heading for each open ticket on which two or more of the page's escalations depend, and an overlap heading for each group of overlapping tickets, merged by union with its recommended survivor. An entry with an in-progress signal shows the branch, its commits ahead, and its last-commit date.
- **`related`** reports the [related set](#related-set) of closed ticket `--ticket`, with `pr`, `mergeSha`, the count of touched `files`, the `counts` by first tier with their `total`, and the `candidates`. It writes nothing.
- **`pending-ripples`** reports the closed tickets that do not have a `ripple` record in the ledger, each with `number`, `title`, and `closedAt`. With `--ticket`, it reports that ticket when it is closed. Otherwise it reports the tickets closed since a baseline: `--since`, else the latest `pull` record, else the latest `policy` record of a run whose id neither starts with `ripple-` nor ends with `-dry-run`; `baseline` names which. Without any of them, the result is `no-baseline`. It writes nothing.
- **`comment`** renders one ticket's comment body to `--out`: the stored assessment, a `Disposition` line with the reason, a `Remainder` list for a half-met close, and the marker. `--decision` is one of `keep`, `close-complete`, `close-superseded`, `close-not-planned`, `update`, `revise`, and `split`. A bulk decision does not need a stored reply; every other decision does, and without one the result is `missing-reply`.

### Classes

`ingest` classifies a reply into the first class that matches:

| Class                  | Matches                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `escalate-in-progress` | The ticket has an in-progress signal.                                                                                      |
| `auto-close-complete`  | A high-confidence `close-complete` with a verified reference, or with a `complete` progress verdict and progress evidence. |
| `auto-close-half-met`  | A high-confidence reply whose `rule` is `half-met`.                                                                        |
| `silent-keep`          | A `keep` whose drift, relevance, progress, and advisability verdicts are all baseline.                                     |
| `escalate`             | Every other reply.                                                                                                         |

### In-progress signals

A ticket is in progress when one of these names it, in this order of precedence: the `ticket_id` of a worktree's branch manifest, a local branch name, or a remote-tracking branch name. A branch name is parsed as `derive-session-context` parses one. Commits ahead are counted against the default branch, read from `origin/HEAD` or else from GitHub; a remote-tracking branch is counted against its remote's default branch. Nothing is fetched.

### Cross-reference candidates

For each ticket, `collect` lists the merged pull requests that close it, the merged pull requests whose title or body names it as `#N`, and the default-branch commits whose subject names it as `#N`, each merged after the ticket was created. The pass reads the pull requests in one `gh pr list` call and the commits in one `git log` call. It matches text only, so the assessor verifies each candidate.

### Related set

The related set of a closed ticket is the open tickets related to it in one of four tiers, tested in this order:

| Tier           | Matches an open ticket                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `mention`      | Its title, body, or a comment names the closed ticket, or its latest closing pull request, as a `#N` token.                    |
| `blocked`      | Its `blockedBy` contains the closed ticket.                                                                                    |
| `family`       | It is the closed ticket's parent, or another child of that parent.                                                             |
| `file-overlap` | Its text contains a path-like token that equals a file touched by the closing pull request, or a trailing run of its segments. |

A token is path-like when it contains `/` or ends in a dot and one to five alphanumerics, so a bare word such as `index` never matches. A ticket that matches several tiers is listed once, under the first, with every tier that it matched; the set is ordered by that tier, then by number. When the ticket does not have a closing pull request, `mention` matches the ticket number alone and `file-overlap` is empty.

## Ledger

The ledger is the append-only `local/ticket-triage/ledger.jsonl` of the primary worktree, whose root is the parent of the path that `git rev-parse --git-common-dir` prints. A run from any worktree reads and appends the same file. The helper creates the directory on its first append, and only `ingest` and `record` write to it.

Each line is one record, with a `run` and a `kind`:

| Kind         | Fields                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assessment` | `number`, `assessedAt`, `sha`, `ticketUpdatedAt`, `verdicts`, `recommendation`, `confidence`, `reason`, `relatedTickets`, `inProgress`, and, from this helper, `class`, `rule`, `dependsOn`, `overlaps` |
| `decision`   | `number`, `decision`, `actor`, `decidedBy` (`policy`, `user`, or `bulk`), `appliedAt`, and the optional `supersededBy` and `reason`                                                                     |
| `policy`     | `decisions` (free-form), `decidedBy`, `recordedAt`                                                                                                                                                      |
| `note`       | `text`, `recordedAt`                                                                                                                                                                                    |
| `pull`       | `picked` (the tickets picked from the backlog), `sha`, `recordedAt`                                                                                                                                     |
| `ripple`     | `number` (the closed ticket), `pr` (its closing pull request, or `null`), `candidates` (its related set, empty when nothing relates), `recordedAt`                                                      |

The parser keeps fields that it does not know, and reports a line that does not parse rather than failing on it.

### Resume rule

`collect` skips a ticket that has an `assessment` record in this run, unless the ticket's `updatedAt` is later than both that record's `assessedAt` and the latest comment carrying this run's marker. The sweep's own comment therefore does not make a ticket look changed. A dry run has its own run id, so a later real run does not skip the tickets that it assessed.

## Marker

Every comment that the skill posts ends with a marker:

```html
<!-- codeassembly-triage {"run":"2026-10-01","assessedAt":"2026-10-01T12:00:00Z","sha":"abc1234","verdicts":{...},"recommendation":"close-complete","confidence":"high","rule":null,"remainder":[],"decision":"close-complete","actor":"agent","decidedBy":"policy"} -->
```

`>` in the JSON is written as `\u003e`, so that free text cannot close the comment. A bulk decision's marker has null `verdicts`, `recommendation`, `assessedAt`, `sha`, and `confidence`. The latest marker across a ticket's comments is the ticket's prior record, which `collect` passes to the assessor; a marker without `rule` or `remainder` is still read.

## Skill arguments

The skill passes its selectors to `collect` and its page size to `digest`. It also takes:

- `--run <id>`: the run id, defaulting to today's date in UTC.
- `--dry-run`: assess and render the digests without any write to GitHub or any decision. It appends `-dry-run` to the run id, whether that id is the default or given explicitly.
- `--model <alias>`: the model of each `ticket-assessor` dispatch, `opus`, `sonnet`, or `haiku`. The default is `opus`.
- `--related-to <N>`: assess the related set of closed ticket `N` under the run id `ripple-N`, without the bulk-decision step, and append the `ripple` record once the set is assessed, even when it is empty.
