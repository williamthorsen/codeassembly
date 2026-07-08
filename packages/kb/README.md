# @codeassembly/kb

Foundation library for knowledge-base tooling.
Provides knowledge-base discovery, registry loading, frontmatter parsing and writing, tag canonicalization, and type-blind vault-integrity checks.
It underpins the knowledge-base skills — among them `kb-retrieve` (assertion recall) and `kb-retrieve-events` (event recall), `kb-add`, `kb-curate`, `capture-event`, and `kb-update-events` — and the planned `@codeassembly/kb-mcp` server.

## Exports

The package exposes ten subpath entries plus a root barrel:

| Entry               | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `.`                 | The most-used types plus `buildVaultIndex`                                     |
| `./check`           | `check`: config-driven enumeration composed with vault integrity and the lints |
| `./config`          | `.kb/config.yaml` loading and the typed `KbLoaderError` the loaders throw      |
| `./create`          | `create`: scaffold a new store and register it in `kb.yaml`                    |
| `./discovery`       | KB root discovery and `kb.yaml` registry loading, merging, and writing         |
| `./filesystem`      | Filesystem-existence helpers with an explicit absence policy                   |
| `./frontmatter`     | Note parsing into typed frontmatter and writing it back to YAML                |
| `./note-io`         | Type-blind note read/write as an ordered frontmatter field map                 |
| `./records`         | The typed `assertion`/`event` record parsers and renderers                     |
| `./tags`            | `.kb/tag-aliases.yaml` loading and tag canonicalization                        |
| `./vault-integrity` | Type-blind `[[link]]` resolution and basename-uniqueness over a note set       |

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

- **user-global**: `~/.agents/kb.yaml`
- **project-local**: `<projectDir>/.agents/kb.yaml`

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

The top-level `default_kb` key names the machine's default knowledge base: the single KB that searches and discovery-based writes fall back on when no store is named or discovered. `capture-event` writes there only when explicitly selected with `--store @default`, never by omission. It must name an entry under `kbs`; a value that matches none fails the load. Set, change, or clear it from the command line with `kb set-default`.

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

## The addressed-by/addresses relation

`addressed-by`/`addresses` is an inverse-pair relation that threads a problem record to whatever was done about it: a fix, a mitigation, an improved guidance note. Both are optional, multi-valued list fields:

- `addressed-by` (on the problem record, available on `assertion` and `event`) is the canonical, recall-facing field: a list of references to whatever addressed the problem. It is the only viable store when the responder is external, so its entries are heterogeneous: a KB wikilink or relative path, a commit SHA, a PR/issue ref, or a URL. The field's shape is validated as a list by the record parser, while its entries are free-form, like `sources`. It is set on events with `kb-update-events` and on assertions with `kb-edit`.
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

## Vault integrity and lints

`checkVaultIntegrity(notes)` runs whole-vault, type-blind checks over a `{ path, body, bodyStartLine }[]` note set: an unresolved `[[link]]` is an error (`wikilinks.unresolved`), and a basename shared by two or more notes is one vault-wide warning (`wikilinks.basename`). `buildVaultIndex(notes)` builds the basename → paths index the layer and curate's wikilink rewriter share.

The type-blind per-note lints — `tagAliasFindings(note, aliases)` (`tag-alias`, warning) and `pathsFindings(note)` (`paths.user-home`, error) — catch what write-time record validation can't: alias-vocabulary drift and hardcoded `/Users/{name}/` paths in captured content.

```ts
import { checkVaultIntegrity } from '@codeassembly/kb/vault-integrity';

const findings = checkVaultIntegrity(notes);
```

## Checking a store

`check({ kbRoot })` runs a store's full check in one call: it loads `.kb/config.yaml` and `.kb/tag-aliases.yaml`, enumerates the notes the config selects, and composes whole-vault integrity with the `tag-alias` and `paths` lints. It performs no frontmatter validation — record types own that at write time. It returns **both** the enumerated notes and the findings, so a consumer can layer its own detectors over the same enumeration without walking the store twice.

```ts
import { check } from '@codeassembly/kb/check';

const { notes, findings } = await check({ kbRoot });
```

A structural defect in either loaded file throws a `KbLoaderError` (see below). Any other error from enumeration or the checks propagates unchanged.

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

| Path                          | Contents                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `.kb/config.yaml`             | A fully-commented check config; the bundled defaults apply as-is                                          |
| `.kb/tag-aliases.yaml`        | An empty `aliases: {}` map                                                                                |
| `content/`, `content/events/` | The note tree; `capture-event` writes events to `content/events/`, `kb-update-events` edits them in place |

The config seed is serialized from the in-package `defaultKbConfig`, so a new store cannot drift from the bundled default.

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

| Code | Meaning                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `0`  | No error-severity findings in the checked notes (warnings are allowed). A run that selects no notes also exits 0.           |
| `1`  | One or more error-severity findings in the checked notes.                                                                   |
| `2`  | A usage error, an unresolvable store or `--vs` ref, a path matching no note, or a malformed `config` or `tag-aliases` file. |

## Error and exception model

The checks **return** findings; they never throw. Loaders (`loadKbConfig`, `loadAliases`) **throw** a typed `KbLoaderError` on structural defects or malformed YAML, with the offending file path named in the message. `KbLoaderError` (exported from `@codeassembly/kb/config`) carries a `kind: 'KbLoaderError'` discriminant — and an `isKbLoaderError` type guard — so a caller can distinguish a recoverable config or alias defect from any other throw. `loadKbRegistry` throws a plain `Error` on its own structural defects. I/O errors other than a missing optional file propagate.

## MCP wrappability

Every public function input is a plain object with primitive or `unknown`-typed fields, and no function takes a callback. A future `kb-mcp` server can bind Zod-validated request payloads directly onto these inputs without refactoring.
