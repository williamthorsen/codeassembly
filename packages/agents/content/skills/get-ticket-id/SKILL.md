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

### From branch name: bare numeric branches

If the Jira-style pattern `[A-Z]+-[0-9]+` does not match, check for a **bare issue number**: one or more digits anchored to the start of the branch name, terminated by `/`, `_`, `-`, or end-of-string.

When a bare number is found, read `project.ticket_prefix` from `.agents/preferences.yaml` to determine the returned ticket ID:

- If `ticket_prefix` is `#`: return the **bare number only**. The `#` is a GitHub display convention and must not appear in file paths or returned values.
- If `ticket_prefix` is a Jira-style prefix (e.g., `MAC-`): return `{prefix}{number}` (e.g., `MAC-147`).
- If no `ticket_prefix` is configured: return the bare number (e.g., `42`).

| Branch         | `ticket_prefix` | Returned ticket ID |
| -------------- | --------------- | ------------------ |
| `152`          | `#`             | `152`              |
| `147/feat/foo` | `MAC-`          | `MAC-147`          |
| `42`           | _(none)_        | `42`               |

```bash
branch_name="${1:-$(git branch --show-current)}"

# Try Jira-style first
ticket_id=$(echo "$branch_name" | grep -oE '^[A-Z]+-[0-9]+(\.[0-9]+)?' | head -1)

# Fall back to bare numeric
if [ -z "$ticket_id" ]; then
  bare_number=$(echo "$branch_name" | grep -oE '^[0-9]+' | head -1)
  if [ -n "$bare_number" ]; then
    # Read ticket_prefix from preferences (yq or manual YAML parsing)
    prefix=$(grep 'ticket_prefix:' .agents/preferences.yaml 2>/dev/null \
      | head -1 | sed "s/.*ticket_prefix:[[:space:]]*['\"]\\{0,1\\}\\([^'\"]*\\)['\"]\\{0,1\\}/\\1/")
    if [ "$prefix" = "#" ]; then
      ticket_id="$bare_number"
    elif [ -n "$prefix" ]; then
      ticket_id="${prefix}${bare_number}"
    else
      ticket_id="$bare_number"
    fi
  fi
fi

echo "$ticket_id"
```

### From current context (default)

| Branch ticket | Commit ticket | Action                                      |
| ------------- | ------------- | ------------------------------------------- |
| Found         | Same          | Return ticket ID                            |
| Found         | Different     | Use branch ticket; ask developer to confirm |
| Found         | None          | Return branch ticket ID                     |
| None          | Found         | Return commit ticket ID                     |
| None          | None          | Error: no ticket ID found                   |
