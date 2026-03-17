---
name: condense-branch
description: Squash branch commits into a single well-described commit
user-invocable: true
---

# Condense branch

Condense the current branch into a single commit with a comprehensive message.

## Process

1. **Stash changes** if working tree is dirty

2. **Analyze branch** to create a good commit message

3. **Create backup branch**:

```bash
git branch $(git branch --show-current)-v1
```

If branch exists, increment version number.

4. **Condense commits**:

   Use `get-session-context` to obtain `default_branch`.

   ```bash
   git reset --soft $(git merge-base {default-branch} HEAD)
   git add --all
   git commit --message "{title}" --message "{body}" --no-gpg-sign --no-verify
   ```

## Commit message creation

### If commits have detailed descriptions

Synthesize existing descriptions to describe the final result. Omit information that's no longer relevant (e.g., changes made then reversed).

### If commits lack detail

Use `summarize-change` to compose a good commit message. Save the description per standard artifact conventions.

## Commit format

Follow `_data/commit-format.md`:

```
{workspace}|{WORK_TYPE}: {title}

{body}
```

## Safety

- Always create a backup branch before condensing
- Increment version numbers if backup already exists
- Use `--no-gpg-sign --no-verify` to avoid hook issues
