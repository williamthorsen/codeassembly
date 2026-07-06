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

Matches the canonical Jira-style ticket ID shape: case-insensitive, two-or-more letters, hyphen, digits — uppercased on output. Examples: `ABC-123`, `PT-1234`, `mac-130 → MAC-130`. Trailing `.N` sub-ticket and `-description` suffixes are tolerated in input but not part of the ID. See [`_data/ticket-id-extraction.md`](../_data/ticket-id-extraction.md) for the full contract and behavior table — it is the single source of truth shared with the `derive-session-context` TypeScript implementation.

Note: Kebab-case words followed by a digit (e.g., `feat-2`, `foo-2`) are matched and uppercased per the contract — branch slugs that incidentally contain such patterns will produce non-empty ticket IDs (`FEAT-2`, `FOO-2`). See the contract for the rationale.

Note: `PR-<n>` (e.g., `PR-123`) is a sanctioned identifier for a pull request that has no backing ticket. It matches the pattern like any two-letter prefix, so it resolves to `PR-123` and supplies a branch name and artifact directory. Downstream URL derivation treats it as a non-ticket and builds no ticket URL for it.

## Implementation

### From branch name

The script `{harness_home_dir}/scripts/get-ticket-id.sh` extracts a ticket ID from a branch name. It accepts an optional branch name (defaults to the current branch) and prints the resolved ticket ID, or an empty string when no ID can be derived.

In branch names, `_` and `/` are interchangeable separators (see `branch-format.md`). The Jira-style match is case-insensitive and unanchored, so it extracts the ID regardless of which separator is used or whether an author/scope prefix appears (e.g., `wt/COMPPLAN-795`, `wthorsen/MAC-130`, `feat/COMPPLAN-795-add-foo`). The result is uppercased before being returned.

When no Jira-style ID matches, the script falls back to a **bare issue number** anchored to the start of the branch name (terminated by `/`, `_`, `-`, or end-of-string). The anchor on the fallback prevents false matches against digits embedded in slugs that lack a Jira-style match.

When the bare-numeric fallback fires, the script reads `project.ticket_ref_prefix` from `.agents/preferences.yaml` to format the result:

- If `ticket_ref_prefix` is `#`: Return the **bare number only**. The `#` is a GitHub display convention and must not appear in file paths or returned values.
- If `ticket_ref_prefix` is a Jira-style prefix (e.g., `MAC-`): Return `{prefix}{number}` (e.g., `MAC-147`).
- If no `ticket_ref_prefix` is configured: Return the bare number (e.g., `42`).

| Branch         | `ticket_ref_prefix` | Returned ticket ID |
| -------------- | ------------------- | ------------------ |
| `152`          | `#`                 | `152`              |
| `147/feat/foo` | `MAC-`              | `MAC-147`          |
| `42`           | _(none)_            | `42`               |

```bash
branch_name="${1:-$(git branch --show-current)}"
ticket_id=$({harness_home_dir}/scripts/get-ticket-id.sh "$branch_name")
```

### From commit message

```bash
commit="${1:-HEAD}"
git log -1 --pretty=format:'%s' "$commit" | grep -oiE '[A-Z]{2,}-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]'
```

### From current context (default)

| Branch ticket | Commit ticket | Action                                      |
| ------------- | ------------- | ------------------------------------------- |
| Found         | Same          | Return ticket ID                            |
| Found         | Different     | Use branch ticket; ask developer to confirm |
| Found         | None          | Return branch ticket ID                     |
| None          | Found         | Return commit ticket ID                     |
| None          | None          | Error: No ticket ID found                   |
