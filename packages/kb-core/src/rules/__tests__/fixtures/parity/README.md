# Rules parity fixtures

This directory holds a frozen golden used by `parity.test.ts` to guard the
`frontmatter` and `tag-alias` rules against silent behavior drift.

## Layout

- `notes/` — ~15 vendored note fixtures, each exercising one or more
  `frontmatter.*` finding codes (and several clean notes that must produce no
  findings).
- `tag-aliases.yaml` — a representative subset of the source vault's
  `.kb/tag-aliases.yaml`, covering only the canonicals the parity notes use.
- `expected-findings.json` — the checked-in golden: the full finding set the
  two rules produce over `notes/`, sorted by `path`, then `line`, then `rule`.

## Provenance

The note fixtures and the finding codes/severities mirror
`scripts/check-notes/` in `github.com/williamthorsen/vaults.coding`. Only the
`frontmatter.*` rules are ported into `@codeassembly/kb-core`; the vault's
`wikilinks.*` and `paths.*` rules are out of scope and intentionally excluded
from this golden.

The fixtures are vendored copies — they do not track the vault. They drift
only when this package's rules are intentionally changed.

## Regenerating the golden

`expected-findings.json` is captured, not hand-edited. Refresh it only after an
intentional rule change (or after adding a note fixture):

1. Run the rules over every note in `notes/`, applying `defaultSchema` and the
   aliases parsed from `tag-aliases.yaml`.
2. Concatenate the `frontmatterRule` and `tagAliasRule` findings per note.
3. Sort by `path`, then `line`, then `rule`.
4. Write the sorted array as pretty-printed JSON (2-space indent) to
   `expected-findings.json`.

After regenerating, manually diff the result against the vault's `check-notes`
output (with `wikilinks.*` and `paths.*` filtered out) to confirm the codes,
severities, and messages still match before committing.
