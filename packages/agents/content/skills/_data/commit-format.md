# Git commit format

## Commit title format

The standard commit title is 72 characters max (hard limit):

```txt
{workspace}|{WORK_TYPE}: {commit title}
```

If the project does not have monorepo workspaces, omit the `{workspace}`:

```
{WORK_TYPE}: {description}
```

Add `!` after the work type to indicate breaking changes: `ts|feat!: Remove deprecated API`

## Ticket ID

Do not include the ticket ID in the commit title. The branch name already carries it.

Include the ticket ID at the end of the commit body only if the branch covers more than one ticket (rare).

## Line length

- **Title**: 72 characters max (hard limit).
- **Body**: No hard wrapping. Write naturally — do not insert newlines to wrap at a column width.

## Examples

### Monorepo workspace

In a monorepo the workspace is usually the name (or abbreviated name) of the workspace changed by the commit:

```
web|tests: Fix ProgressNotes tests broken by upgrades
*|internal: Add user route and user profile component
admin|deps!: Upgrade React to v18
```

### Non-monorepo

```
feat: Add user profile component
deps: Upgrade React to v18
```

## Body formatting

- **Punctuate list items.** Each bulleted item ends with a period, comma, or semicolon.
- **Use backticks for code identifiers.** Variable names, function names, class names, and file paths must be wrapped in backticks — e.g., `handleStateUpdate`, `AgentActor`, `src/lib/manifest.ts`.
- **Never reference automated tests or CI.** Do not mention formatting, linting, unit tests, or typechecking as part of what the commit does.
- **Never use review finding IDs.** Identifiers like F1, W2, T3 belong only in review documents — they are meaningless in `git log`.
- **Break up large paragraphs.** Use a blank line between paragraphs. Prefer short, focused paragraphs over walls of text.

## Branch naming

See `branch-format.md` for branch naming conventions. Branch format: `{ticket}/{description}`.

## Legacy format

This was the previously used format. Some projects still use it, but don't propagate it. The `{TICKET}` prefix in these templates is part of the old format and should not be used in new commits.

```txt
{workspace} {TICKET}: [{WORK_TYPE}] {description}

# No ticket
{workspace} [{WORK_TYPE}] {description}

# Not a monorepo
{TICKET}: [{WORK_TYPE}] {description}

# No ticket, not a monorepo
[{WORK_TYPE}] {description}
```
