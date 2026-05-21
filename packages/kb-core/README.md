# @codeassembly/kb-core

Foundation library for knowledge-base tooling.
Provides knowledge-base discovery, registry loading, schema resolution, frontmatter parsing and writing, tag canonicalization, and a composable validation-rule engine.
It underpins the planned `@codeassembly/kb-mcp` server and the `kb-retrieve`, `kb-add`, and `kb-curate` skills.

## Exports

The package exposes five subpath entries plus a root barrel:

| Entry           | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `.`             | The most-used types plus `defaultSchema` and the rule constants    |
| `./discovery`   | KB root discovery and `kb.yaml` registry loading and merging       |
| `./schema`      | The bundled default schema and per-KB `.kb/schema.yaml` resolution |
| `./frontmatter` | Note parsing into typed frontmatter and writing it back to YAML    |
| `./tags`        | `.kb/tag-aliases.yaml` loading and tag canonicalization            |
| `./rules`       | The `frontmatterRule` / `tagAliasRule` validators and `runRules`   |

Every public function takes a single plain-object input so a future MCP wrapper can mechanically bind Zod-validated payloads.
The library throws on errors; success/failure shaping is left to consumers.

## Knowledge-base discovery

`findKbRoot({ startDir })` walks ancestor directories looking for a `.kb/` folder and returns the first match (or `null` at the filesystem root).

```ts
import { findKbRoot } from '@codeassembly/kb-core/discovery';

const root = await findKbRoot({ startDir: process.cwd() });
```

## The `kb.yaml` registry

A KB registry declares one or more knowledge bases. `loadKbConfig` reads two optional registry files and merges them:

- **user-global** — `~/.claude/kb.yaml`
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

`loadKbConfig` merges the two registries by KB name:

- Project entries **replace** user entries with the same name.
- Project entries with a new name are **appended**.
- When both files declare a `default: true` entry, the **project** default wins and the user default flag is cleared.
- Two entries marked `default: true` **within a single file** is an error.
- Path existence is not checked at load time.

```ts
import { loadKbConfig } from '@codeassembly/kb-core/discovery';

const config = await loadKbConfig({ projectDir: process.cwd() });
// config.entries: KbConfigEntry[] with absolute, resolved paths
```

## The default schema

`defaultSchema` is a deep-frozen `Schema` constant exposing the Diátaxis four
types and the canonical frontmatter field sets:

```ts
{
  types: ['howto', 'concept', 'reference', 'tutorial'],
  required: ['title', 'type', 'created', 'updated', 'tags'],
  optional: ['last-verified', 'applies-to', 'sources', 'supersedes', 'superseded-by'],
}
```

`loadSchema({ kbRoot })` returns `defaultSchema` verbatim when the KB has no `.kb/schema.yaml`. When a per-KB schema file is present it is merged under **narrow-only** rules:

- **Types** may only be **narrowed** — a per-KB `types` list must be a subset of the default vocabulary.
- **Required** fields may only be **extended** — a per-KB `required` list must be a superset of the default required fields; a default-required field cannot be demoted.
- **Optional** fields are **unioned** with the defaults; a field may not appear in both `required` and `optional`.

Illegal overrides throw at load time, naming the offending field.

## Frontmatter parsing and writing

`parseNote({ path })` (or `parseNoteContent({ content })`) parses a note into a `ParsedNote` carrying typed `Frontmatter`:
The five required fields are strongly typed and any other fields are preserved in an `extra` map.
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
import { frontmatterRule, runRules, tagAliasRule } from '@codeassembly/kb-core/rules';

const findings = runRules({ rules: [frontmatterRule, tagAliasRule], notes, schema, aliases });
```

## Error and exception model

Validation rules **return** findings — they never throw. Loaders (`loadKbConfig`, `loadSchema`, `loadAliases`) **throw** on structural defects, malformed YAML, or illegal overrides, with the offending file path and key named in the message.
I/O errors other than a missing optional file propagate.

## MCP wrappability

Every public function input is a plain object with primitive or `unknown`-typed fields, and no function takes a callback. A future `kb-mcp` server can bind Zod-validated request payloads directly onto these inputs without refactoring.
