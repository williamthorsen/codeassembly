---
slug: williamthorsen-code-layout-preferences
description: 'Where code lives and what it is called: source layout, test and helper placement, file naming, and declaration order. Consult before creating a file or directory, before placing a test, helper, or fixture, and before ordering declarations in a module.'
delivery: [hook, skill]
version: '3'
---

# William Thorsen's code layout preferences

Where code lives and what it is called, at three scales: the directory tree, the file, and the declarations inside it.

## Source layout

Group source by role. A directory holding unrelated modules because they were added at the same time is not a grouping.

Never scaffold a flat `src/`; later readers would extend flatness as convention.

Worked examples, not a closed set:

- `integrations/`: code that interfaces with an external library
- `portable/`: generic code, potentially extractable into a package of its own
- Domain-grouped feature directories, such as `services/`, `pages/`, and `components/`, subdivided by feature as they grow

## Tests

A `__tests__/` directory sits beside the code it covers, one per directory that contains tested code. Never roll a package's tests up into a single `src/__tests__/`.

A missing `__tests__/` sibling then signals uncovered code.

## Test helpers

Test helper code never belongs inside `__tests__/`, where it would go uncovered.

Helpers belong in a `test-utils/` directory, at the first tier that fits:

1. Beside the `__tests__/` that uses them, when only those tests do.
2. At the nearest common ancestor of the tests that import them, when several directories do.
3. In a private package of its own, once consumers span packages.

`test-utils/` is always a directory, never a single `test-utils.ts`, so filenames name subjects rather than audience. One concern per file.

A helper reached through a `../../` path into a sibling module's `test-utils/` has outgrown its tier.

## Fixtures

Fixture **data** -- JSON, Markdown, sample sources, directory trees -- belongs in `__tests__/fixtures/`, so one exemption covers tests and fixture data alike.

Fixture **builders** are code, and follow the test-helper rule above.

A deliberately-invalid input that a tool cannot parse takes a delimited `.malformed` marker in its name, so lint and formatter configuration excludes it by an anchored glob. The marker means the parser cannot read the file, not that the content is wrong: An input that parses and violates a schema takes no marker and stays covered.

## File naming

A file takes the name of its main export. A file with no single main export takes a kebab-case name describing its contents.

- `LaneCard.tsx` exports `LaneCard`
- `status-adapter.ts` exports the adapter's several functions

Components take PascalCase because their exports are PascalCase, so no framework exception is needed.

Name a file for its subject, never for its audience. `test-utils.ts` names who reads it; `scaffolding.ts` names what it contains.

## Declaration order

Within a module:

1. **Exported tier first.** The production entry leads when the module has exactly one production-consumed export. Otherwise peers are alphabetized case-insensitively, with test-only exports sorting among the rest rather than forming a tier of their own.
2. **Helpers last**, inside a `// region | Helpers` block, alphabetized within it.

Determine this from the file alone, without cross-package import analysis.

In test files, module-level helpers go below the `describe` blocks, wrapped the same way. Module-level test data and constants may stay at the top.

## Section separators

Do not use multi-line boxed separators or rulered headings. They wrap awkwardly and add noise without adding information. Two forms replace them:

- **Inline heading**: The default for primary-content sections:

  ```ts
  // -- Canvas dimensions --
  ```

- **Region fold**: For supporting or collapsible blocks (helpers, types, styles, getters, type guards, sub-functions):

  ```ts
  // region | Helpers
  function findAgent(...) { ... }
  // endregion | Helpers
  ```

## Naming of identifiers

Identifier naming (no abbreviations, kind-bearing tails, unit-of-measure suffixes, verb-led function names, and when a boolean takes a prefix) is specified in [naming conventions](../../skills/_data/naming-conventions.md).

## What binds only through configuration

State the directory names and the marker above in the project's own coverage and lint configuration; unwired, they bind nothing.

Anchor those globs on a delimiter rather than on a bare substring, which over-matches by accident.
