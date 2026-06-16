# @codeassembly/kb

Foundation library for knowledge-base tooling.
Provides knowledge-base discovery, registry loading, schema resolution, frontmatter parsing and writing, tag canonicalization, and a composable validation-rule engine.
It underpins the `kb-retrieve` and `kb-add` skills, the planned `kb-curate` skill, and the planned `@codeassembly/kb-mcp` server.

## Exports

The package exposes nine subpath entries plus a root barrel:

| Entry           | Description                                                               |
| --------------- | ------------------------------------------------------------------------- |
| `.`             | The most-used types plus `defaultSchema` and the rule constants           |
| `./check`       | `check` — config-driven enumeration plus the generic rules, in one call   |
| `./config`      | `.kb/config.yaml` loading and the typed `KbLoaderError` the loaders throw |
| `./create`      | `create` — scaffold a new store and register it in `kb.yaml`              |
| `./discovery`   | KB root discovery and `kb.yaml` registry loading, merging, and writing    |
| `./filesystem`  | Filesystem-existence helpers with an explicit absence policy              |
| `./schema`      | The bundled default schema and per-KB `.kb/schema.yaml` resolution        |
| `./frontmatter` | Note parsing into typed frontmatter and writing it back to YAML           |
| `./tags`        | `.kb/tag-aliases.yaml` loading and tag canonicalization                   |
| `./rules`       | The `frontmatterRule` / `tagAliasRule` validators and `runRules`          |

Every public function takes a single plain-object input so a future MCP wrapper can mechanically bind Zod-validated payloads.
The library throws on errors; success/failure shaping is left to consumers.

## Knowledge-base discovery

`findKbRoot({ startDir })` walks ancestor directories looking for a `.kb/` folder and returns the first match (or `null` at the filesystem root).

```ts
import { findKbRoot } from '@codeassembly/kb/discovery';

const root = await findKbRoot({ startDir: process.cwd() });
```

## The `kb.yaml` registry

A KB registry declares one or more knowledge bases. `loadKbRegistry` reads two optional registry files and merges them:

- **user-global** — `~/.agents/kb.yaml`
- **project-local** — `<projectDir>/.agents/kb.yaml`

```yaml
# .agents/kb.yaml
default_kb: coding
kbs:
  coding:
    path: ~/vaults/coding
    description: Personal coding knowledge base
    readonly: false
  team:
    path: ../shared/team-kb
    description: Shared team knowledge base
```

The top-level `default_kb` key names the machine's default knowledge base: the single KB that search and writes fall back on when no store is named or discovered. It must name an entry under `kbs`; a value that matches none fails the load. Set, change, or clear it from the command line with `kb set-default`.

Configuration keys, per KB entry under `kbs.<name>`:

| Key           | Required | Meaning                                                                                                 |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `path`        | yes      | KB root directory; `~` expands to `$HOME`, relative paths resolve against the registry file's directory |
| `description` | no       | Human-readable description                                                                              |
| `readonly`    | no       | Marks the KB as read-only                                                                               |

### Merge semantics

`loadKbRegistry` merges the two registries by KB name:

- Project entries **replace** user entries with the same name.
- Project entries with a new name are **appended**.
- When both files set `default_kb`, the **project** value wins; the resolved default is the named entry from the merged set.
- Path existence is not checked at load time.

```ts
import { loadKbRegistry } from '@codeassembly/kb/discovery';

const config = await loadKbRegistry({ projectDir: process.cwd() });
// config.entries: KbRegistryEntry[] with absolute, resolved paths
```

## The default schema

A record's family is the stored `recordType` discriminant, valued against the schema's declared record-type vocabulary. `defaultSchema` is a deep-frozen `Schema` constant keyed by record type — an `assertion` record type (the canonical vault note, ranked by freshness) and an `event` record type (the ULID-keyed record written by `capture-event`, ranked by recurrence-recency):

```ts
{
  recordTypes: {
    assertion: {
      required: ['created', 'tags', 'title', 'updated'],
      optional: ['addressed-by', 'addresses', 'applies-to', 'diataxis', 'last-verified', 'sources', 'superseded-by', 'supersedes'],
      recall: 'freshness',
    },
    event: {
      required: ['captured-at', 'cwd', 'id', 'session', 'summary'],
      optional: ['addressed-by', 'correction', 'model', 'repo', 'skill', 'tags'],
      recall: 'recurrence-recency',
    },
  },
}
```

`loadSchema({ kbRoot })` returns `defaultSchema` verbatim when the KB has no `.kb/schema.yaml`. A `.kb/schema.yaml` declares a `recordTypes:` block keyed by record-type name; each record type declares its own `required`, `optional`, and `recall`. The declared vocabulary **replaces** the bundled default outright. `recordType` is implicitly required on every record — it is the discriminant, so it is never listed in a record type's `required:` array.

```yaml
# .kb/schema.yaml
recordTypes:
  assertion:
    required: [created, tags, title, updated]
    optional: [addressed-by, addresses, applies-to, diataxis, last-verified, sources, superseded-by, supersedes]
    recall: freshness
  event:
    required: [captured-at, cwd, id, session, summary]
    optional: [addressed-by, correction, model, repo, skill, tags]
    recall: recurrence-recency
```

