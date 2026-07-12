# Lede voice

This file defines the voice for changelog and release-notes entries — and any other artifact whose first paragraph is the entry point for a glancing reader. The metaphor is journalism: The entry is the lede; the PR is the article. Currently used by:

- `summarize-change/SKILL.md` for the `## What` section
- `commit/SKILL.md` for the commit title and body
- `merge-pr/SKILL.md` for the merge commit body

## The reader

The reader is glancing through a list of entries asking "what changed?" and deciding in 2–5 seconds whether to keep reading or move on. They have no project-internal context.

Audience routes by the work type's tier (per [work-types.json](./work-types.json)):

- **Public tier** (release-notes-eligible) — end-users glancing through release notes after `npm update`. They want to know whether this version affects them.
- **Other tiers** (internal/process work) — developers glancing through the changelog after a version bump. They want to know what shipped.

The tier shifts the register; it does not lower the bar. The glancing-reader frame holds either way.

## The principle

This is the [concision principle](./concision.md) applied to changelog and release-notes entries; the routing and rules below are its lede-specific form.

**Detail is routed, not omitted.** The PR is one click away and carries the full story (ticket, diff, `## Details`). Putting implementation detail in the entry isn't thoroughness — it's information in the wrong channel, and it makes the entry less likely to be read at all. Cutting a sentence from the entry doesn't lose the information; it puts the information where it belongs:

- Mechanism, internal naming, and refactor mechanics → `## Details` (the PR carries this).
- Diff-level breakdown (file lists, per-component changes) → the PR's diff itself.
- Anything the engaged reader could find by clicking through → the linked PR.

The entry is the lede; the PR is the article.

## Voice: Narrate the change, don't describe the state

The lede announces a delta, not a snapshot. The reader's question is "what changed?", not "how does the system work now?". Phrasing that answers the second question implicitly leaves the reader to do work the entry should have done.

Verb choice and temporal framing make the delta explicit:

- **Prefer change verbs** that name the modification: `introduces`, `adds`, `fixes`, `improves`, `refines`, `modifies`, `replaces`, `removes`.
- **Use "now"/"no longer" markers** when describing a behavioral change to an existing surface, not just a new addition.
- **Avoid neutral state verbs** that describe the post-change system as if it had always behaved that way: `canonicalizes`, `handles`, `provides`, `supports` — when used as flat descriptions rather than as part of a "now does X" or "supports a new Y" frame.

**Exception for agent-guidance diffs.** When the change edits agent instructions, guidance, or rules, narrate the change to the _instruction_ ("agents are now instructed to X"), not the agent's behavior ("the agent now does X"). Agent compliance is nondeterministic and not assertable from the diff; see the agent-guidance carve-out under Rule 1.

The two rules below still apply; the voice guidance is the register _within which_ the rules operate. A sentence can pass both rules and still read like documentation rather than an announcement.

**Bad → Good — change-narrating voice**

**Bad** (compliant but state-describing):

> A tag-alias map at `.kb/tag-aliases.yaml` canonicalizes secondary frontmatter tags. The migration script writes canonical forms only, and `pnpm run check:notes` warns when committed frontmatter contains a known alias, naming the suggested canonical form.

**Good:**

> Introduces a tag alias map that sets the canonical form of secondary frontmatter tags. The migration script now writes only these forms, and the `check:notes` script now warns when committed frontmatter uses a known alias instead of the canonical form.

Both drafts pass Rule 1 and Rule 2. The Bad version uses neutral verbs (`canonicalizes`, `writes`, `warns`) with no temporal markers; the reader is left to infer the delta. The Good version uses a change verb (`introduces`) and temporal markers (`now`, `instead of`) so the delta is on the surface where it belongs.

## Two rules

Apply both. They are tight enough that a verbose draft cannot satisfy them on a literal-checklist read.

### Rule 1: Per-sentence outcome test

For each sentence, ask: **Does this describe what the change means for the reader?** Two permissible categories:

- **Outcome**: Something the reader will experience, see, or be able to do.
  Example: "Uploads no longer fail when the filename contains a colon."
