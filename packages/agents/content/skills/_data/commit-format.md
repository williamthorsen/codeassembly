# Git commit format

## Commit title prefix

Commit titles may include a prefix that identifies scope (workspace, package, module) and work type. The prefix format is configurable per repository and per user.

### Resolving the prefix

Run the `describe-change.sh` script to resolve the correct prefix:

```bash
{skills_root}/../scripts/describe-change.sh --scope {scope} --type {type}
```

The script reads `commit.prefix`, `ticket.prefix`, and `pr.prefix` from `.agents/preferences.yaml` (project) then `~/.agents/preferences.yaml` (global), falling back to empty string. It outputs JSON:

```json
{ "commit_prefix": "agents|feat: ", "ticket_prefix": "agents|feat: ", "pr_prefix": "agents|feat: " }
```

Use the `commit_prefix` field for commit titles. Non-empty values already include the trailing `: `.

If the script is not found, produce no prefix.

### Supported conventions

Configure the prefix convention in `.agents/preferences.yaml` or `~/.agents/preferences.yaml`:

```yaml
commit:
  prefix: '{scope}|{type}'
```

| Convention        | Example with scope + type            | Example with type only       |
| ----------------- | ------------------------------------ | ---------------------------- |
| `{scope}\|{type}` | `agents\|feat: Add script installer` | `feat: Add script installer` |
| `{scope}({type})` | `agents(feat): Add script installer` | `feat: Add script installer` |
| `{type}`          | `feat: Add script installer`         | `feat: Add script installer` |
| `''` (empty)      | `Add script installer`               | `Add script installer`       |

When only `--type` is provided (no `--scope`), the prefix is always `{type}: ` regardless of convention. When only `--scope` or neither is provided, the prefix is empty.

### Scope

The scope identifies the part of the codebase affected by the commit:

- In a monorepo, the scope is typically the workspace name or abbreviation.
- Use `root` if the commit touches only files in the monorepo root.
- Use `*` if the commit spans multiple workspaces, or root and one or more workspaces.
- If a root change is tightly associated with only one workspace, don't count it as a root change.

Common example: if a package is added to `packages/workspace-a`, that updates the package lock file in root. Don't treat that as a change to root.

## Title constraints

- **72 characters max** (hard limit).
- **Describes the code change, not what prompted it.** Ask: "what does the diff do?" Bad: "Address review findings". Good: "Add error logging to `handleStateUpdate`".
- **No ephemeral references.** If it won't make sense to a reader who has only `git log`, leave it out.
- **Only document what's in the diff.** External actions (e.g., updating a ticket) don't belong.

Add `!` after the work type to indicate breaking changes: `agents|feat!: Remove deprecated API`

## Ticket ID

Do not include the ticket ID in the commit title. The branch name already carries it.

Include the ticket ID at the end of the commit body only if the branch covers more than one ticket (rare).

## Line length

- **Title**: 72 characters max (hard limit).
- **Body**: No hard wrapping. Write naturally — do not insert newlines to wrap at a column width.

## Body formatting

- **Punctuate list items.** Each bulleted item ends with a period, comma, or semicolon.
- **Use backticks for code identifiers.** Variable names, function names, class names, and file paths must be wrapped in backticks — e.g., `handleStateUpdate`, `AgentActor`, `src/lib/manifest.ts`.
- **Never reference automated tests or CI.** Do not mention formatting, linting, unit tests, or typechecking as part of what the commit does.
- **Never use review finding IDs.** Identifiers like F1, W2, T3 belong only in review documents — they are meaningless in `git log`.
- **Break up large paragraphs.** Use a blank line between paragraphs. Prefer short, focused paragraphs over walls of text.

## Branch naming

See `branch-format.md` for branch naming conventions. Branch format: `{ticket}/{description}`.
