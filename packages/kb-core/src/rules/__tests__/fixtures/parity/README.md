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

The `frontmatter` and `tag-alias` rules in `@codeassembly/kb-core` are a port
of `scripts/check-notes/` in `github.com/williamthorsen/vaults.coding`. The
vault was not checked out locally; its `scripts/check-notes/` source was read
via `gh api` and the finding codes, severities, messages, and ordering were
reimplemented from that source. The vault's `wikilinks.*` and `paths.*` rules
are out of scope and intentionally excluded from this port.

`expected-findings.json` records the output of these _ported_ rules over the
vendored `notes/` fixtures. It was captured by running the port, not copied
from the vault's own `check-notes` output. Consequently the golden is a
**regression guard**: it pins the ported rules' behavior so any unintended
drift is caught. It is **not an independent correctness proof** — if a message
or severity was mis-ported, the golden faithfully records the mis-ported value.
Verifying that the port matches the vault's behavior is a code-review concern
against the `gh api`-fetched source, not something this golden asserts.

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

The regenerated golden records whatever the current rules produce. It does not
prove parity with the vault; if a behavior change was intentional, update the
rules first and let the new golden capture it. If the goal is to keep the port
faithful to the vault, re-check the rule logic against the upstream
`scripts/check-notes/` source (fetched via `gh api`) — the golden cannot
substitute for that review.