Validation reads a record type's required set directly via `resolveRequiredForRecordType(schema, recordType)`. A malformed or structurally invalid `.kb/schema.yaml` throws at load time, naming the offending file.

### The addressed-by/addresses relation

`addressed-by`/`addresses` is an inverse-pair relation that threads a problem record to whatever was done about it — a fix, a mitigation, an improved guidance note. Both are optional, multi-valued list fields:

- `addressed-by` (on the problem record, available on `assertion` and `event`) is the canonical, recall-facing field: a list of references to whatever addressed the problem. It is the only viable store when the responder is external, so its entries are heterogeneous: a KB wikilink or relative path, a commit SHA, a PR/issue ref, or a URL. The field's shape is validated as a list (the `frontmatter.list` rule), while its entries are free-form, like `sources`.
- `addresses` (on a KB-note responder, available on `assertion`) is the optional inverse for the rare "what does this address?" query. It is **non-authoritative**: keeping it in sync would be an N-file write, so `kb-curate` deliberately does not police it.

The relation is many-to-many (one response can address many problems, and one problem can accrue many responses) and is surfaced flat by recall, with no chain-walking. This is distinct from `supersedes`/`superseded-by`, which _deprecates_ a record through a policed 1:1 chain; an addressed problem is not deprecated. It remains a true observation whose recurrence is worth keeping.

## Frontmatter parsing and writing

`parseNote({ path })` (or `parseNoteContent({ content })`) parses a note into a `ParsedNote` carrying typed `Frontmatter`:
The `title`, `recordType`, `created`, `updated`, and `tags` fields are strongly typed and any other fields are preserved in an `extra` map.
`writeFrontmatter({ frontmatter, body })` renders it back to a note string with a fixed field order and flow-style tags; the round trip is idempotent.

Date fields surface as strings, never JS `Date` objects. YAML parse errors are recorded in `ParsedNote.frontmatterRaw.parseError` rather than thrown;
missing files (when a path is given) throw.

## Tags

`loadAliases({ kbRoot })` reads `.kb/tag-aliases.yaml` into an `AliasMap`, rejecting collisions and self-aliases at load time; an absent file yields an empty map.
`canonicalize(tag, aliases)` resolves a tag to its canonical form; `findAliasFor(tag, aliases)` returns the canonical form only when the input is a known alias.

## Validation rules

`frontmatterRule` and `tagAliasRule` are `KbRule` objects — `{ name, check }` — that produce `Finding[]`.
`runRules({ rules, notes, schema, aliases })` applies a rule set across notes and concatenates the findings.
The `KbRule` interface is the extension point for future rules.

```ts
import { frontmatterRule, runRules, tagAliasRule } from '@codeassembly/kb/rules';

const findings = runRules({ rules: [frontmatterRule, tagAliasRule], notes, schema, aliases });
```

## Checking a store

`check({ kbRoot })` runs a store's full check in one call: it loads `.kb/config.yaml`, `.kb/schema.yaml`, and `.kb/tag-aliases.yaml`, enumerates the notes the config selects, validates each record against the store's schema, and runs the cross-note link and path rules. It returns **both** the enumerated notes and the findings, so a consumer can layer its own detectors over the same enumeration without walking the store twice.

```ts
import { check } from '@codeassembly/kb/check';

const { notes, findings } = await check({ kbRoot });
```

A structural defect in any of the three loaded files throws a `KbLoaderError` (see below). Any other error from enumeration or rule execution propagates unchanged.

### Which notes are checked: `.kb/config.yaml`

`.kb/config.yaml` configures which notes a check enumerates. Both keys are optional; an absent file or an omitted key falls back to the default.

```yaml
# .kb/config.yaml
targets:
  - 'content/**/*.md'
exclude:
  - '**/node_modules/**'
```

| Key       | Default                  | Meaning                                                                      |
| --------- | ------------------------ | ---------------------------------------------------------------------------- |
| `targets` | `['content/**/*.md']`    | Glob patterns (store-root-relative) selecting which notes a check enumerates |
| `exclude` | `['**/node_modules/**']` | Glob patterns excluded from enumeration even when a target matches           |

Matching uses dotfile-insensitive globbing, so dot-directories (`.kb`, `.git`, `.agents`) are skipped without naming them. The default targets the `content/`-scoped layout; a store with a different layout overrides `targets` to match. `loadKbConfig({ kbRoot })` returns the effective config and is exported from `@codeassembly/kb/config`.

## The `kb` command

The package ships a `kb` bin with three subcommands: `create`, `set-default`, and `check`.

### kb create

`kb create` scaffolds a new knowledge base in the current directory and registers it in the user-global `~/.agents/kb.yaml`.

```bash
kb create                # scaffold the current directory, register under its name
kb create --name coding  # register under an explicit name
kb create --no-register  # scaffold without writing the registry
```

It creates these files and directories:

