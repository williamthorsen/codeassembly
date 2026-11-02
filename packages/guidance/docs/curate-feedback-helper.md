# Feedback curation helper

`src/curate-feedback/` contains the helper that the `curate-feedback` skill runs, bundled to `content/skills/curate-feedback/curate-feedback.mjs`. It prepares the assignments that the `feedback-coverage-judge` subagents read, checks the bins that they write, and records the run. It does not write to a store: The skill marks events through `kb-update-events`. The inventory and the cluster map that it reads come from `lesson-clusters`, described in [Feedback triage helpers](triage-feedback-helper.md).

Every command prints one JSON result to stdout: `ok: true` with the command's fields, or `ok: false` with an `error` code and a `message`, in which case the command exits 1. `--source` may be repeated; every other flag may be given once. `--help` lists the commands and flags.

## Commands

- `references --store <name> --out <file>` lists the duplicate targets: each `feedback` event, not tagged `obsolete` or `rejected`, with at least one eligible reference. An eligible reference is neither a triage artifact nor a covered permalink, and each entry lists only its eligible references, which are what a duplicate copies.
- `pin --source <dir>... --out <file>` pins the repository of each source directory, after resolving symlinks, at the SHA of `origin/{default branch}` after a fetch. Directories in one repository share a pin. A directory outside a repository, or one whose `origin` is not on GitHub or whose default branch cannot be resolved or fetched, goes to `skipped` with its reason. The command reads `remote.origin.url` as configured, before `insteadOf` rewriting.
- `assign --inventory <file> --map <file> --references <file> --pins <file> --out <dir> [--group-size <n>]` checks the map against the inventory, as `lesson-clusters clusters` does, then packs whole clusters, first-fit in map order, into `assignment-NN.json` files of at most `--group-size` events (default 60). A cluster larger than the size forms an assignment of its own. Each assignment contains the store, its clusters with their events, the references, and the pins; its judge writes `bins-NN.json` beside it.
- `validate --assignments <dir> --out <record.json>` checks each bins file against its assignment and reports every violation at once as `invalid-bins`, each naming its file and event: an event missing, placed twice, or not in the assignment; a covered entry whose `source` is not a pinned repository, whose `path`, relative to the repository root, does not exist at the pin, or whose `quote` is missing or does not appear in that file, ignoring differences in whitespace and in `*`, `_`, and backtick markers; a duplicate whose `duplicateOf` is not a references entry; and a non-kept entry without a `reason`. A missing bins file is a violation too. When the bins pass, it writes the curation record: each event's bin, reason, reference, covered quote, and bins file; the per-bin counts; and the marks, one group per distinct reference set plus the `obsolete` ids, each with a `result` of `null` until the skill applies it.
- `render --file <record.json> --out <file>` writes the `feedback-curation` artifact body: the counts, the pinned commits, each mark with its result, and a table of every event with its quote.

A covered bins entry reads:

```json
{ "id": "01K...", "bin": "covered", "source": "owner/repo", "path": "rules/releases.md", "quote": "Tag a release only from the default branch.", "reason": "The event asks that a release never be tagged from a feature branch." }
```

A covered reference is `https://github.com/{owner}/{repo}/blob/{sha}/{path}`. `validate` composes it from the pin, so a judge names only the repository and the path. `schemas.ts` defines the shape of every file.
