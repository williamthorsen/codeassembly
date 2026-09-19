# Deployed sizes

Every live `sync` measures what it and `install` deployed and appends a snapshot to a machine-local record. The `sizes` command reads that record and ranks the deployment's documents.

## Where the record lives

The record is a JSONL file under `~/.codeassembly/deployed-sizes/`, one per domain:

| Domain | Path                                                  |
| ------ | ----------------------------------------------------- |
| Repo   | `~/.codeassembly/deployed-sizes/{owner}/{name}.jsonl` |
| Home   | `~/.codeassembly/deployed-sizes/_home.jsonl`          |

`{owner}` and `{name}` come from the repo's git remote. A repo whose remote does not resolve takes `_no-repo` for both segments, which keeps it out of the home domain's record.

The record lives outside every repository so that it does not become a commit candidate in each consumer repo, and so that a home-domain deployment records separately from a repo-domain one. Nothing else reads or writes it, and deleting it discards the history alone: The next sync starts a new one.

The record is capped. Every reader loads it whole, so an append that carries the file past 8 MiB rewrites it with its 200 most recent snapshots and drops the rest. The cap is what keeps a year of appends from becoming a file that every sync and every `sizes` invocation reads end to end.

## What a line states

Each line is one complete size vector rather than a change, because the deltas that a report derives compare complete states.

```json
{
  "schemaVersion": 1,
  "kind": "snapshot",
  "recordedAt": "2026-09-19T08:48:11.489Z",
  "version": "0.15.0",
  "sourceCommit": "9b4f4b9a…",
  "files": {
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

`files` is keyed by deployed path relative to the harness home, or to the domain base for a file deployed outside it, prefixed by the harness that loads it. The prefix is what keeps two harnesses' copies of one skill distinct. The key is a path rather than a slug, because a rulebook deploys as `consult-<slug>` and a skill deploys as a directory of several files. Each value is an object rather than a bare number, which leaves room for later constituent fields without a migration.

A file's own `kind` states whether a harness loads it into context. Classification is by extension: `.md` is a document, everything else an asset. A helper bundle loads into no context, so a ranking that placed it beside a skill body would bury the signal.

## What is measured

Membership comes from `sync`'s own plan and from the install manifest, never from a walk of the harness tree, which holds far more than CodeAssembly deploys. The plan contributes its declared skill directories, its rulebook-delivered skill directories, its delivered source-support entries, and its subagent files; the install manifest contributes `skills/_data/`, the scripts, and the harness guidance templates, in the home domain alone.

A skill deploys as a directory, so the entries inside each directory that the plan names are read at every depth. That walk is bounded by directories that the plan already owns, which leaves a plugin skill and a hand-authored one unreachable from it.

## The three aggregates

| Aggregate      | What it sums                                                  |
| -------------- | ------------------------------------------------------------- |
| `alwaysLoaded` | The bytes that load into a session before it invokes anything |
| `onInvocation` | Every document's bytes, which load as a session opens them    |
| `assets`       | Every asset's bytes, which load into no session's context     |

`alwaysLoaded` names its three components separately, because each is reduced by different work:

- `ambientRegions`: the bytes inside each targeted harness guidance file's ambient region.
- `skillDescriptions`: the `description` frontmatter value of each deployed skill.
- `subagentDescriptions`: the `description` frontmatter value of each deployed subagent.

**The aggregates overlap rather than partition.** A description's bytes count in `alwaysLoaded` and again inside its document's bytes in `onInvocation`, because the description loads with the harness's listing and loads again inside the body. The three totals do not sum to a whole, and nothing that presents them may imply that they do.

`ambientRegions` is the one measured quantity that no file row backs. An ambient region is a span inside a guidance file that the deployment does not own outright, so the region's bytes reach this aggregate and no entry in `files`.

## When a snapshot is appended

Both conditions must hold:

1. The measurement differs from the previous snapshot. A sync that rewrites nothing appends nothing.
2. The tree whose content was deployed is on a commit that the remote-tracking default branch contains, so that the record tracks the default branch's sizes rather than those of each branch under development.

The compared measurement is `files` and `aggregates` together. Comparing the files alone would miss an edit to an ambient rulebook, which deploys no file of its own and changes `alwaysLoaded.ambientRegions` and nothing else; comparing the aggregates too is also what covers a later measured quantity that no file backs.

Which tree the ancestry probes follows the domain. The repo domain's content comes from the consumer repo's own declared sources and declaration, so its branch is the one judged; the home domain's comes from the running package, so the package root is. The default branch resolves from `origin/HEAD`, falling back to `origin/main`. When neither resolves, and when the probed tree is not a git tree at all, the ancestry condition is unanswerable and the append goes through: A tree with no branch has none to be wrong about, and refusing there would stop the record entirely.

`--dry-run` measures nothing, appends nothing, and prints no size line. No size condition can fail a sync: A failure in the pass prints one warning in place of the block and leaves the sync's exit status unchanged.

## What a sync reports

A live sync closes its report with the size block, after the advisories and last of everything it prints.

```console
Deployed sizes:
  +1.3 KiB  claude/skills/plan/SKILL.md  (12.4 KiB)
    +512 B  claude/skills/consult-style/SKILL.md  (added, 512 B)
  -8.1 KiB  claude/skills/retired/SKILL.md  (removed)

