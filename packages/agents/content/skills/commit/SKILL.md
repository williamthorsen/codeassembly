---
name: commit
description: Git commit message format and metadata conventions for version control
user-invocable: true
---

# Git commit conventions

Commit titles and bodies are extracted into the changelog and, for release-notes-contributing work types, into release notes. Commit bodies also feed the PR's `## What` section via the `summarize-change` skill. Write with those downstream surfaces in mind.

## Commit message format

See `../_data/commit-format.md` for the full specification, including how to render the commit title using `describe-change.sh`.

## Commit metadata

- `WORK_TYPE` describes the category of work (see `../_data/work-types.json`)

## Ticket ID

Do not include the ticket ID in the commit title. The branch name carries it. Include it at the end of the commit body only if the branch covers more than one ticket (rare).

## Line length

- **Title**: 72 characters max (hard limit).
- **Body**: No hard wrapping. Write naturally — do not insert newlines to wrap at a column width.

## Title guidelines

- **Imperative, task-oriented voice.** "Add…", "Fix…", "Prevent…", "Enable…" — describing what the coder did. The title appears next to the PR number in release notes; it reads as the task. This voice is distinct from the body voice, which is declarative (see below).
- **Describes the code change, not what prompted it.** Ask: "what does the diff do?" — not "why did I open the editor?" Bad: "Address review findings", "Apply feedback", "Incorporate suggestions". Good: "Add error logging to handleStateUpdate", "Remove dead rejection handler".
- **Describes the outcome, not the mechanism.** The title feeds the changelog and, for release-notes-contributing work types, the release notes — a reader scanning those sees only the title. Ask: "what does this change deliver?" — not "what did I edit?" Bad: "Upgrade hono from v1 to v2". Good: "Upgrade hono to patch authentication vulnerability".
- **No ephemeral references.** If it won't make sense to a reader who has only `git log`, leave it out.
- **Only document what's in the diff.** External actions (e.g., updating a ticket) are not part of the commit and don't belong in its message.

## Body guidelines

**Voice: release-notes voice.** The commit body feeds the changelog, release notes (for release-notes-contributing types), and the PR's `## What` section. Apply the [release-notes voice](../_data/release-notes-voice.md): The per-sentence outcome test and the identifier ban. The first paragraph of the body must stand alone as the changelog/release-notes entry; subsequent paragraphs may elaborate for the engaged reader who has clicked through.

**No hard line breaks.** Write each paragraph or list item as a single long line. Do not insert newlines to wrap at a column width. Every tool that renders commit messages handles wrapping; manual breaks produce ragged text.

See `../_data/commit-format.md` for mechanical body formatting rules (punctuation, backtick formatting, paragraph structure, and what to omit).

## Changes touching multiple scopes

- Use `root` if commit touches only files in monorepo root
- Use `*` if commit comprises changes to multiple scopes, or root and one or more scopes
- If a root change is tightly associated with only one scope, don't count it as a root change

Common example: If a package is added to `packages/workspace-a`, that updates the package lock file in root. Don't treat that as a change to root.

## Branch naming

Branch names follow `{ticket}/{description}`. `_` is interchangeable with `/` as a separator. See `../_data/branch-format.md` for the full specification.

## Work types reference

See `../_data/work-types.json` for the canonical taxonomy. Each type belongs to one of three tiers:

- **Public** — consumer-facing.
- **Internal** — not consumer-facing.
- **Process** — tooling and supporting work.

### Precedence

Pick the type that best describes the commit's dominant purpose. When more than one type applies, tiebreak in favor of the higher tier (public > internal > process), then by earlier listing within a tier.

### Breaking changes

Whether a commit can carry a breaking-change marker (`!`, e.g., `feat!`, `drop!`) is governed per-type by the `breakingPolicy` field in `work-types.json`:

- **`required`**: `drop` — removing a public surface is always breaking, so the marker is mandatory.
- **`optional`**: `feat`, `sec` — additions or security work may or may not break consumers; mark with `!` when they do.
- **`forbidden`**: all other types — these categories cannot introduce a breaking change. If your work would break consumers, it belongs under `feat`, `drop`, or `sec`.

### AI agent instructions

Instructions for AI agents (typically in Markdown format) should be treated equivalently to source code, not as documentation. Such instructions intended for use by other projects are considered consumer-facing.
