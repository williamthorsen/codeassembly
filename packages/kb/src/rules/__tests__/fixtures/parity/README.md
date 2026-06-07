# Rules golden fixtures

This directory holds a checked-in golden used by `parity.test.ts` to pin the
`frontmatter` and `tag-alias` rules' output over a vendored note corpus and to
guard them against silent behavior drift.

## Layout

- `notes/` — ~15 vendored note fixtures, each exercising one or more
  `frontmatter.*` finding codes (and several clean notes that must produce no
  findings).
- `tag-aliases.yaml` — a representative subset of the source vault's
  `.kb/tag-aliases.yaml`, covering only the canonicals the parity notes use.
- `expected-findings.json` — the checked-in golden: the full finding set the
  two rules produce over `notes/`, sorted by `path`, then `line`, then `rule`.

## Provenance

The `frontmatter` and `tag-alias` rules in `@codeassembly/kb` began as a port
of `scripts/check-notes/` in `github.com/williamthorsen/vaults.coding`. The
golden was originally captured from the vault's real `check-notes` rules at
commit `128ce97` as a parity proof. The `recordType` redesign (#727)
intentionally replaced the legacy `type` vocabulary with a stored `recordType`
discriminant, so the golden now reflects the post-redesign kb rules rather than
the upstream `type` model. Upstream parity is re-established once
vaults.coding#16 lands the matching vault-side redesign and the golden is
recaptured from it. The vault's `wikilinks.*` and `paths.*` rules are out of
scope and intentionally excluded.

`expected-findings.json` is the full finding set the two rules produce over
`notes/`, sorted by `path`, then `line`, then `rule`. `parity.test.ts` requires
kb's `runRules` over the same fixtures to reproduce it exactly, so an
unintended rule change surfaces as a test failure rather than being silently
baked in.

The fixtures are vendored copies — they do not track the vault. They drift
only when this package's rules are intentionally changed.

## Regenerating the golden

Refresh `expected-findings.json` only after an intentional rule change (or after
adding a note fixture). Until vaults.coding#16 re-establishes upstream parity,
regenerate from kb's own rules:

1. In a throwaway script inside `packages/kb`, import `parseNoteContent`,
   `defaultSchema`, `parseAliases`, `frontmatterRule`, `tagAliasRule`, and
   `runRules` from `src/`.
2. Parse every note in `notes/`, run both rules over them with the aliases
   parsed from this directory's `tag-aliases.yaml`, and collect the findings.
3. Sort by `path`, then `line`, then `rule`.
4. Write the sorted array as pretty-printed JSON (2-space indent) to
   `expected-findings.json`.
5. Run the script with the package's `tsx`, then delete it.

After regenerating, `parity.test.ts` must pass: kb's `runRules` output must
equal the new golden.
