---
name: get-ticket-id
description: Extract ticket ID from branch name, commit message, or current context
user-invocable: false
---

# Get ticket ID

Extract a Jira-style ticket ID from the current context.

## Arguments

- _(none)_: Extract from current context (branch name, then commit message)
- `from-branch` or `from-branch:<name>`: Extract from branch name (current if unspecified)
- `from-commit` or `from-commit:<ref>`: Extract from commit message (HEAD if unspecified)

## Pattern

`[A-Z]+-[0-9]+(\.[0-9]+)?` — matches `ABC-123`, `PT-1234`, `NMR-567.2`

## Implementation

### From branch name

In branch names, `_` and `/` are interchangeable separators (see `branch-format.md`). The regex below extracts correctly regardless of which separator is used.

```bash
branch_name="${1:-$(git branch --show-current)}"
echo "$branch_name" | grep -oE '[A-Z]+-[0-9]+(\.[0-9]+)?' | head -1
```

### From commit message

```bash
commit="${1:-HEAD}"
git log -1 --pretty=format:'%s' "$commit" | grep -oE '[A-Z]+-[0-9]+(\.[0-9]+)?' | head -1
```

### From current context (default)

| Branch ticket | Commit ticket | Action                                      |
| ------------- | ------------- | ------------------------------------------- |
| Found         | Same          | Return ticket ID                            |
| Found         | Different     | Use branch ticket; ask developer to confirm |
| Found         | None          | Return branch ticket ID                     |
| None          | Found         | Return commit ticket ID                     |
| None          | None          | Error: no ticket ID found                   |
