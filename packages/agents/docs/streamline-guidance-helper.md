# Guidance streamlining helper

`src/streamline-guidance/` contains the helper that the `streamline-guidance` skill runs, bundled to `content/skills/streamline-guidance/streamline-guidance.mjs`. It resolves the files that a run may cut, reports the evidence against candidate cuts, and writes the record of declined cuts and reviews. It does not edit any guidance: The skill applies cuts through the agent's own editing tool.

Every command works on one repository, found from the working directory with `git rev-parse --show-toplevel`, and prints one JSON object on stdout. A recoverable failure exits 0 with `{ "ok": false, "error": "<code>", "message": "<text>" }`; an unexpected error exits 1 with a message on stderr.

```bash
streamline-guidance.mjs resolve <path>...
streamline-guidance.mjs check < cuts.json
streamline-guidance.mjs record < fold.json
```

| Error              | Cause                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `invalid-args`     | No command or an unknown one, `resolve` given no path or a flag, or `check` or `record` given an argument |
| `invalid-input`    | The JSON on standard input does not parse or does not match the command's input shape                     |
| `invalid-record`   | `.agents/streamline-guidance.yaml` does not parse or does not match the record's shape                    |
| `not-a-repository` | The working directory is outside a git working tree                                                       |

## `resolve`

Each path names a Markdown file or a directory, and a leading `~/` names the home directory. A directory expands to the Markdown files that git tracks or would track beneath it.

A deployed copy resolves to its source. A file is a deployed copy when it contains a `GENERATED FILE` headline or a `<!-- codeassembly-skill|subagent|rulebook:<slug> -->` ownership marker, or when it lies in a harness's `skills/` or `scripts/` tree. When it has a `Source:` line, its source is the path that the line names within the source directory that the line names; otherwise its source is the slug's source file under a content root, which is a directory containing `codeassembly-content.yaml`. An ambient or guidance-hook region does not make a file a copy.

A path that cannot be a target is reported under `rejected` with one of these reasons: `not-found`, `not-markdown`, `saved-artifact` (inside the artifact base directory set in preferences), `outside-repository`, `source-not-in-repository`, `ambiguous-source` (a slug with a source under more than one content root), or `unresolved-include` (an include directive in the file, or in a file that it includes, does not name any file, which is true of an example directive in documentation). The path is the one named, or the repository-relative path of a file found beneath a named directory.

A target's transitive files are its includes, recursively, and the Markdown files to which the target or one of its includes links. Links count in two forms: Markdown links, and `{harness_home_dir}/skills/` or `{harness_home_dir}/scripts/` references, which map into the content root, a support entry's `skills/_sources/<name>/` mapping to `skills/`. A link inside an included file resolves against the target's directory, because the include is rendered into the target's body. Links inside a linked file are not followed. A file that is also a target is not listed as transitive.

```json
{
  "ok": true,
  "root": "/path/to/repository",
  "targets": [
    { "file": "skills/demo/SKILL.md", "bytes": 9412, "deployedBytes": 11048, "dirty": false, "generatedRegions": [] }
  ],
  "transitive": [
    {
      "file": "_partials/shared.md",
      "bytes": 812,
      "deployedBytes": 2436,
      "dirty": false,
      "generatedRegions": [],
      "lastReview": { "reviewedAt": "2026-09-10", "deployedBytes": 2400 },
      "via": [{ "from": "skills/demo/SKILL.md", "kind": "include" }]
    }
  ],
  "declined": [{ "file": "skills/demo/SKILL.md", "phrase": "In general, ", "class": "conservative" }],
  "rejected": [{ "path": "notes.txt", "reason": "not-markdown" }]
}
```

`deployedBytes` is what the file deploys. For a document, which is a Markdown file that is not included by any other file and that lies outside `_partials/`, `collections/`, and the test directories, it is the size of the body once its includes are expanded. For a file that deploys only inside the documents that include it -- a partial, and shared guidance that a harness template includes -- it is the file's own size times the number of documents that it reaches, at any depth: the example's partial is 812 bytes reaching three documents. A file that nothing includes and that lies in a non-deploying tree reaches nothing, so it reports zero. The field is absent for a file that does not lie in any content root, and for one whose includes cannot be expanded. It excludes the transforms that a deployment applies per harness -- the provenance header, the ownership marker, path rewriting, and guidance-hook injection -- because a guidance hook's bound rulebooks are declared outside the content root and the rest add a constant of a few hundred bytes.

`dirty` is true when git reports uncommitted changes to the file, an untracked file included. `generatedRegions` lists 1-based, inclusive line ranges, each running from a `<!-- codeassembly-ambient:start -->` or `<!-- codeassembly-guidance-hook:<name>:start -->` marker through its end marker, or to the end of the file when an end marker does not follow. A file that the record holds a review for contains `lastReview`: the review's date and, when the review measured it, its `deployedBytes`. A target named as a deployed copy also contains `redirectedFrom`, the path as named. `declined` lists the recorded entries whose file is in the run and still contains the phrase.

## `check`

`check` reads the candidate cuts as `{ "cuts": [{ "file": "<path>", "phrase": "<text>" }] }` and reports each one with two lists:

- `history`: The commits that changed how often the phrase occurs in its file, from `git log --follow -S`, newest first and at most five, each with its `sha`, `date` (author date, ISO 8601), `subject`, and `body`. The log format is explicit and signature display is off, so a configured `format.pretty` cannot change the output.
- `assertedBy`: Every string literal of at least 12 characters that the phrase contains, found in a test script (a JavaScript or TypeScript file beneath `__tests__/`, or named `*.test.*` or `*.spec.*`), each with its `file` and `line`. Escape sequences are resolved before comparison, and a template literal contributes the text between its interpolations.

Phrases and literals are compared after NFC normalization, with whitespace collapsed.

## `record`

`record` is the only writer of `.agents/streamline-guidance.yaml`. It reads one run's fold: the run's date, the cuts that the user declined, and the files that the run read.

```json
{
  "date": "2026-09-10",
  "declined": [{ "file": "skills/demo/SKILL.md", "phrase": "In general, ", "class": "conservative" }],
  "reviewed": ["skills/demo/SKILL.md", "_partials/shared.md"]
}
```

Each declined cut is stored with `declined-at` set to the fold's date. An entry for the same file and the same phrase, compared as above, replaces the entry that it repeats.

Each reviewed file is stored with `reviewed-at` set to the fold's date and `deployed-bytes` set to what the file deploys when `record` runs, measured as `resolve` measures `deployedBytes`, so the record states the size at which the run left the file. A file whose deployed bytes cannot be measured is stored without `deployed-bytes`, and a named file that does not exist is skipped. A file reviewed again replaces its earlier review.

On every write, a declined cut whose file no longer exists or no longer contains its phrase is dropped, and so is the review of a file that no longer exists, so the record lists only what a later run can use. Because each section is sorted by file, and declined cuts then by phrase, rewriting unchanged content produces identical bytes. Both sections are always written, an empty one as `[]`.

```yaml
declined:
  - file: skills/demo/SKILL.md
    phrase: "In general, "
    class: conservative
    declined-at: 2026-09-10
reviewed:
  - file: _partials/shared.md
    reviewed-at: 2026-09-10
    deployed-bytes: 2400
  - file: skills/demo/SKILL.md
    reviewed-at: 2026-09-10
    deployed-bytes: 10872
```

The command prints `{ "ok": true, "path": ".agents/streamline-guidance.yaml", "declined": <count>, "reviewed": <count> }`, each count being the entries in that section of the written record.
