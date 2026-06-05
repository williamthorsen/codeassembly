# Cross-note rules parity fixtures

This directory holds a frozen golden used by `parity-cross-note.test.ts` to prove the `wikilinks` and `paths`
rules match their upstream `check-notes` source and to guard them against silent behavior drift. It is kept
entirely separate from the `frontmatter`/`tag-alias` golden in `../parity/`, so the two proofs never interfere.

## Layout

- `notes/` — a small multi-note mini-vault with cross-note wikilink targets:
  - `Target alpha.md` — a clean link target.
  - `sub-a/Shared.md`, `sub-b/Shared.md` — two notes sharing a basename, to exercise `wikilinks.ambiguous`.
  - `Links.md` — resolved, aliased, anchored, unresolved, ambiguous, inline-code-masked, and fenced-code-masked
    links.
  - `Paths.md` — a portable `~/` path (clean) and a hardcoded `/Users/{name}/` path (`paths.user-home`).
- `expected-findings.json` — the checked-in golden: the full `wikilinks.*` and `paths.*` finding set the two
  rules produce over `notes/`, sorted by `path`, then `line`, then `rule`.

## Provenance

The `wikilinks` and `paths` rules in `@codeassembly/kb` are a port of `scripts/check-notes/` in
`github.com/williamthorsen/vaults.coding`, adapted from the upstream two-argument `check(note, ctx)` signature to
kb's single-input `check(input)` contract.

`expected-findings.json` is captured from the vault's **real** `check-notes` `wikilinks` and `paths` rules — not
from the kb port. The capture builds a vault index by basename over the recursively-enumerated `notes/` paths
(vault-relative, dot-dirs and `node_modules` skipped), parses each note with the vault's own `parseNoteContent`,
runs both rules, and sorts the findings. Because the golden is the upstream rules' output, the parity test is a
genuine parity proof: kb's `runRules` over the same fixtures must reproduce it exactly.

The fixtures are vendored — they do not track the vault. They drift only when this package's rules are
intentionally changed.

## Regenerating the golden

`expected-findings.json` is captured from the vault, not hand-edited. Refresh it only after an intentional,
upstream-mirrored rule change (or after adding a note fixture):

1. Locate or clone `github.com/williamthorsen/vaults.coding` and install its dependencies (`pnpm install`).
2. In a throwaway directory, write a harness that imports the vault's `parseNoteContent`
   (`scripts/check-notes/lib/`) and its `wikilinksRule` and `pathsRule` (`scripts/check-notes/rules/`).
3. Recursively enumerate `notes/` for `.md` files as vault-relative paths (skip dot-dirs and `node_modules`),
   build a basename → set-of-paths index, and assemble a `RuleContext` with an empty schema and an empty alias
   map (`wikilinks`/`paths` read neither).
4. Parse every note, run both rules, collect the findings, and sort by `path`, then `line`, then `rule`.
5. Write the sorted array as pretty-printed JSON (2-space indent) to `expected-findings.json`.
6. Run the harness with the vault's toolchain (e.g. its `tsx`).

The harness is throwaway and is not committed — kb stays self-contained, with no build-time dependency on a
local vault checkout. After regenerating, `parity-cross-note.test.ts` must pass.
