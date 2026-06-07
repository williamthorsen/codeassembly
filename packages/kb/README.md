# @codeassembly/kb

Foundation library for knowledge-base tooling.
Provides knowledge-base discovery, registry loading, schema resolution, frontmatter parsing and writing, tag canonicalization, and a composable validation-rule engine.
It underpins the `kb-retrieve` and `kb-add` skills, the planned `kb-curate` skill, and the planned `@codeassembly/kb-mcp` server.

## Exports

The package exposes seven subpath entries plus a root barrel:

| Entry           | Description                                                               |
| --------------- | ------------------------------------------------------------------------- |
| `.`             | The most-used types plus `defaultSchema` and the rule constants           |
| `./check`       | `check` — config-driven enumeration plus the generic rules, in one call   |
| `./config`      | `.kb/config.yaml` loading and the typed `KbLoaderError` the loaders throw |
| `./discovery`   | KB root discovery and `kb.yaml` registry loading and merging              |
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
kbs:
  coding:
    path: ~/vaults/coding
    description: Personal coding knowledge base
    default: true
    readonly: false
  team:
    path: ../shared/team-kb
    description: Shared team knowledge base
```

Configuration keys, per KB entry under `kbs.<name>`:

| Key           | Required | Meaning                                                                                                 |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `path`        | yes      | KB root directory; `~` expands to `$HOME`, relative paths resolve against the registry file's directory |
| `description` | no       | Human-readable description                                                                              |
| `default`     | no       | Marks the default KB; at most one per file                                                              |
| `readonly`    | no       | Marks the KB as read-only                                                                               |

### Merge semantics

`loadKbRegistry` merges the two registries by KB name:

- Project entries **replace** user entries with the same name.
- Project entries with a new name are **appended**.
- When both files declare a `default: true` entry, the **project** default wins and the user default flag is cleared.
- Two entries marked `default: true` **within a single file** is an error.
- Path existence is not checked at load time.

```ts
import { loadKbRegistry } from '@codeassembly/kb/discovery';

const config = await loadKbRegistry({ projectDir: process.cwd() });
// config.entries: KbRegistryEntry[] with absolute, resolved paths
```

## The default schema

A record's family is the stored `recordType` discriminant, valued against the schema's declared record-type vocabulary. `defaultSchema` is a deep-frozen `Schema` constant keyed by record type — an `assertion` record type (the canonical vault note, ranked by freshness) and an immutable `event` record type (the ULID-keyed record written by `capture-event`, ranked by recurrence-recency):

```ts
{
  recordTypes: {
    assertion: {
      required: ['title', 'created', 'updated', 'tags'],
      optional: ['last-verified', 'applies-to', 'sources', 'supersedes', 'superseded-by'],
      recall: 'freshness',
      immutable: false,
    },
    event: {
      required: ['id', 'captured-at', 'session', 'cwd', 'summary'],
      optional: ['repo', 'skill', 'model', 'tags', 'correction'],
      recall: 'recurrence-recency',
      immutable: true,
    },
  },
}
```

`loadSchema({ kbRoot })` returns `defaultSchema` verbatim when the KB has no `.kb/schema.yaml`. A `.kb/schema.yaml` declares a `recordTypes:` block keyed by record-type name; each record type declares its own `required`, `optional`, `recall`, and `immutable`. The declared vocabulary **replaces** the bundled default outright. `recordType` is implicitly required on every record — it is the discriminant, so it is never listed in a record type's `required:` array.

```yaml
# .kb/schema.yaml
recordTypes:
  event:
    immutable: true
    recall: recurrence-recency
    required: [id, captured-at, session, cwd, summary]
    optional: [repo, skill, model, tags, correction]
  assertion:
    recall: freshness
    required: [title, created, updated, tags]
    optional: [last-verified, applies-to, sources, supersedes, superseded-by]
```

Validation reads a record type's required set directly via `resolveRequiredForRecordType(schema, recordType)`. A malformed or structurally invalid `.kb/schema.yaml` throws at load time, naming the offending file.

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

The package ships a `kb` bin with a `check` subcommand that validates every note in a store and reports the findings.

```bash
kb check                 # check the nearest ancestor .kb/ store
kb check --kb coding     # check the named store from the kb.yaml registry
kb check --json          # emit a JSON report
```

`kb check` resolves the store from the nearest ancestor `.kb/` directory, or from a `--kb <name>` entry in the merged `kb.yaml` registry (project-local entries join the user-global registry). The default output groups findings by file; `--json` emits `{ store, summary, findings }`. The command is read-only and never writes to the store.

Exit codes:

| Code | Meaning                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| `0`  | No error-severity findings (warnings are allowed). A zero-match run also exits 0.                                         |
| `1`  | One or more error-severity findings.                                                                                      |
| `2`  | A usage error, an unresolvable store, a malformed `config.yaml`/`schema.yaml`/`tag-aliases.yaml`, or an unexpected crash. |

## Error and exception model

Validation rules **return** findings — they never throw. Loaders (`loadKbConfig`, `loadSchema`, `loadAliases`) **throw** a typed `KbLoaderError` on structural defects, malformed YAML, or illegal overrides, with the offending file path named in the message. `KbLoaderError` (exported from `@codeassembly/kb/config`) carries a `kind: 'KbLoaderError'` discriminant — and an `isKbLoaderError` type guard — so a caller can distinguish a recoverable config/schema/alias defect from any other throw. `loadKbRegistry` throws a plain `Error` on its own structural defects. I/O errors other than a missing optional file propagate.

## MCP wrappability

Every public function input is a plain object with primitive or `unknown`-typed fields, and no function takes a callback. A future `kb-mcp` server can bind Zod-validated request payloads directly onto these inputs without refactoring.
