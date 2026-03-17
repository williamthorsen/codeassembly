---
name: create-pr
description: Create GitHub pull request from change summary
user-invocable: true
---

# Create GitHub pull request

Create a pull request using the GitHub CLI and existing PR description.

## Process

1. **Find PR description file**:
   - Use `get-session-context` to obtain `ticket_id`, `project_slug`, `artifact_base_dir`, and `default_branch`
   - Look for most recently modified `*_change-summary.md` in `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

2. **Extract title**:
   - Use the first `#` heading from the file as PR title

3. **Check branch sync**:
   - If current branch is not up to date with remote, **STOP THIS TASK**
   - Run `git status` to verify

4. **Create PR**:

   Derive the bare branch name from `default_branch` by stripping the remote prefix (e.g., `origin/main` -> `main`).

   Extract body from `## What` onward:

   ```bash
   BODY=$(sed -n '/^## What$/,$p' path/to/change-summary.md)
   gh pr create \
     --title "{extracted title from file}" \
     --body "$BODY" \
     --base "{bare branch name}" \
     --draft
   ```

## Important

- Strip the remote prefix from `default_branch` (e.g., `origin/main` -> `main`) for `--base`
- Do NOT use full reference (`origin/main`) - GitHub CLI expects branch name only
- Creates PR as draft by default
- If instructions are unclear, ask for confirmation before creating

## Verification

Before creating:

- [ ] Branch is up to date with remote
- [ ] PR description file exists and is current
- [ ] Title extracted correctly
- [ ] Base branch is correct
