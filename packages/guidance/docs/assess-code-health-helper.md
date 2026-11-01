# Code-health helper

`src/assess-code-health/` contains the helper that the `assess-code-health` skill runs, bundled to `content/skills/assess-code-health/assess-code-health.mjs`. It runs the sensors for one unit of a repository, checks each lens's proposals against the tree, and reports the proposals that a prior triage or an issue already covers. It does not write anything remote.

## Commands

Every command prints one JSON result to stdout. A result has `ok: true` and the command's fields, or `ok: false` with an `error` code and a `message`, in which case the command exits 1. A value-bearing flag accepts both `--flag value` and `--flag=value`; `--check`, `--exclude`, and `--prior` may be repeated, and every other flag may be given once. `--root` is the repository root, the working directory by default.

```bash
assess-code-health.mjs sense --unit <path> --out <file> [--window <days>] [--check <name>=<command>]... \
  [--exclude <glob>]... [--coverage-summary <file>] [--junit <file>] [--root <dir>]
assess-code-health.mjs check-evidence --proposals <file> --sense <file> [--root <dir>]
assess-code-health.mjs check-tracked --proposals <file> [--prior <file>]... [--root <dir>]
```

- **`sense`** writes the [sense document](#the-sense-document) to `--out` and reports each sensor's `name`, `status`, and `detail`. `--window` is the history window in days, 180 by default. `--check` runs a command through the shell in the root, split from its name at the first `=`; the name is kebab case and may not repeat or take a built-in sensor's name. `--exclude` adds a glob to the paths that the history sensors leave out. A failure to read `HEAD` or the file list is `git-failed`.
- **`check-evidence`** validates the proposals file against the [proposal schema](#proposals) and checks each proposal against the tree and the sense document. It reports `passed`, the IDs whose evidence resolves, and `failed`, each with its `id` and the first `reason` found. A file that fails the schema as a whole is `invalid-proposals`; a sense document that fails its schema is `invalid-sense`.
- **`check-tracked`** reports `tracker` (`checked`, and the `reason` when it is false), `tracked` (each with `id`, `key`, `source`, and `reason`), and `untracked` (IDs). A proposal is tracked when its key equals an item's key in a triage evidence block, from a `--prior` file or from a dispositions comment on the repository's GitHub issues, unless `git diff` reports a change to one of the item's paths since the block's commit. It is also tracked when an open issue, or an issue closed as not planned, contains the key verbatim in its body; `source` is then `#N`. When `gh` cannot read the repository, `tracker.checked` is false and the `--prior` files still apply.

## The sense document

```ts
interface SenseDocument {
  unit: string;
  windowDays: number;
  windowStart: string | null; // the oldest commit date in the window
  commit: string; // HEAD
  sensors: Array<{
    name: string;
    version: string | null;
    status: 'ok' | 'failed' | 'not-applicable';
    detail: string | null; // why a sensor failed or does not apply
    outputPath: string | null; // a check's log, or the report that a sensor read
    data: unknown;
  }>;
}
```

| Sensor      | Source                                         | `data` rows                                |
| ----------- | ---------------------------------------------- | ------------------------------------------ |
| `hotspots`  | `git log --numstat` over the window            | `{ path, commits, lines, score, rank }`    |
| `co-change` | the same log                                   | `{ a, b, commits }`                        |
| `coverage`  | an istanbul `json-summary` file                | `{ path, lines, branches, functions }` (%) |
| `timings`   | a JUnit XML file                               | `{ file, name, durationMs }`, slowest 100  |
| each check  | the command's exit code, logged beside `--out` | `{ exitCode }`                             |

The history sensors leave out lockfiles, `package.json` manifests, paths that `.gitattributes` marks `linguist-generated`, the `--exclude` globs, and commits that touch more than 50 files. A hotspot's score is its commits in the window times its current line count; a file deleted at `HEAD` is dropped. A co-change pair needs three shared commits. A check that exits non-zero is `ok`, since its output is evidence; one that the shell cannot find or run is `failed`. An absent report flag makes its sensor `not-applicable`, and an unreadable report makes it `failed`.

## Proposals

A proposals file is a JSON array. Each proposal has `id` (a capital prefix and a number), `title`, `key` (`{path}:{rule-or-smell}`), `paths`, `evidence`, `change`, `strength` (`sensor`, `rule`, or `reading`), `size` (`small`, `medium`, or `large`), and `reach` (a count). The object is strict, so a proposal with a grade field such as `confidence` or `value` fails the schema.

Each evidence entry is one of three kinds, and `check-evidence` resolves it as stated:

- **`span`** (`path`, `startLine`, `endLine`, `quote`): The file exists, the range lies within it, and the quote appears in the range.
- **`rule`** (`rulebook`, `section`, `quote`): The rulebook exists, contains a heading whose text without `#` equals `section` (case-sensitively), and the quote appears in that section, which runs to the next heading of the same or a higher level. A `#` line inside a fenced code block is not a heading.
- **`sensor`** (`sensor`, `detail`): The sense document has the sensor with status `ok`.

Quotes match after every run of whitespace is collapsed. Every entry of `paths` must also exist.
