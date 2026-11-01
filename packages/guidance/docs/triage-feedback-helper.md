# Feedback triage helpers

The `triage-feedback` skill runs two helpers. Neither writes to a store or a tracker: The skill marks events through `kb-update-events` and files tickets through `create-ticket`.

- `src/lesson-clusters/`, bundled to `content/skills/lesson-clusters/lesson-clusters.mjs`, groups feedback events into lesson clusters. Its directory does not contain a `SKILL.md`, so it deploys as a helper alone, and any skill that clusters feedback runs the same bundle.
- `src/triage-feedback/`, bundled to `content/skills/triage-feedback/triage-feedback.mjs`, validates the triage record and renders the `feedback-triage` artifact.

Every command prints one JSON result to stdout: `ok: true` with the command's fields, or `ok: false` with an `error` code and a `message`, in which case the command exits 1. Each bundle's `--help` lists its commands and flags.

## Lesson clusters

`inventory --store <name>` resolves the store as `kb-update-events` does and writes two lists of `feedback`-tagged events, leaving out every event tagged `obsolete` or `rejected`:

- `pool`: the events without any `addressed-by` reference.
- `deferred`: the events tagged `deferred` whose every reference is a triage artifact, a basename of the form `{YYYYMMDD-HHMMSS}Z_{slug}_feedback-triage.md`. Each entry contains `deferredAt`, the latest such timestamp. A deferred event that a later reference, such as a ticket, addresses is in neither list.

Each entry contains the event's id, summary, capture time, `skill`, `repo`, and `impact` when set, and an excerpt: the body's first paragraph, cut to 400 characters. An event file that does not parse is reported in `skipped`.

An inventory too large for one clusterer is clustered in batches:

- `batch --inventory <file> --out <dir>` writes `batch-NN.json` files of at most `--batch-size` events (default 150), each in the inventory's shape. It orders the events by `skill`, with the events that do not have one last, then by capture time, so that events likely to share a lesson land in one batch.
- `lessons --batches <dir> --out <file>` checks each batch against the `map-NN.json` beside it, as `clusters` checks a map, and reports every batch's violations at once, each naming its batch. It writes the batch clusters as a lesson inventory: one entry per batch cluster, with the id `{batch}/{cluster}`, the lesson as its summary, and its events' summaries as its excerpt.
- `combine --batches <dir> --lessons <file> --map <file> --out <file>` checks the merge pass's map against the lesson inventory and expands it into one event map.

`clusters --inventory <file> --map <file>` checks the clusterer's map against the inventory, reporting every unknown, duplicated, and missing event and every empty cluster at once as `invalid-map` with a `violations` list. A valid map is written with each cluster's signals: `recurrence`, `impact` (counts per rating, `unrated` included), `firstCapturedAt`, `latestCapturedAt`, and `status`. A cluster is `deferred-active`, and written to `excluded` rather than `clusters`, when every member is deferred and its latest deferral is more recent than the deferral interval. The interval is `--defer-days`, then [`triage_feedback.defer_days`](preferences.md#triage_feedback), then 30 days.

Of the eligible clusters, `clusters` writes only the candidates, the clusters that a triage ranks: Each signal nominates its own top clusters by recurrence, by the count of high and critical ratings, and by latest capture, four times `--limit` (default 5) of them, so that one critical event or a recent spike is considered beside the clusters that recur most. `unranked` counts the clusters and events that no signal nominated.

## Triage records

`validate --file <record.json>` checks the record's shape and the rules that span its fields, and reports every violation at once as `invalid-record` or `rule-violation`. The rules include an `artifactPath` that the inventory recognizes as a triage artifact, surfaced clusters that are the first `limit` in surfacing order (priority, recurrence, latest capture), a `remainder` that counts the rest together with the `unranked` clusters, and a `result` consistent with the decision and the disposition. The result reports `surfaced` and `pending`, the approved clusters whose events are not yet marked, from which a resumed run continues. `record-schema.ts` defines the shape.

`render --file <record.json> --out <file>` writes the artifact body: a table of the surfaced clusters, the remainder line, and each cluster's event ids.