- **Migration info**: Names of user-facing surface that has been added, removed, or renamed; steps the reader must take.
  Example: "The `--fix-low` flag is replaced by `--approval-threshold`."

If a sentence describes how the change was implemented (mechanism, internal data structures, code paths, refactor mechanics, output-format details, internal counts), cut it. Mechanism belongs in `## Details` and the PR.

**Indirect outcomes** (reliability, maintainability, performance) are permitted **only if specific**. "More reliable progress visibility during long runs" describes a real outcome a reader would notice; "improves reliability" or "modernizes the architecture" is generic puffery and is forbidden. The test: If the same sentence could be written about almost any change, it is too generic.

A few kinds of change specialize what counts as an outcome. The carve-outs below refine the test for those cases; a change that none of them covers follows the general test above.

**For `fix:` entries specifically.** Sentences after the opening symptom-frame must add user-relevant content beyond the implicit "bug fixed"; specifically, user-facing behavior change or migration info. Each such sentence describes what the user can now do (or no longer needs to do), not how the fix works internally. "The CLIs now read their version from `package.json`" is mechanism. "A fresh `pnpm install` or rebuild is no longer required" is migration info. The test: Could the same sentence be true after a different implementation of the change? If yes, it is user-facing behavior; if no, it is mechanism. This counterfactual applies to any sentence in any work type, not just `fix:`.

