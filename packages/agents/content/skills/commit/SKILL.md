---
name: commit
description: Git commit message format and metadata conventions for version control
user-invocable: true
---

# Git commit conventions

Commit titles and bodies are extracted into the changelog and, for release-notes-contributing work types, into release notes. Commit bodies also feed the PR's `## What` section via the `summarize-change` skill. Write with those downstream surfaces in mind.

## Commit message format

See `../_data/commit-format.md` for the full specification, including how to resolve the commit title prefix using `describe-change.sh`.

## Commit metadata

- `WORK_TYPE` describes the category of work (see `../_data/work-types.md`)

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

**Voice: release-notes voice.** The body is extracted into the changelog and, for release-notes-contributing types, into release notes — and it feeds the PR's `## What` section when a change summary is prepared, so the two should read the same way. Openings like "Fixes an issue where…", "Adds support for…", "Improves…", "Removes…". See the `summarize-change` skill's `## What` section (`../summarize-change/SKILL.md`) for the canonical statement and cross-type examples.

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

See `../_data/work-types.md` for the full list of work types ordered by priority:

1. **Primary**: fix, feat, internal
2. **Secondary**: refactor, tests
3. **Tertiary**: tooling, ci, deps, ai, docs, fmt

Use the highest-applicable work type from the list.
