---
name: get-default-branch
description: Get the project's default branch reference using config-first optimization
user-invocable: false
---

# Get default branch

Return the project's default branch as a full remote reference (e.g., `origin/main`).

## Arguments

- `name-only` — Return branch name only (e.g., `main` instead of `origin/main`)

## Resolution order

### 1. Config lookup (preferred)

Check project-local then global preferences:

- **Project:** `.agents/preferences.yaml`
- **Global:** `~/.agents/preferences.yaml`

Look for `repository.default_remote[0]` to get `name` and `default_branch`.

```yaml
repository:
  default_remote:
    - name: origin
      default_branch: next
```

Returns `origin/main` (or `next` if `name-only`).

### 2. Git fallback

Only used when config is missing:

```bash
remote=${1:-origin}
branch=$(git remote show ${remote} 2>/dev/null | grep 'HEAD branch' | cut -d' ' -f5)
echo "${remote}/${branch}"
```

## Constraints

- Always return the **full remote reference** by default — some git commands produce wrong output with bare branch names
- Use `name-only` when the caller needs just the branch name (e.g., `gh pr create --base`)
- Config takes priority over git command; config lookup is instant vs ~500ms for the git command