**For documentation changes specifically.** The outcome is not the change to the documentation; the outcome is what readers of the doc will now know, be able to do, or be guided away from. (When the doc's readers are agents, such as skills, subagent prompts, or AGENTS.md-style guidance, "what readers will now do" is itself an unverifiable compliance claim; see the agent-guidance carve-out below.)

**Bad** (mechanism: names the edit site and the refactor move):

> The stale one-line mention of table-driven tests in the `code-patterns` skill is replaced by a pointer to the new canonical source.

**Good:**

> Guidance on table-driven tests is now consolidated in one place, so readers no longer follow a stale stub to outdated advice.

The Bad version describes a refactor move ("X is replaced by a pointer") and names the internal edit site — both mechanism. The Good version names what readers now get (current guidance, no stale stub) and survives the counterfactual: A different restructuring that still routed readers to current guidance would yield the same sentence.

**For agent-guidance changes specifically.** When the diff's subject is agent instructions, guidance, or rules, the change targets the _instruction surface_, not the agent's resulting behavior. Frame the delta as what the guidance now instructs ("agents are now instructed to X," "the guidance now directs X"), never as accomplished behavior ("the agent now does X"). Agent compliance is downstream and nondeterministic, so a behavior claim over-states what the diff can guarantee. This redirects the change-narrating voice; it does not abandon it, since "are now instructed to" is itself a change verb. When the point is the _benefit_ the guidance reaches for, state it as intent ("with the aim of X"), not a guaranteed result ("now comes out X").

**Bad** (asserts nondeterministic behavior as fact):

> In interactive sessions, the agent now defaults to a concise reply.

**Good:**

> Agents in interactive sessions are now instructed to keep replies concise, while still surfacing any flaw or risk worth raising.

The Bad version claims a downstream behavior the diff cannot verify (guidance often fails to take); the Good version claims only the instruction, which is present in the diff.

### Rule 2: Identifier ban

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

When in doubt, leave the name out and describe the behavior. **Allowed is not the same as worth it** — even an identifier on the permitted list earns its place only if the reader needs to act on it. Name a top-level config-file path when the reader has to create, edit, or move it; don't name it just to acknowledge that one exists. The headline question is whether the word does work for the reader, not whether the rule lets you include it.

The one exception to the ban: User-configurable surface needed for migration may be named — both _removed_ identifiers (so the user recognizes what's gone) and _new_ defaults (so the user knows where to find or move them). Examples: "The `--fix-low` flag is replaced by `--approval-threshold`."; "The default config file is now `.config/v11y-check.config.json`."

## Jargon at the lede

Compression to a term of art saves words for a reader who already knows the term. For a reader who doesn't, it forces them to either skip the entry or do dictionary work the writer should have done. The lede is often the one place a reader meets the concept — spend the few extra words so the prose teaches as it announces.

**Define while naming.** Compress only when the audience definitely shares the term. Otherwise, prefer the explained form even if it's longer:

- `canonicalizes secondary tags` → `sets the canonical form of secondary tags`
- `idempotent rebuilds` → `rebuilds can be rerun safely`
- `serializes state to a side-channel` → `writes state to a separate file so the main flow stays clean`

This is the softer companion to Rule 2. Rule 2 bans internal _identifiers_ (function names, internal subsystem names); the jargon rule covers internal _vocabulary_ — terminology that demands prior knowledge is friction at the lede even when no name is involved.

## Title application

A title is a single-sentence lede. Both rules apply, distilled:

- **Outcome, not mechanism.** The title goes to changelogs and release notes — readers often see only the title. Ask "what does this change deliver?", not "what did I edit?". Bad: "Upgrade hono from v1 to v2." Good: "Upgrade hono to patch authentication vulnerability."
- **The code change, not what prompted it.** Ask "what does the diff do?", not "why did I open the editor?". Bad: "Address review findings"; "Apply feedback"; "Incorporate suggestions". Good: "Add error logging to `handleStateUpdate`"; "Remove dead rejection handler".
- **No ephemeral references.** If it would not make sense to a reader who has only `git log`, leave it out.
- **Only what's in the diff.** External actions (updating a ticket, posting a comment, sending a notification) are not part of the change and do not belong in its title.

## Body content discipline

Body text — that is, the text used in commit bodies, merge-commit bodies, and the `## What` section of a change summary — is subject to these proscriptions in addition to the two rules:

- **Never reference automated tests or CI.** Formatting, linting, typechecking, and unit tests run automatically. Mentioning them in the body is process noise, not user content.
- **Never use review finding IDs.** Identifiers like `F1`, `W2`, `T3` belong only in review documents — they are meaningless in `git log` and to any future reader.

## Length

The entry is as long as needed to convey outcomes and migration info — and not one word longer.

This is not a soft ceiling. It is the per-sentence test: Each sentence must pass Rule 1 and Rule 2. Four sentences is fine if each carries user-relevant content (a rename with multiple migration facts); one sentence is fine if one covers it.

## Examples

Each Bad/Good pair below pairs a draft that fails at least one rule with a draft that passes both; the annotation names which clause(s) the Bad version failed on and which survived in the Good version.

### Cross-type one-liners

The voice is the same across every work type; only the subject changes:

- `fix:` "Fixes an issue where uploading a file with a colon in its name caused the importer to crash."
- `feat:` "Adds support for exporting reports as CSV."
- `internal:` "Resumes background jobs from their last checkpoint after a crash, so transient failures no longer drop work."
- `refactor:` "Consolidates API handlers on a shared HTTP client, reducing per-request connection overhead."
- `deps:` "Upgrades to Node 22 and drops support for Node 18, which reached end of life."

### Good: Public tier, multi-fact rename

> The package previously published as `@williamthorsen/audit-deps` has been renamed to `v11y-check`. The CLI command is now `v11y-check`, and the default config file is `.config/v11y-check.config.json`. Existing users should install `v11y-check` in place of `@williamthorsen/audit-deps`, rename their config file, and update any scripts that invoke `audit-deps`.

Why it works: Every sentence is migration info. All identifiers named are user-facing surface. The reader knows exactly what to do.

### Good: Public tier, low-action feature

> Allows `release-kit` consumers to skip or correct historical changelog entries by means of an overrides file.

Why it works: The user knows the feature exists, who it's for, and roughly what it does. The schema, default filename, and field names belong in the docs they will consult when using it.

### Good: Internal tier

> Code changes flowing through the orchestrated pipeline now require accompanying tests, and reviewers flag missing tests as blockers.

Why it works: Outcome (new requirement) plus consequence (review behavior). No internal skill names, no per-file enumeration.

### Bad → Good: Mechanism cut

**Bad** (schema-naming and mechanism, ~120 words):

> Adds an opt-in override file (default `.changelog-overrides.json`, configurable via `overridesPath`) that lets release-kit consumers correct historical changelog entries without rewriting git history. Override keys are commit hashes (full or any unambiguous prefix); per-entry fields can replace `description` and `body`, toggle the `breaking` marker, or set `audience: 'skip'` to drop the entry entirely. Both `.meta/changelog.json` and the rendered `CHANGELOG.md` reflect the post-override view.

**Good:**

> Allows `release-kit` consumers to skip or correct historical changelog entries by means of an overrides file.

Cut: Every schema field name, every default value, every internal file path, every "how it works" sentence. Survives: The feature exists, who it's for, what it does.

### Bad → Good: Over-elaborated fix

**Bad:**

> Fixes an issue where running `audit-deps`, `nmr`, or `release-kit` from the locally built `dist/esm/` after a `git pull` could report a stale version. Each CLI now reads its version directly from its `package.json` at startup, so version reads stay in sync with the installed source without requiring a fresh `pnpm install` or rebuild.

**Good:**

> Fixes an issue where running `audit-deps`, `nmr`, or `release-kit` from the locally built `dist/esm/` after a `git pull` could report a stale version. A fresh `pnpm install` or rebuild is no longer required.

Cut: The mechanism clause ("Each CLI now reads its version directly from its `package.json` at startup"). Survives: The migration info — the user no longer needs to rebuild — which the fix-specific guidance under Rule 1 marks as the warranted second-sentence case.

### Bad → Good: TMI feature

**Bad** (output-format details):

> Surfaces below-threshold vulnerabilities in the check command's output instead of silently hiding them. When the severity threshold is above `low`, vulnerabilities that fall below it now appear with an `ℹ️` marker and "ignored" annotation in bare output, full advisory detail in verbose output, and a distinct `belowThreshold` array in JSON output. Scope headers display the active threshold (e.g., `📦 prod (threshold: 🟠 moderate):`) so users can see what filtering is in effect. The "No known vulnerabilities found" message now only appears when there are truly zero vulnerabilities across all categories. Exit code behavior is unchanged — only above-threshold, non-allowlisted vulnerabilities cause failure.

**Good:**

> Below-threshold vulnerabilities are now surfaced in `check` output instead of silently hidden, so users can see what their configured threshold is filtering out. The check fails only on above-threshold, non-allowlisted vulnerabilities.

Cut: Marker glyph, "ignored" annotation, JSON field name, scope-header format string, branch in the "no vulnerabilities" message; the closing "Exit code behavior is unchanged" is recast as a positive statement of the failure criterion. Survives: Outcome (visibility) plus the explicit failure criterion.

### Bad → Good: Format/glyph adoption

**Bad** (output-format details under Rule 2):

> Adds work-type emojis to PR descriptions: `## Details` subsections now render as `### 🎉 Features`, `### 🐛 Bug fixes`, `### ♻️ Refactoring`, `### 🧪 Tests`, and `### 📦 Dependencies`. Breaking changes in any subsection get a `🚨 **Breaking:**` Prefix on the entry's first line.

**Good:**

> Adds work-type emojis to PR-description section headings for at-a-glance scanning, and an inline marker on entries that introduce breaking changes.

Cut: Every specific emoji, every header string, every marker glyph — all output-format details. Survives: The outcome (scanability) and the fact that breaking changes carry a marker, without naming the marker. The trap with this pattern is the urge to enumerate the new visuals because they feel like the user-facing change; they aren't — the user-facing change is "things are easier to scan."

### Bad → Good: Allowed identifier, no payoff

**Bad** (both rules pass; identifier is allowed; but the file path buries the outcome):

> Adds a `.changelog-overrides.json` file to the repo root that lets `release-kit` consumers skip or correct historical changelog entries.

**Good:**

> Allows `release-kit` consumers to skip or correct historical changelog entries by means of an overrides file.

Both drafts use only allowed identifiers (`.changelog-overrides.json` is a top-level config-file path; `release-kit` is a package name). The Bad version leads with the file, treating the path as a fact worth announcing. The Good version names "an overrides file" without specifying the default filename — the reader who goes to use the feature will find the filename in the docs they consult. The judgment isn't allowed-vs-banned; it's earning-its-words-vs-not.
