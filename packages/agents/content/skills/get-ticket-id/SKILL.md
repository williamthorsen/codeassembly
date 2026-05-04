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

The script `{platform_home_dir}/scripts/get-ticket-id.sh` extracts a ticket ID from a branch name. It accepts an optional branch name (defaults to the current branch) and prints the resolved ticket ID, or an empty string when no ID can be derived.

In branch names, `_` and `/` are interchangeable separators (see `branch-format.md`). The Jira-style match is unanchored, so it extracts the ID regardless of which separator is used or whether an author/scope prefix appears (e.g., `wt/COMPPLAN-795`, `feat/COMPPLAN-795-add-foo`).

When no Jira-style ID matches, the script falls back to a **bare issue number** anchored to the start of the branch name (terminated by `/`, `_`, `-`, or end-of-string). The anchor on the fallback prevents false matches against digits embedded in slugs like `feat/foo-2`.

When the bare-numeric fallback fires, the script reads `project.ticket_ref_prefix` from `.agents/preferences.yaml` to format the result:

- If `ticket_ref_prefix` is `#`: return the **bare number only**. The `#` is a GitHub display convention and must not appear in file paths or returned values.
- If `ticket_ref_prefix` is a Jira-style prefix (e.g., `MAC-`): return `{prefix}{number}` (e.g., `MAC-147`).
- If no `ticket_ref_prefix` is configured: return the bare number (e.g., `42`).

| Branch         | `ticket_ref_prefix` | Returned ticket ID |
| -------------- | ------------------- | ------------------ |
| `152`          | `#`                 | `152`              |
| `147/feat/foo` | `MAC-`              | `MAC-147`          |
| `42`           | _(none)_            | `42`               |

```bash
branch_name="${1:-$(git branch --show-current)}"
ticket_id=$({platform_home_dir}/scripts/get-ticket-id.sh "$branch_name")
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
