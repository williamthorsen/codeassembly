---
name: commit
description: Git commit message format and metadata conventions for version control
user-invocable: true
---

# Git commit conventions

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

- **Describes the code change, not what prompted it.** Ask: "what does the diff do?" — not "why did I open the editor?" Bad: "Address review findings", "Apply feedback", "Incorporate suggestions". Good: "Add error logging to handleStateUpdate", "Remove dead rejection handler".
- **No ephemeral references.** If it won't make sense to a reader who has only `git log`, leave it out.
- **Only document what's in the diff.** External actions (e.g., updating a ticket) are not part of the commit and don't belong in its message.

## Body guidelines

**No hard line breaks.** Write each paragraph or list item as a single long line. Do not insert newlines to wrap at a column width. Every tool that renders commit messages handles wrapping; manual breaks produce ragged text.

See `../_data/commit-format.md` for body formatting rules (punctuation, backtick formatting, paragraph structure, and what to omit).

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
