---
name: kb-retrieve
description: Query the knowledge base for notes relevant to a task and return a ranked list with freshness, recurrence, and supersession signals
user-invocable: true
---

# Retrieve knowledge-base notes

Surface the knowledge-base notes most relevant to a query. A bundled helper does the mechanical recall — it resolves which knowledge bases to search, runs ripgrep over note files, expands query terms through the tag aliases, and emits a structured candidate table. You then rank those candidates by genuine relevance and present a ranked list.

The split is deliberate: the helper is wide and mechanical; the ranking is narrow and judgment-driven. Treat the helper's output as evidence, not as a finished answer.

**Announce at start:** "Using kb-retrieve to search for {query}."

## Arguments

| Argument     | Description                                                                              | Required |
| ------------ | ---------------------------------------------------------------------------------------- | -------- |
| `<query>`    | The free-text search query. All non-flag tokens are joined into the query string.        | Yes      |
| `--all-kbs`  | Widen the search to every registered knowledge base, not just the default scope.         | No       |
| `--store`    | Scope the search to a single registered knowledge base by name (alias: `--kb`).          | No       |
| `--diataxis` | Keep only notes whose `diataxis` facet matches (e.g. `howto`, `concept`, `reference`).   | No       |
| `--tag`      | Keep only notes carrying this tag (canonical or alias form), matched case-insensitively. | No       |
| `--folder`   | Keep only notes whose path contains this folder segment.                                 | No       |

A value-bearing flag accepts both `--diataxis howto` and `--diataxis=howto`.

### Scope

By default the helper searches up to two knowledge bases: the one discovered by walking up from the current directory for a `.kb/` folder, plus the registry's default-marked knowledge base (the global vault). When neither source resolves, or the two resolve to the same path, the default scope contains fewer than two. `--all-kbs` widens the search to every knowledge base declared in the merged `kb.yaml` registry.

`--store <name>` (alias `--kb <name>`) narrows the search to a single registered knowledge base, resolved by registry name alone — no `.kb/` discovery walk runs, so a project-local `.kb/` the helper happened to be invoked near never enters scope. Use it to query a named store directly, such as the `codeassembly` event store. A name that matches no registry entry yields an empty result with an explanatory diagnostic.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb`.
- **`ripgrep` (`rg`)** — the recall backend; the helper exits with a remediation hint when it is missing.

## Process

### 1. Run the recall helper

Invoke the co-located bundled helper with `node`, passing the query and any flags through verbatim:

```bash
node "$(dirname "$SKILL_PATH")/kb-retrieve.mjs" <query> [--all-kbs] [--store <name>] [--diataxis <label>] [--tag <tag>] [--folder <folder>]
```

Or, when the skill directory is known:

```bash
node {platform_home_dir}/skills/kb-retrieve/kb-retrieve.mjs "pnpm workspace setup" --diataxis howto
```

The helper prints a JSON object to stdout:

- `candidates` — an array of candidate notes, each with `path`, `title`, `diataxis`, `tags`, `snippet`, `lastVerifiedAgeDays`, `supersession`, and `kbName`. A candidate whose record type is ranked by recurrence-recency (the default `event` type, and any custom type that declares that policy) also carries `capturedAt` (its ISO-8601 capture timestamp), `repo` (its `owner/name` repository when known), and `occurrences` (a coarse recurrence count — how many query-matched records share its `repo`). These three are absent on freshness-ranked candidates.
- `scopedKbs` — the knowledge bases that were actually searched.
- `warnings` — an array (possibly empty) of registry-health problems, present even when candidates are returned.
- `diagnostic` — present only when scope is empty or no notes matched.

### 2. Rank the candidates

Parse the JSON and rank the `candidates` by genuine relevance to the query's intent. Tag, Diátaxis, and folder overlap with the query are **evidence**, not terms in a weighted sum — a note in the right folder with the wrong intent ranks below a note that directly answers the question. Read each `snippet` to judge whether the note actually addresses the query rather than merely mentioning its terms.

Ranking follows each candidate's recall policy — the ranking semantics its record type declares in the store schema — once relevance is established. The two default record types are the common cases; a custom record type ranks by whichever policy it declares, surfaced through the same signals:

- **Freshness-ranked candidates** (the default `assertion` type; carrying `lastVerifiedAgeDays`, no `capturedAt`) rank by freshness: a recently verified note outranks a stale one of equal relevance. `lastVerifiedAgeDays` is the freshness signal.
- **Recurrence-recency candidates** (the default `event` type; those carrying `capturedAt`) rank by recurrence, then recency: a candidate with a higher `occurrences` count reflects a pattern seen repeatedly in the same `repo` and outranks a one-off of equal relevance; break ties by `capturedAt`, most recent first. Recurrence is a coarse count of query-matched records sharing the group, not a precise cluster — treat it as a strong-but-soft signal.

### 3. Present a ranked list

Present the ranked notes, each showing `path`, `title`, `snippet`, and `diataxis`. Apply these annotations:

- **Stale notes** — when `lastVerifiedAgeDays` exceeds 90, annotate the note as not recently verified.
- **Volatile notes** — when a note's `tags` include `volatile`, flag it prominently: its claims may have rotted and should be re-confirmed before use.
- **Deprecated notes** — when a note's `tags` include `deprecated`, or its `supersession.superseded` is `true`, route the reader to the successor: prefer `supersession.canonicalPath` and present the canonical note in place of the deprecated one. When `supersession.diagnostic` is set (a broken or cyclic `superseded-by` chain), surface that the chain could not be fully followed.

### 4. Report empty results plainly

When the helper returns a `diagnostic` and no candidates, report the empty result plainly; do not treat it as an error. `diagnostic` explains **why the result is empty**:

- `no knowledge base configured or discovered`: No `.kb/` folder was found and no registry is configured.
- `registry invalid: …`: The only configured `kb.yaml` registry failed to load, so no knowledge base could be searched; this is a setup problem to fix, not a missing-notes outcome.
- `no notes matched the query`: The knowledge bases were searched but nothing matched; suggest broadening the query or adding `--all-kbs`. An empty `warnings` array is the reliable signal that the in-scope KBs were actually searched and genuinely held nothing; when `warnings` is non-empty, a registry-health problem (a malformed registry or dead KB paths) may explain the empty or partial result even though the diagnostic reads `no notes matched the query`, so read `warnings` before concluding the query simply found nothing.
- `all matches were filtered out`: The knowledge bases were searched and found hits, but every hit was excluded by `--diataxis`, `--tag`, or `--folder`; suggest dropping or loosening a filter rather than broadening the query.

### 5. Relay registry-health warnings

`warnings` is separate from `diagnostic`: It reports **what is wrong with the registry**, and it is present even when candidates are returned. Always relay any warning to the user as a setup problem to fix — not as a failed query — so a degraded registry does not silently shrink the search:

- `registry invalid: …`: The `kb.yaml` registry could not be loaded; entries it would have contributed are missing from the search.
- `… path does not exist: …`: A registry entry names a knowledge base whose directory is absent on disk, so that KB was skipped; the entry or the directory needs fixing.

## Completion

A ranked list of relevant notes with freshness and supersession annotations, or a plain empty-result report.
