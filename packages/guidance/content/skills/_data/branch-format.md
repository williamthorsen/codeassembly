# Branch naming format

## Pattern

```
{TICKET_ID}/{DESCRIPTION}
```

## Separators

`_` and `/` are interchangeable separators in branch names. This is a branch-specific convention motivated by git worktrees: Worktree directories named after branches with `/` create unwanted directory nesting. Since descriptions use kebab-case (hyphens, never underscores), `_` is unambiguous as a structural separator.

## Segments

| Segment       | Format     | Notes                                                 |
| ------------- | ---------- | ----------------------------------------------------- |
| `TICKET_ID`   | `ABC-123`  | Jira-style ID. Always first.                          |
| `DESCRIPTION` | kebab-case | Short summary of the change. Everything after the ID. |

## Examples

```
MAC-123/add-user-profile
MAC-123_add-user-profile
```

## Backward compatibility

Old-format branch names like `MAC-123/agents/feat/add-orchestrator` still parse correctly: Everything after the ticket ID is treated as freeform description. Existing cached manifests that contain `workspace` and `work_type` fields remain valid and should be consumed as-is; those fields are simply no longer populated for new branches.

## Related skills

- `derive-session-context`: Bundled TypeScript helper (`node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs`) that parses the branch name and caches all derived metadata (ticket ID, branch name, artifact paths, and other metadata) in `.agents/{sanitized-branch}.branch-manifest.json` for single-lookup access. Preferred when multiple metadata fields are needed.
- `get-ticket-id`: Extracts the ticket ID segment.
