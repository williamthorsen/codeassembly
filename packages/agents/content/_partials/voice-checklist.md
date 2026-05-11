Before saving, audit your draft against the two rules below. (See [`lede-voice.md`](../_data/lede-voice.md) for full doctrine and worked examples.)

**Rule 1 — Each sentence must be one of:**

- **Outcome** — what the reader will experience, see, or be able to do.
- **Stated invariant** — explicit assurance worth confirming ("Behavior is unchanged."; "No migration required.").
- **Migration info** — names of user-facing surface added, removed, or renamed; steps the reader must take.

Cut any sentence describing mechanism (internal data, code paths, refactor mechanics, output-format details, internal counts). Indirect outcomes (reliability, performance) are permitted only if specific.

**Rule 2 — Identifiers permitted only for top-level user-configurable surface:**

- Allowed: package names, CLI commands and flags, top-level config-file paths, public-API endpoints/methods.
- Banned: schema field names, default values for configurable names, internal file paths, function/type/class/module names, internal subsystem names, internal version markers, output-format details (JSON keys, marker glyphs, header strings).
- Exception: user-facing surface that has been added, removed, or renamed may be named for migration (both removed identifiers and new defaults).

**Audit before save:**

1. For each sentence, classify it: Outcome / Invariant / Migration. Rewrite anything that fits none.
2. For each identifier, confirm it's in the allowed list. Drop or rephrase anything that isn't.
