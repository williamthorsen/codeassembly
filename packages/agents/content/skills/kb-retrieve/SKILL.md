---
name: kb-retrieve
description: Query the knowledge base for assertions relevant to a task and return a ranked list with freshness and supersession signals
user-invocable: true
---

# Retrieve knowledge-base assertions

Surface the knowledge-base assertions most relevant to a query. A bundled helper does the mechanical recall: It resolves which knowledge bases to search, runs ripgrep over note files, expands query terms through the tag aliases, and emits a structured candidate table. You then rank those candidates by genuine relevance and present a ranked list.

The split is deliberate: The helper is wide and mechanical; the ranking is narrow and judgment-driven. Treat the helper's output as evidence, not as a finished answer.

This skill returns assertions, the canonical knowledge-base notes. For event recall (the raw observations captured to refine assertions), use `kb-retrieve-events` instead.

**Announce at start:** "Using kb-retrieve to search for {query}."

## Arguments

| Argument     | Description                                                                            | Required |
| ------------ | -------------------------------------------------------------------------------------- | -------- |
| `<query>`    | The free-text search query. All non-flag tokens are joined into the query string.      | Yes      |
| `--all-kbs`  | Widen the search to every registered knowledge base, not just the default scope.       | No       |
| `--store`    | Scope the search to a single registered knowledge base by name (alias: `--kb`).        | No       |
| `--diataxis` | Keep only notes whose `diataxis` facet matches (e.g. `howto`, `concept`, `reference`). | No       |
| `--tag`      | Keep only notes with this tag (canonical or alias form), matched case-insensitively.   | No       |
| `--folder`   | Keep only notes whose path contains this folder segment.                               | No       |

A value-bearing flag accepts both `--diataxis howto` and `--diataxis=howto`.

### Scope

By default the helper searches up to two knowledge bases: the one discovered by walking up from the current directory for a `.kb/` folder, plus the registry's `default_kb` (the machine's default knowledge base). When neither source resolves, or the two resolve to the same path, the default scope contains fewer than two. `--all-kbs` widens the search to every knowledge base declared in the merged `kb.yaml` registry.

`--store <name>` (alias `--kb <name>`) narrows the search to a single registered knowledge base, resolved by registry name alone: No `.kb/` discovery walk runs, so a project-local `.kb/` the helper happened to be invoked near is never in scope. A name that matches no registry entry yields an empty result with an explanatory diagnostic.

Within each knowledge base, recall is limited to the notes the store declares, the files matching its configured `targets`/`exclude` (the same note set `kb check` enforces; `content/**/*.md` by default). Markdown outside that set, such as a root `README.md` or an excluded draft, is not recalled even when it contains the query terms.

## Runtime dependencies

- **`node` ≥ 24**: The bundled helper inherits the Node version floor of `@williamthorsen/kb`.
- **`ripgrep` (`rg`)**: the recall backend; the helper exits with a remediation hint when it is missing.

## Process

### 1. Run the recall helper

Invoke the co-located bundled helper with `node`, passing the query and any flags through verbatim:

```bash
node "$(dirname "$SKILL_PATH")/kb-retrieve.mjs" <query> [--all-kbs] [--store <name>] [--diataxis <label>] [--tag <tag>] [--folder <folder>]
```

Or, when the skill directory is known:

```bash
node {harness_home_dir}/skills/kb-retrieve/kb-retrieve.mjs "pnpm workspace setup" --diataxis howto
```

The helper prints a JSON object to stdout:

- `candidates`: an array of assertion candidates, each with `path`, `title`, `diataxis`, `tags`, `snippet`, `lastVerifiedAgeDays`, `supersession`, and `kbName`. A candidate also has `addressedBy` -- the references from its `addressed-by` list (what was done about the problem it notes) -- when the note declares one. A note that matches but declares no recordType is returned as a degraded candidate with a `diagnostic`, so a note broken in that way is not hidden from recall.
- `scopedKbs`: the knowledge bases that were actually searched.
- `warnings`: an array (possibly empty) of registry-health problems, present even when candidates are returned.
- `diagnostic`: present only when scope is empty or no notes matched.

### 2. Rank the candidates

Parse the JSON and rank the `candidates` by genuine relevance to the query's intent. Tag, Diátaxis, and folder overlap with the query are **evidence**, not terms in a weighted sum: A note in the right folder with the wrong intent ranks below a note that directly answers the question. Read each `snippet` to judge whether the note actually addresses the query rather than merely mentioning its terms.

Once relevance is established, rank by freshness: A recently verified note outranks a stale one of equal relevance. `lastVerifiedAgeDays` is the freshness signal, the whole days since the note was last verified.

### 3. Present a ranked list

Present the ranked notes, each showing `path`, `title`, `snippet`, and `diataxis`. Apply these annotations:

- **Stale notes**: When `lastVerifiedAgeDays` exceeds 90, annotate the note as not recently verified.
- **Volatile notes**: When a note's `tags` include `volatile`, flag it prominently: Its claims may be out of date and should be re-confirmed before use.
- **Deprecated notes**: When a note's `tags` include `deprecated`, or its `supersession.superseded` is `true`, route the reader to the successor: Prefer `supersession.canonicalPath` and present the canonical note in place of the deprecated one. When `supersession.diagnostic` is set (a broken or cyclic `superseded-by` chain), surface that the chain could not be fully followed.
- **Addressed problems**: When a candidate has `addressedBy`, surface its references so a recurring-but-addressed problem reads as _addressed_ rather than _unaddressed_. The references are heterogeneous (a KB note, a commit, a PR/issue, or a URL), and the relation is neutral: It records what was done about the problem, not that the problem is verifiably resolved. Unlike supersession, it does not redirect the reader; the record remains a true observation worth keeping.

### 4. Report empty results plainly

When the helper returns a `diagnostic` and no candidates, report the empty result plainly; do not treat it as an error. `diagnostic` explains **why the result is empty**:

- `no knowledge base configured or discovered`: No `.kb/` folder was found and no registry is configured.
- `registry invalid: …`: The only configured `kb.yaml` registry failed to load, so no knowledge base could be searched; this is a setup problem to fix, not a missing-notes outcome.
- `no notes matched the query`: The knowledge bases were searched but nothing matched; suggest broadening the query or adding `--all-kbs`. An empty `warnings` array is the reliable signal that the in-scope KBs were actually searched and genuinely contained nothing; when `warnings` is non-empty, a registry-health problem (a malformed registry or dead KB paths) may explain the empty or partial result even though the diagnostic reads `no notes matched the query`, so read `warnings` before concluding the query simply found nothing.
- `all matches were filtered out`: The knowledge bases were searched and found hits, but every hit was excluded by `--diataxis`, `--tag`, or `--folder`; suggest dropping or loosening a filter rather than broadening the query.
- `matches were found but none are assertions; use kb-retrieve-events for event recall`: The query matched only non-assertion records, such as events; the reader likely wants `kb-retrieve-events`.

### 5. Relay registry-health warnings

`warnings` is separate from `diagnostic`: It reports **what is wrong with the registry**, and it is present even when candidates are returned. Always relay any warning to the user as a setup problem to fix, not as a failed query, so a degraded registry does not silently shrink the search:

- `registry invalid: …`: The `kb.yaml` registry could not be loaded; entries it would have contributed are missing from the search.
- `… path does not exist: …`: A registry entry names a knowledge base whose directory is absent on disk, so that KB was skipped; the entry or the directory needs fixing.

## Completion

A ranked list of relevant notes with freshness and supersession annotations, or a plain empty-result report.
