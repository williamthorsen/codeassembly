# Release-notes voice

This file defines the voice for changelog and release-notes entries — and for any artifact whose first paragraph is the entry point for a glancing reader. Used by:

- `summarize-change/SKILL.md` for the `## What` section
- `commit/SKILL.md` for the commit body

## The reader

The reader is glancing through a list of entries asking "what changed?" and deciding in 2–5 seconds whether to keep reading or move on. They have no project-internal context.

Audience routes by the work type's tier (per [work-types.json](./work-types.json)):

- **Public tier** (release-notes-eligible) — end-users glancing through release notes after `npm update`. They want to know whether this version affects them.
- **Other tiers** (internal/process work) — developers glancing through the changelog after a version bump. They want to know what shipped.

The tier shifts the register; it does not lower the bar. The glancing-reader frame holds either way.

## The principle

**Detail is routed, not omitted.** The PR is one click away and carries the full story (ticket, diff, `## Details`). Putting implementation detail in the entry isn't thoroughness — it's information in the wrong channel, and it makes the entry less likely to be read at all. Cutting a sentence from the entry doesn't lose the information; it puts the information where it belongs:

- Mechanism, internal naming, and refactor mechanics → `## Details` (the PR carries this).
- Diff-level breakdown (file lists, per-component changes) → the PR's diff itself.
- Anything the engaged reader could find by clicking through → the linked PR.

The entry is the lede; the PR is the article.

## Two rules

Apply both. They are tight enough that a verbose draft cannot satisfy them on a literal read.

### Rule 1 — Per-sentence outcome test

For each sentence, ask: **does this describe what the change means for the reader?** Three permissible categories:

- **Outcome** — something the reader will experience, see, or be able to do.
  Example: "Uploads no longer fail when the filename contains a colon."
- **Stated invariant worth confirming** — an explicit assurance the reader can rely on, when relevant.
  Examples: "Behavior is unchanged.", "Exit codes are unchanged.", "No migration required."
- **Migration info** — names of user-facing surface that has been added, removed, or renamed; steps the reader must take.
  Example: "The `--fix-low` flag is replaced by `--approval-threshold`."

If a sentence describes how the change was implemented (mechanism, internal data structures, code paths, refactor mechanics, output-format details, internal counts), cut it. Mechanism belongs in `## Details` and the PR.

**Indirect outcomes** (reliability, maintainability, performance) are permitted **only if specific**. "More reliable progress visibility during long runs" describes a real outcome a reader would notice; "improves reliability" or "modernizes the architecture" is generic puffery and is forbidden. The test: If the same sentence could be written about almost any change, it is too generic.

**For `fix:` entries specifically.** A second sentence is warranted only when the fix carries user-facing behavior change or migration info beyond "the bug is gone." When you write it, describe what the user can now do (or no longer needs to do) — not how the fix works internally. "The CLIs now read their version from `package.json`" is mechanism. "A fresh `pnpm install` or rebuild is no longer required" is migration info. The test: Could the same sentence be true after a different implementation of the fix? If yes, it is user-facing behavior; if no, it is mechanism.

### Rule 2 — Identifier ban

The only identifiers that may appear are **top-level user-configurable surface**:

- Package names
- CLI commands and flags
- Top-level config-file paths (the path the user creates, names, or edits)
- Public-API endpoints and methods

Banned:

- Schema field names (e.g., `description`, `body`, `audience`)
- Default values for configurable names (use the description, not the default)
- Internal file paths within the package (`run-index.json`, `.meta/changelog.json`, `dist/esm/`)
- Function, type, class, or module names
- Internal subsystem names (`run-core`, `review-cycle`)
- Internal versioning ("v1 supports…", "v3 event-sourced format")
- Output-format details (JSON keys, marker glyphs, header strings)

When in doubt, leave the name out and describe the behavior. The one exception: A _removed_ user-facing identifier may be named when it is needed for migration ("the `--fix-low` flag is replaced by …").

## Length

The entry is as long as needed to convey outcomes, invariants, and migration info — and not one word longer.