| Path                          | Contents                                                         |
| ----------------------------- | ---------------------------------------------------------------- |
| `.kb/schema.yaml`             | A copy of the bundled default schema, ready to customize         |
| `.kb/config.yaml`             | A fully-commented check config; the bundled defaults apply as-is |
| `.kb/tag-aliases.yaml`        | An empty `aliases: {}` map                                       |
| `content/`, `content/events/` | The note tree; `capture-event` writes to `content/events/`       |

The schema and config seeds are serialized from the in-package `defaultSchema` and `defaultKbConfig`, so a new store cannot drift from the bundled defaults. The generated `.kb/schema.yaml` **replaces** the default outright (the override is a replacement, not a merge): add record types or optional fields freely, but do not remove or rename the default `assertion`/`event` record types or their required fields, since the `kb-*` skills depend on them. Delete the file to re-inherit the bundled default.

The name defaults to the directory's base name; `--name` overrides it and `--no-register` scaffolds without writing the registry. The registry write preserves any existing comments in `kb.yaml`. `kb create` refuses to clobber: it exits 2 if the directory already contains a `.kb/` store, or if the chosen name is already registered.

`kb create` also keeps a default knowledge base set. When the registry's top-level `default_kb` pointer is unset and the new store is the only registered KB, it becomes the default. When other KBs are already registered with no default, `kb create` prompts you to choose one on an interactive terminal — or, when stdin is not interactive, points you to `kb set-default`. An existing `default_kb` is never overwritten.

### kb set-default

`kb set-default` sets, clears, or interactively chooses the user-global default knowledge base: the top-level `default_kb` pointer in `~/.agents/kb.yaml`.

```bash
kb set-default coding   # set default_kb to the registered KB "coding"
kb set-default --none   # clear default_kb
kb set-default          # list the registered KBs and choose interactively
```

With a name, it sets `default_kb` to that KB, exiting 2 if the name is not registered. With `--none`, it clears the pointer. With no arguments on an interactive terminal, it lists the registered KBs — marking the current default and offering a `(none)` option — and writes the choice; cancelling with an empty line leaves the registry unchanged. With no arguments on a non-interactive stdin, it exits 2 rather than hanging. Writes resolve against and target the user-global registry only, and preserve existing comments and formatting.

### kb check

`kb check` validates a store's notes and reports the findings. With no path arguments it checks every note; path arguments or `--vs` scope the run to a subset.

```bash
kb check                       # check every note in the nearest ancestor .kb/ store
kb check --kb coding           # check the named store from the kb.yaml registry
kb check --json                # emit a JSON report
kb check content/assertions    # check only the notes under a directory
kb check 'content/**/*.md'     # check only the notes a glob matches (quote it)
kb check --vs=main             # check only the notes changed since a ref
```

`kb check` resolves the store from the nearest ancestor `.kb/` directory, or from a `--kb <name>` entry in the merged `kb.yaml` registry (project-local entries join the user-global registry). The default output groups findings by file; `--json` emits `{ store, summary, findings }`. The command is read-only and never writes to the store.

**Targeting.** Path arguments and `--vs` each scope the run to a subset of notes; they are mutually exclusive, and both compose with `--kb` and `--json`. Cross-note rules always resolve against the whole vault, so a targeted run never false-flags a link to an unselected note; only the report and the exit code narrow to the selection.

- **`[paths...]`**: one or more glob patterns, files, or directories (store-root-relative). The command expands globs itself, so a quoted glob behaves the same as a shell-expanded one. A directory checks every note beneath it. A path that matches no note is a usage error, unless it names a real non-note (a README, a triage note, or an excluded file), which is skipped silently.
- **`--vs <ref>`**: the notes changed between the working tree and the merge-base of `<ref>` and HEAD. The diff follows renames (checking the destination), includes uncommitted edits to tracked notes, and excludes deletions, so a `git mv`-heavy migration batch reports the notes it actually touched.

Because the exit code reflects only the selected notes, a per-batch or pre-commit gate can pass while the rest of the vault still carries a migration backlog.

Exit codes:

| Code | Meaning                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | No error-severity findings in the checked notes (warnings are allowed). A run that selects no notes also exits 0.                 |
| `1`  | One or more error-severity findings in the checked notes.                                                                         |
| `2`  | A usage error, an unresolvable store or `--vs` ref, a path matching no note, or a malformed `config`/`schema`/`tag-aliases` file. |

## Error and exception model

Validation rules **return** findings — they never throw. Loaders (`loadKbConfig`, `loadSchema`, `loadAliases`) **throw** a typed `KbLoaderError` on structural defects, malformed YAML, or illegal overrides, with the offending file path named in the message. `KbLoaderError` (exported from `@codeassembly/kb/config`) carries a `kind: 'KbLoaderError'` discriminant — and an `isKbLoaderError` type guard — so a caller can distinguish a recoverable config/schema/alias defect from any other throw. `loadKbRegistry` throws a plain `Error` on its own structural defects. I/O errors other than a missing optional file propagate.

## MCP wrappability

Every public function input is a plain object with primitive or `unknown`-typed fields, and no function takes a callback. A future `kb-mcp` server can bind Zod-validated request payloads directly onto these inputs without refactoring.
