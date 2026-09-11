# Guidance streamlining helper

`src/streamline-guidance/` contains the helper that the `streamline-guidance` skill runs, bundled to `content/skills/streamline-guidance/streamline-guidance.mjs`. It resolves the files that a run may cut, reports the evidence against candidate cuts, and writes the record of declined cuts. It edits no guidance: The skill applies cuts through the agent's own editing tool.

Every command works on one repository, found from the working directory with `git rev-parse --show-toplevel`, and prints one JSON object on stdout. A recoverable failure exits 0 with `{ "ok": false, "error": "<code>", "message": "<text>" }`; an unexpected error exits 1 with a message on stderr.

```bash
streamline-guidance.mjs resolve <path>...
streamline-guidance.mjs check < cuts.json
streamline-guidance.mjs record < fold.json
```

| Error              | Cause                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `invalid-args`     | No command or an unknown one, `resolve` given no path or a flag, or `check` or `record` given an argument |
| `invalid-include`  | An include directive in a target, or in a file that it includes, does not resolve                         |
| `invalid-input`    | The JSON on standard input does not parse or does not match the command's input shape                     |
| `invalid-record`   | `.agents/streamline-guidance.yaml` does not parse or does not match the record's shape                    |
| `not-a-repository` | The working directory is outside a git working tree                                                       |

## `resolve`

Each path names a Markdown file or a directory, and a leading `~/` names the home directory. A directory expands to the Markdown files that git tracks or would track beneath it.

A deployed copy resolves to its source. A file is a deployed copy when it contains a `GENERATED FILE` headline or a `<!-- codeassembly-skill|subagent|rulebook:<slug> -->` ownership marker, or when it lies in a harness's `skills/` or `scripts/` tree. Where it has a `Source:` URL, its source is the path after `/blob/<ref>/`; otherwise its source is the slug's source file under a content root, which is a directory containing `codeassembly-content.yaml`. An ambient or guidance-hook region does not make a file a copy.

A path that cannot be a target is reported under `rejected` with one of these reasons: `not-found`, `not-markdown`, `sealed-artifact` (inside the artifact base directory set in preferences), `outside-repository`, `source-not-in-repository`, or `ambiguous-source` (a slug with a source under more than one content root).

A target's transitive files are its includes, recursively, and the Markdown files to which the target or one of its includes links. Links count in two forms: Markdown links, and `{harness_home_dir}/skills/` or `{harness_home_dir}/scripts/` references, which map into the content root. A link inside an included file resolves against the target's directory, because the include is rendered into the target's body. Links inside a linked file are not followed. A file that is also a target is not listed as transitive.

```json
{
  "ok": true,
  "root": "/path/to/repository",
  "targets": [
    { "file": "skills/demo/SKILL.md", "bytes": 9412, "dirty": false, "generatedRegions": [] }
  ],
  "transitive": [
    {
      "file": "_partials/shared.md",
      "bytes": 812,
      "dirty": false,
      "generatedRegions": [],
      "via": [{ "from": "skills/demo/SKILL.md", "kind": "include" }]
    }
  ],
  "declined": [{ "file": "skills/demo/SKILL.md", "phrase": "In general, ", "class": "conservative" }],
  "rejected": [{ "path": "notes.txt", "reason": "not-markdown" }]
}
```

`dirty` is true where git reports uncommitted changes to the file, an untracked file included. `generatedRegions` lists 1-based, inclusive line ranges, each running from a `<!-- codeassembly-ambient:start -->` or `<!-- codeassembly-guidance-hook:<name>:start -->` marker through its end marker, or to the end of the file where no end marker follows. A target named as a deployed copy also contains `redirectedFrom`, the path as named. `declined` lists the recorded entries whose file is in the run and still contains the phrase.

## `check`

`check` reads the candidate cuts as `{ "cuts": [{ "file": "<path>", "phrase": "<text>" }] }` and reports each one with two lists:

- `history`: The commits that changed how often the phrase occurs in its file, from `git log --follow -S`, newest first and at most five, each with its `sha`, `date` (author date, ISO 8601), `subject`, and `body`. The log format is explicit and signature display is off, so a configured `format.pretty` cannot change the output.
- `assertedBy`: Every string literal of at least 12 characters that the phrase contains, found in a test script (a JavaScript or TypeScript file beneath `__tests__/`, or named `*.test.*` or `*.spec.*`), each with its `file` and `line`. Escape sequences are resolved before comparison, and a template literal contributes the text between its interpolations.

Phrases and literals are compared after NFC normalization, with whitespace collapsed.

## `record`

`record` is the only writer of `.agents/streamline-guidance.yaml`. It reads one run's fold:

```json
{
  "declinedAt": "2026-09-10",
  "declined": [{ "file": "skills/demo/SKILL.md", "phrase": "In general, ", "class": "conservative" }]
}
```

Each entry is stored with `declined-at` set to the fold's date. An entry for the same file and the same phrase, compared as above, replaces the entry that it repeats. On every write, an entry whose file no longer exists or no longer contains its phrase is dropped, so the record lists only cuts that a later run could still propose. Entries are sorted by file and then phrase, so rewriting unchanged content produces identical bytes.

```yaml
declined:
  - file: skills/demo/SKILL.md
    phrase: "In general, "
    class: conservative
    declined-at: 2026-09-10
```

The command prints `{ "ok": true, "path": ".agents/streamline-guidance.yaml", "declined": <count> }`.
