# Deployed sizes

Every live `sync` measures what it and `install` deployed and appends a snapshot to a machine-local record. The `sizes` command reads that record and ranks the deployment's documents.

## Where the record lives

The record is a JSONL file under `~/.codeassembly/deployed-sizes/`, one per domain:

| Domain | Path                                                  |
| ------ | ----------------------------------------------------- |
| Repo   | `~/.codeassembly/deployed-sizes/{owner}/{name}.jsonl` |
| Home   | `~/.codeassembly/deployed-sizes/_home.jsonl`          |

`{owner}` and `{name}` come from the repo's git remote. A repo whose remote does not resolve takes `_no-repo` for both segments, which keeps it out of the home domain's record.

The record lives outside every repository so that it does not become a commit candidate in each consumer repo, and so that a home-domain deployment records separately from a repo-domain one. Nothing else reads or writes it, and deleting it costs the history alone: The next sync starts a new one.

## What a line states

Each line is one complete size vector rather than a change, because the deltas that a report derives compare complete states.

```json
{
  "schemaVersion": 1,
  "kind": "snapshot",
  "recordedAt": "2026-09-19T08:48:11.489Z",
  "version": "0.15.0",
  "sourceCommit": "9b4f4b9a…",
  "documents": {
    "claude/skills/plan/SKILL.md": { "bytes": 4096, "kind": "document" },
    "claude/skills/plan/run.mjs": { "bytes": 611000, "kind": "asset" }
  },
  "aggregates": {
    "alwaysLoaded": { "total": 45, "ambientRegions": 0, "skillDescriptions": 45, "subagentDescriptions": 0 },
    "onInvocation": 4096,
    "assets": 611000
  }
}
```

`kind` discriminates the line. A reader returns the last line whose `kind` is `snapshot` and reads past anything else, so a later marker written into the same record does not disturb it. A malformed or truncated final line is skipped the same way: The record is machine-local telemetry, and losing one line must not fail a deployment or a report.

`version` and `sourceCommit` name the build that deployed and the commit that its source sat on, matching what `home-provenance.json` stamps. A published install is not a git tree and states no `sourceCommit`.

`documents` is keyed by deployed path relative to the harness home, or to the domain base for a file deployed outside it, prefixed by the harness that loads it. The prefix is what keeps two harnesses' copies of one skill distinct. The key is a path rather than a slug, because a rulebook deploys as `consult-<slug>` and a skill deploys as a directory of several files. Each value is an object rather than a bare number, which leaves room for later constituent fields without a migration.

`kind` inside a document value states whether a harness loads the file into context. Classification is by extension: `.md` is a document, everything else an asset. A helper bundle loads into no context, so a ranking that placed it beside a skill body would bury the signal.

## What is measured

Membership comes from `sync`'s own plan and from the install manifest, never from a walk of the harness tree, which holds far more than CodeAssembly deploys. The plan contributes its declared skill directories, its rulebook-delivered skill directories, its delivered source-support entries, and its subagent files; the install manifest contributes `skills/_data/`, the scripts, and the harness guidance templates, in the home domain alone.

A skill deploys as a directory, so the entries inside each directory that the plan names are read at every depth. That walk is bounded by directories that the plan already owns, which leaves a plugin skill and a hand-authored one unreachable from it.

## The three aggregates

| Aggregate      | What it sums                                                          |
| -------------- | --------------------------------------------------------------------- |
| `alwaysLoaded` | The bytes a session pays before it invokes anything                   |
| `onInvocation` | Every document's bytes, which is what a session pays as it opens them |
| `assets`       | Every asset's bytes, which no session pays for as context             |

`alwaysLoaded` names its three components separately, because each is reduced by different work:

- `ambientRegions`: the bytes inside each targeted harness guidance file's ambient region.
- `skillDescriptions`: the `description` frontmatter value of each deployed skill.
- `subagentDescriptions`: the `description` frontmatter value of each deployed subagent.

**The aggregates overlap rather than partition.** A description's bytes count in `alwaysLoaded` and again inside its document's bytes in `onInvocation`, because a session pays for the description in the harness's listing and pays for it a second time when the body loads. The three totals do not sum to a whole, and nothing that presents them may imply that they do.

## When a snapshot is appended

Both conditions must hold:

1. The measured vector differs from the previous snapshot. A sync that rewrites nothing appends nothing.
2. The deploying source tree's `HEAD` is an ancestor of the remote-tracking default branch, so that the record tracks what the default branch costs rather than what each branch under development costs.

The default branch resolves from `origin/HEAD`, falling back to `origin/main`. When neither resolves, and when the source is not a git tree at all, the ancestry condition is unanswerable and the append goes through: A published install has no branch to be wrong about, and refusing there would stop the record entirely.

`--dry-run` measures nothing and appends nothing. No size condition can fail a sync: A failure in the pass prints one warning and leaves the sync's report and exit status unchanged.

## Reading the record

```console
$ codeassembly sizes
Deployment recorded 2026-09-19T08:48:11.489Z by codeassembly 0.15.0

  196 B  claude/skills/consult-style/SKILL.md

Always loaded:  45 B
  ambient regions:       0 B
  skill descriptions:    45 B
  subagent descriptions: 0 B
On invocation:  196 B across 1 document(s)
Assets:         0 B
```

The domain comes from the working directory, or from the home record under `--global`. Assets are excluded from the ranking and reported as the asset total alone.

The command reads the record rather than the deployed tree, so it answers from a worktree that never deploys. A domain that has never deployed prints the sync that would record one and exits zero.
