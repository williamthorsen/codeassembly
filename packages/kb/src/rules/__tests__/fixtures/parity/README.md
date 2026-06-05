# Rules parity fixtures

This directory holds a frozen golden used by `parity.test.ts` to prove the
`frontmatter` and `tag-alias` rules match their upstream `check-notes` source
and to guard them against silent behavior drift.

## Layout

- `notes/` — ~15 vendored note fixtures, each exercising one or more
  `frontmatter.*` finding codes (and several clean notes that must produce no
  findings).
- `tag-aliases.yaml` — a representative subset of the source vault's
  `.kb/tag-aliases.yaml`, covering only the canonicals the parity notes use.
- `expected-findings.json` — the checked-in golden: the full finding set the
  two rules produce over `notes/`, sorted by `path`, then `line`, then `rule`.

## Provenance

The `frontmatter` and `tag-alias` rules in `@codeassembly/kb` are a port
of `scripts/check-notes/` in `github.com/williamthorsen/vaults.coding`. The
vault's `wikilinks.*` and `paths.*` rules are out of scope and intentionally
excluded from this port.

`expected-findings.json` is captured from the vault's **real** `check-notes`
rules — not from the kb port. The capture runs the vault's own
`parseNote`, `frontmatterRule`, and `tagAliasRule` over the vendored `notes/`
fixtures, feeding them inputs equivalent to kb's (the `defaultSchema`
type/required/optional sets and the aliases parsed from `tag-aliases.yaml`), so
the only thing compared is rule logic. The golden was captured against vault
commit `128ce97`.

Because the golden is the upstream rules' output, `parity.test.ts` is a genuine
**parity proof**: kb's `runRules` over the same fixtures must reproduce it
exactly. A mis-port would surface as a test failure, not be silently baked in.
The golden also doubles as a regression guard against future drift in either
direction.

The fixtures are vendored copies — they do not track the vault. They drift
only when this package's rules are intentionally changed.

## Regenerating the golden

`expected-findings.json` is captured from the vault, not hand-edited. Refresh it
only after an intentional, upstream-mirrored rule change (or after adding a note
fixture):

1. Locate or clone `github.com/williamthorsen/vaults.coding`, and install its
   dependencies (`pnpm install`) if `node_modules` is absent.
2. In a throwaway directory (outside both repos), write a harness that imports
   the vault's `parseNote`/`parseNoteContent` (`scripts/check-notes/lib/`), its
   `frontmatterRule` and `tagAliasRule` (`scripts/check-notes/rules/`), and its
   `loadAliases` (`scripts/canonicalize-tag/`).
3. Build a `RuleContext` with a schema equivalent to kb's `defaultSchema`,
   the aliases parsed from this directory's `tag-aliases.yaml`, and an empty
   `vaultIndex` map (`frontmatterRule` and `tagAliasRule` do not read it).
4. Parse every note in `notes/`, run both rules, and collect the findings.
5. Filter to rule codes starting with `frontmatter.` (this keeps
   `frontmatter.tag-alias` and drops any `wikilinks.*`/`paths.*` findings).
6. Sort by `path`, then `line`, then `rule`.
7. Write the sorted array as pretty-printed JSON (2-space indent) to
   `expected-findings.json`.
8. Run the harness with the vault's toolchain (e.g. its `tsx`).

The harness is throwaway and is not committed — kb stays self-contained,
with no build-time dependency on a local vault checkout. After regenerating,
`parity.test.ts` must pass: kb's `runRules` output must equal the new
golden.
