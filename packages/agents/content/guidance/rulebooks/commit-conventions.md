---
slug: commit-conventions
description: Commit title and body conventions, the work-type taxonomy, and branch naming. Consult before writing a commit message or naming a branch.
delivery: skill
version: 1
---

# Git commit conventions

Commit titles and bodies are extracted into the changelog and, for release-notes-contributing work types, into release notes. The `summarize-change` skill also uses commit bodies for the PR's `## What` section. Write with those downstream surfaces in mind.

## Commit metadata

- `WORK_TYPE` describes the category of work (see [`work-types.json`](../../skills/_data/work-types.json)).

## Commit title

Render via `describe-change.sh` — see [`title-templates.md`](../../skills/_data/title-templates.md) for the full template syntax, supported tokens, and rendering pipeline.

- **72 characters max** (hard limit).
- **Imperative, task-oriented voice.** "Add…", "Fix…", "Prevent…", "Enable…" — describing what the coder did. The title appears next to the PR number in release notes; it reads as the task. Distinct from the lede voice, which is declarative ("Adds…", "Fixes…").
- For content discipline (the code change rather than what prompted it, no ephemeral references, only what's in the diff), see [Titles](../../skills/_data/lede-voice.md#titles).
- Mark breaking changes by appending `!` to the work type: `agents|feat!: Remove deprecated API`. See [Breaking changes](#breaking-changes) below for which types are eligible.

## Ticket ID

Do not include the ticket ID in the commit title. The branch name records it. Include it at the end of the commit body only if the branch covers more than one ticket (rare).

## Commit body

**Body voice.** The commit body feeds the changelog, release notes (for release-notes-contributing types), and the PR's `## What` section. The first paragraph of the body is the lede and must stand alone as the entry, so the budget below applies to it alone; subsequent paragraphs are elaboration for the engaged reader who has clicked through, and the budget does not apply to them.

<!-- include: ../../_partials/voice-checklist.md / -->

### Body mechanics

<!-- include: ../../_partials/prose-line-breaks.md / -->

- **Punctuate list items.** Each bulleted item ends with a period, comma, or semicolon.
- **Use backticks for code identifiers.** Variable names, function names, class names, and file paths must be wrapped in backticks — e.g., `handleStateUpdate`, `AgentActor`, `src/lib/manifest.ts`.
- **Break up large paragraphs.** Use a blank line between paragraphs. Prefer short, focused paragraphs over walls of text.

## Changes touching multiple scopes

For the structural scope values (`root`, `*`, workspace name), see "Scope values" in [`title-templates.md`](../../skills/_data/title-templates.md).

Commit-side application: When more than one scope-value would technically apply, use the closest fit. If a root change is tightly associated with only one workspace, count it as a workspace change rather than a root change. Common example: If a package is added to `packages/workspace-a`, that updates the package lock file in root — still treat the commit as a workspace change.

## Branch naming

Branch names follow `{ticket}/{description}`. `_` is interchangeable with `/` as a separator. See [`branch-format.md`](../../skills/_data/branch-format.md) for the full specification.

## Work types reference

See [`work-types.json`](../../skills/_data/work-types.json) for the canonical taxonomy. Each type belongs to one of three tiers:

- **Public** — consumer-facing.
- **Internal** — not consumer-facing.
- **Process** — tooling and supporting work.

### Precedence

Pick the type that best describes the commit's dominant purpose. When more than one type applies, tiebreak in favor of the higher tier (public > internal > process), then by earlier listing within a tier.

### Breaking changes

Whether a commit can take a breaking-change marker (`!`, e.g., `feat!`, `drop!`) is set per-type by the `breakingPolicy` field in `work-types.json`:

- **`required`**: `drop` — removing a public surface is always breaking, so the marker is mandatory.
- **`optional`**: `feat`, `sec` — additions or security work may or may not break consumers; mark with `!` when they do.
- **`forbidden`**: All other types — these categories cannot introduce a breaking change. If your work would break consumers, it belongs under `feat`, `drop`, or `sec`.

### AI agent instructions

Instructions for AI agents (typically in Markdown format) should be treated equivalently to source code, not as documentation. Such instructions intended for use by other projects are considered consumer-facing.
