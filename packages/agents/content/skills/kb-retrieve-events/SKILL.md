---
name: kb-retrieve-events
description: Query the knowledge base for events relevant to a task and return a list ranked by recurrence and recency
user-invocable: true
---

# Retrieve knowledge-base events

Surface the knowledge-base events most relevant to a query. Events are the raw observations captured to refine the knowledge proper; this skill recalls them and ranks by how often a pattern recurs. A bundled helper does the mechanical recall — it resolves which knowledge bases to search, runs ripgrep over the event files, expands query terms through the tag aliases, and emits a structured candidate table. You then rank those candidates by genuine relevance and present a ranked list.

For assertion recall — the canonical knowledge-base notes — use `kb-retrieve` instead. This skill returns only events.

**Announce at start:** "Using kb-retrieve-events to search for {query}."

## Arguments

| Argument       | Description                                                                       | Required |
| -------------- | --------------------------------------------------------------------------------- | -------- |
| `<query>`      | The free-text search query. All non-flag tokens are joined into the query string. | Yes      |
| `--all-kbs`    | Widen the search to every registered knowledge base, not just the default scope.  | No       |
| `--min-impact` | Keep only events rated at or above the given level; unrated events are dropped.   | No       |
| `--store`      | Scope the search to a single registered knowledge base by name (alias: `--kb`).   | No       |
| `--tag`        | Keep only events carrying this tag (canonical or alias form), case-insensitively. | No       |

A value-bearing flag accepts both `--tag fix` and `--tag=fix`. `--min-impact` takes one of the impact levels, ordered `low` < `medium` < `high` < `critical`; an absent or out-of-range value is rejected with a usage message.

### Scope

By default the helper searches up to two knowledge bases: the one discovered by walking up from the current directory for a `.kb/` folder, plus the registry's `default_kb`. `--all-kbs` widens the search to every knowledge base in the merged `kb.yaml` registry.

`--store <name>` (alias `--kb <name>`) narrows the search to a single registered knowledge base, resolved by registry name alone — no `.kb/` discovery walk runs. Use it to query a named event store directly, such as the `codeassembly` store. A name that matches no registry entry yields an empty result with an explanatory diagnostic.

Within each knowledge base, recall is limited to the notes the store declares — the files matching its configured `targets`/`exclude` (the same note set `kb check` enforces). Events live under `content/events/`.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb`.
- **`ripgrep` (`rg`)** — the recall backend; the helper exits with a remediation hint when it is missing.

## Process

### 1. Run the recall helper

Invoke the co-located bundled helper with `node`, passing the query and any flags through verbatim:

```bash
node "$(dirname "$SKILL_PATH")/kb-retrieve-events.mjs" <query> [--all-kbs] [--store <name>] [--tag <tag>] [--min-impact <level>]
```

Or, when the skill directory is known:

```bash
node {harness_home_dir}/skills/kb-retrieve-events/kb-retrieve-events.mjs "flaky timer" --store codeassembly
```

Triage the most consequential events by floor on impact:

```bash
node {harness_home_dir}/skills/kb-retrieve-events/kb-retrieve-events.mjs "flaky timer" --store codeassembly --min-impact high
```

The helper prints a JSON object to stdout:

- `candidates` — an array of event candidates, each with `path`, `summary` (the event's human-readable summary, or the file basename when absent), `capturedAt` (its ISO-8601 capture timestamp, or `null`), `tags`, `snippet`, and `kbName`. Each also carries `occurrences` — a coarse recurrence count of how many query-matched events share its `repo` — and, when present, `repo` (its `owner/name` repository), `addressedBy` (references recording what was done about the problem it notes), and `impact` (the author's rating, one of `low` < `medium` < `high` < `critical`; absent when the event is unrated).
- `scopedKbs` — the knowledge bases that were actually searched.
- `warnings` — an array (possibly empty) of registry-health problems, present even when candidates are returned.
- `diagnostic` — present only when scope is empty or no events matched.

### 2. Rank the candidates

Parse the JSON and rank the `candidates` by genuine relevance to the query's intent. Tag overlap with the query is **evidence**, not a term in a weighted sum. Read each `snippet` to judge whether the event actually bears on the query rather than merely mentioning its terms.

Once relevance is established, rank by recurrence, then recency: a candidate with a higher `occurrences` count reflects a pattern seen repeatedly in the same `repo` and outranks a one-off of equal relevance; break ties by `capturedAt`, most recent first. Recurrence is a coarse count of query-matched events sharing the group, not a precise cluster — treat it as a strong-but-soft signal.

Do not rank by `impact`. It is the author's subjective rating, orthogonal to a query's relevance, so it is shown to the reader and available as the `--min-impact` filter but never folded into the ordering.

### 3. Present a ranked list

Present the ranked events, each showing `summary`, `path`, `capturedAt`, and `snippet`, plus `impact` when the event carries one. Apply this annotation:

- **Addressed problems** — when a candidate carries `addressedBy`, surface its references so a recurring-but-addressed problem reads as _addressed_ rather than _unaddressed_. The references are heterogeneous (a KB note, a commit, a PR/issue, or a URL), and the relation is neutral: it records what was done about the problem, not that the problem is verifiably resolved. The event remains a true observation worth keeping.

### 4. Report empty results plainly

When the helper returns a `diagnostic` and no candidates, report the empty result plainly; do not treat it as an error. `diagnostic` explains **why the result is empty**:

- `no knowledge base configured or discovered`: No `.kb/` folder was found and no registry is configured.
- `store "<name>" is not registered in kb.yaml`: The named `--store` matched no registry entry.
- `registry invalid: …`: The only configured `kb.yaml` registry failed to load; this is a setup problem to fix, not a missing-events outcome.
- `no notes matched the query`: The knowledge bases were searched but nothing matched; suggest broadening the query or adding `--all-kbs`.
- `all matches were filtered out`: Matches were found but every one was excluded by `--tag`; suggest dropping or loosening the filter.
- `all matches were below the --min-impact threshold of <level>`: Events matched, but every one was rated below the `--min-impact` floor or was unrated; suggest lowering or dropping the filter.
- `matches were found but none are events; use kb-retrieve for assertion recall`: The query matched only non-event records; the reader likely wants `kb-retrieve`.

### 5. Relay registry-health warnings

`warnings` is separate from `diagnostic`: it reports **what is wrong with the registry**, and it is present even when candidates are returned. Always relay any warning to the user as a setup problem to fix — not as a failed query:

- `registry invalid: …`: The `kb.yaml` registry could not be loaded; entries it would have contributed are missing from the search.
- `… path does not exist: …`: A registry entry names a knowledge base whose directory is absent on disk, so that KB was skipped; the entry or the directory needs fixing.

## Completion

A ranked list of relevant events with recurrence and addressed-by annotations, or a plain empty-result report.
