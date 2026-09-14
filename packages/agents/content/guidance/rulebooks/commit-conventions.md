---
slug: commit-conventions
description: Commit title and body conventions, the work-type taxonomy, and branch naming. Consult before writing a commit message or naming a branch.
delivery: skill
version: '6'
---

# Git commit conventions

A commit on the default branch is extracted into the changelog and, for release-notes-contributing work types, into release notes. Under a squash merge that is the merge commit alone, whose body `merge-pr` composes from the pull request's `## What`; the branch commits collapsed by a squash appear in no changelog and no release notes. A branch commit is input to `summarize-change`'s lede drafter instead, which reads the branch's commit log to answer what the pull request is about. Write with that reader in mind.

## Commit metadata

- `WORK_TYPE` describes the category of work (see [`work-types.json`](../../skills/_data/work-types.json)).

## Commit title

Voice, length, content discipline, and the ticket-reference rule are stated in [`title-voice.md`](../../skills/_data/title-voice.md), which governs the authored string across every surface into which it is rendered. Two rules are commit-specific:

- Render via `describe-change.mjs`; see [`title-templates.md`](../../skills/_data/title-templates.md) for the full template syntax, supported tokens, and rendering pipeline.
- Mark breaking changes by appending `!` to the work type: `agents|feat!: Remove deprecated API`. See [Breaking changes](#breaking-changes) below for which types are eligible.

## Ticket ID

The branch name records the ticket. Include the ID at the end of the commit body only if the branch covers more than one ticket (rare).

## Commit body

**Body voice.** The body is a source that the lede drafter reads, not an entry that a reader meets. Report what the commit did, completely and factually, and leave the selecting to the drafter: It drops what the change's reader would not act on, and a fact omitted by the body is one that no lede recovers.

### Body mechanics

<!-- include: ../../_partials/prose-line-breaks.md / -->

- **Punctuate list items.** Each bulleted item ends with a period, comma, or semicolon.
- **Use backticks for code identifiers.** Variable names, function names, class names, and file paths must be wrapped in backticks (e.g., `handleStateUpdate`, `AgentActor`, `src/lib/manifest.ts`).
- **Break up large paragraphs.** Use a blank line between paragraphs. Prefer short, focused paragraphs over walls of text.

## Changes touching multiple scopes

For the structural scope values (`root`, `*`, workspace name), see "Scope values" in [`title-templates.md`](../../skills/_data/title-templates.md).

Commit-side application: When more than one scope-value would technically apply, use the closest fit. If a root change is tightly associated with only one workspace, count it as a workspace change rather than a root change. Common example: If a package is added to `packages/workspace-a`, that updates the package lock file in root; still treat the commit as a workspace change.

## Branch naming

Branch names follow `{ticket}/{description}`. `_` is interchangeable with `/` as a separator. See [`branch-format.md`](../../skills/_data/branch-format.md) for the full specification.

## Work types reference

See [`work-types.json`](../../skills/_data/work-types.json) for the canonical taxonomy. Each type belongs to one of three tiers:

- **Public**: Consumer-facing.
- **Internal**: Not consumer-facing.
- **Process**: Tooling and supporting work.

### Precedence

Pick the type that best describes the commit's dominant purpose. When more than one type applies, tiebreak in favor of the higher tier (public > internal > process), then by earlier listing within a tier.

### Breaking changes

Whether a commit can take a breaking-change marker (`!`, e.g., `feat!`, `drop!`) is set per-type by the `breakingPolicy` field in `work-types.json`:

- **`required`**: `drop`. Removing a public surface always breaks consumers; the marker is therefore mandatory.
- **`optional`**: `feat`, `fix`, `sec`, `perf`. Any of these can break consumers, and the marker records when one does. A fix can break consumers who relied on the defective behavior, and a performance change can break a contract as the means of its gain.
- **`forbidden`**: `deprecate` and every internal- and process-tier type. Deprecating a surface keeps it working, and removing it is a `drop`. Internal- and process-tier work does not face consumers; a change that breaks consumers faces them and therefore takes a public-tier type.

### AI agent instructions

Instructions for AI agents (typically in Markdown format) should be treated equivalently to source code, not as documentation. Such instructions intended for use by other projects are considered consumer-facing.