This is not a soft ceiling. It is the per-sentence test: Each sentence must pass Rule 1 and Rule 2. Four sentences is fine if each carries user-relevant content (a rename with multiple migration facts); one sentence is fine if one covers it.

## Examples

### Cross-type one-liners

The voice is the same across every work type; only the subject changes:

- `fix:` "Fixes an issue where uploading a file with a colon in its name caused the importer to crash."
- `feat:` "Adds support for exporting reports as CSV."
- `internal:` "Resumes background jobs from their last checkpoint after a crash, so transient failures no longer drop work."
- `refactor:` "Consolidates API handlers on a shared HTTP client, reducing per-request connection overhead."
- `deps:` "Upgrades to Node 22 and drops support for Node 18, which reached end of life."

### Good — public tier, multi-fact rename

> The package previously published as `@williamthorsen/audit-deps` has been renamed to `v11y-check`. The CLI command is now `v11y-check`, and the default config file is `.config/v11y-check.config.json`. Existing users should install `v11y-check` in place of `@williamthorsen/audit-deps`, rename their config file, and update any scripts that invoke `audit-deps`. Behavior is unchanged.

Why it works: Every sentence is migration info or invariant. All identifiers named are user-facing surface. The reader knows exactly what to do.

### Good — public tier, low-action feature

> Allows `release-kit` consumers to skip or correct historical changelog entries by means of an overrides file.

Why it works: The user knows the feature exists, who it's for, and roughly what it does. The schema, default filename, and field names belong in the docs they will consult when using it.

### Good — internal tier

> Code changes flowing through the orchestrated pipeline now require accompanying tests, and reviewers flag missing tests as blockers.

Why it works: Outcome (new requirement) plus consequence (review behavior). No internal skill names, no per-file enumeration.

### Bad → Good — mechanism cut

**Bad** (schema-naming and mechanism, ~120 words):

> Adds an opt-in override file (default `.changelog-overrides.json`, configurable via `overridesPath`) that lets release-kit consumers correct historical changelog entries without rewriting git history. Override keys are commit hashes (full or any unambiguous prefix); per-entry fields can replace `description` and `body`, toggle the `breaking` marker, or set `audience: 'skip'` to drop the entry entirely. Both `.meta/changelog.json` and the rendered `CHANGELOG.md` reflect the post-override view.

**Good:**

> Allows `release-kit` consumers to skip or correct historical changelog entries by means of an overrides file.

Cut: every schema field name, every default value, every internal file path, every "how it works" sentence. Survives: the feature exists, who it's for, what it does.

### Bad → Good — over-elaborated fix

**Bad:**

> Fixes an issue where running `audit-deps`, `nmr`, or `release-kit` from the locally built `dist/esm/` after a `git pull` could report a stale version. Each CLI now reads its version directly from its `package.json` at startup, so version reads stay in sync with the installed source without requiring a fresh `pnpm install` or rebuild.

**Good:**

> Fixes an issue where running `audit-deps`, `nmr`, or `release-kit` from the locally built `dist/esm/` after a `git pull` could report a stale version.

Cut: The second sentence describes how the fix works. The reader does not need to know.

### Bad → Good — TMI feature

**Bad** (output-format details):

> Surfaces below-threshold vulnerabilities in the check command's output instead of silently hiding them. When the severity threshold is above `low`, vulnerabilities that fall below it now appear with an `ℹ️` marker and "ignored" annotation in bare output, full advisory detail in verbose output, and a distinct `belowThreshold` array in JSON output. Scope headers display the active threshold (e.g., `📦 prod (threshold: 🟠 moderate):`) so users can see what filtering is in effect. The "No known vulnerabilities found" message now only appears when there are truly zero vulnerabilities across all categories. Exit code behavior is unchanged — only above-threshold, non-allowlisted vulnerabilities cause failure.

**Good:**

> Below-threshold vulnerabilities are now surfaced in `check` output instead of silently hidden, so users can see what their configured threshold is filtering out. Exit code behavior is unchanged.

Cut: marker glyph, "ignored" annotation, JSON field name, scope-header format string, branch in the "no vulnerabilities" message. Survives: outcome (visibility) plus invariant (exit codes unchanged).