Always loaded:  16.1 KiB
  ambient regions:       13.4 KiB
  skill descriptions:    2.7 KiB
  subagent descriptions: 0 B
On invocation:  164.9 KiB across 16 document(s)
Assets:         2378.5 KiB

Run `codeassembly sizes` to rank every deployed document by size.
```

Each line states the change, the deployed path, and the size after the deployment. A removed document states no size, and a removal's delta is its previous bytes negated, which puts a large removal where a large addition would be. The list is ordered by the size of the change, largest first, and by path where two changes are equal. Assets contribute no line, matching what `sizes` ranks.

The list is uncapped. A partial or guidance-hook edit fans out to dozens of documents, and a cap would hide exactly the fan-out that the reader needs to see.

A deployment whose vector is unchanged states the aggregates and the closing line alone. One for which the record holds no previous snapshot states, beneath the header, that it is the first recorded deployment here.

### The growth warning

A warning fires on a **crossing**: the previous snapshot recorded the document below the ceiling and this deployment puts it at or above, a newly deployed document above the ceiling included. A document already at or above the ceiling raises none, which keeps the warning to one appearance per document on the default branch and is what lets the ceiling sit low. A first recorded deployment raises none at all, since it has no crossing to observe.

The ceiling is 5 KiB, held in `GROWTH_CEILING_BYTES` in `src/deployed-sizes/build-size-report.ts`.

```console
⚠️ claude/skills/plan/SKILL.md has passed the 5.0 KiB growth ceiling (12.4 KiB). Run the `streamline-guidance` skill on its source to reduce it.
```

The warning names `streamline-guidance` only when the reader can act on it: the document's source resolves inside the current repository and outside `node_modules`. In a consumer repo a library artifact resolves under the repository root and is not the consumer's to edit, which is what the `node_modules` exclusion covers; a `workspace:*` source resolves through a `node_modules` symlink and is the reader's, which is why containment is tested against canonical paths. A warning that cannot name the skill still states the crossing.

### Off the default branch

A snapshot is appended only from a tree that the default branch contains, so on a feature branch the baseline does not advance: each sync re-reports the same change and re-fires the same warning until the branch merges. That repetition is accepted rather than fixed with a second record stream, so that the report and `sizes` read one baseline and cannot disagree about what the last deployment was.

### What the block does not repeat

The block labels the three totals separately and prints no combined total, so nothing implies that they sum. The overlap disclaimer stays with `sizes`, at which the closing line points.

Warnings reach stderr and the rest of the block reaches stdout, as every other warning in the sync report does, so the two interleave only on a terminal. Each warning names its document and reads correctly on its own.

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
