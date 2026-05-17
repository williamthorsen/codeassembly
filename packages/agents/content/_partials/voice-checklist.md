Before saving, audit your draft against the two rules below.

These two rules are what this checklist tests. They do **not** cover register (change-narrating voice — `introduces`, `now`, `no longer`) or jargon discipline (define-while-naming). Those judgments aren't checklist-able and need the worked examples — read the `## Voice` and `## Jargon at the lede` sections of [`lede-voice.md`](../_data/lede-voice.md) before drafting.

**Rule 1: Each sentence must be one of the following:**

- **Outcome**: What the reader will experience, see, or be able to do.
- **Stated invariant**: Explicit assurance worth confirming ("Behavior is unchanged."; "No migration required.").
- **Migration info**: Names of user-facing surface added, removed, or renamed; steps the reader must take.

Cut any sentence describing mechanism (internal data, code paths, refactor mechanics, output-format details, internal counts). Indirect outcomes (reliability, performance) are permitted only if specific.

**Rule 2: Identifiers permitted only for top-level user-configurable surface:**

- Allowed: Package names, CLI commands and flags, top-level config-file paths, public-API endpoints/methods.
- Banned: Schema field names, default values for configurable names, internal file paths, function/type/class/module names, internal subsystem names, internal version markers, output-format details (JSON keys, marker glyphs, header strings).
- Exception: User-facing surface that has been added, removed, or renamed may be named for migration (both removed identifiers and new defaults).

**Audit before save:**

1. For each sentence, classify it: Outcome, Invariant, or Migration. Rewrite anything that fits none.
2. For each identifier, confirm it's in the allowed list. Drop or rephrase anything that isn't.
