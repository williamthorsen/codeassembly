# Useful git commands

## Amend the message of a previous commit

To amend the message of a commit that is in the current history but not HEAD:

```bash
ORIGINAL_BRANCH=$(git branch --show-current); \
TEMP_BRANCH=${ORIGINAL_BRANCH}-temp; \
git checkout -b $TEMP_BRANCH; \
git reset --hard <commit-hash>; \
git commit --amend --no-gpg-sign --no-verify -m "Your new commit message"; \
git checkout $ORIGINAL_BRANCH; \
git rebase --onto $TEMP_BRANCH <commit-hash> $ORIGINAL_BRANCH; \
git branch -D $TEMP_BRANCH
```

Because AI agents typically execute commands in separate shells, and would lose the variable assignments,
the above steps are combined into a single command that runs in a single shell.

## Show all changed files in the working tree

Shows all changed files (staged, unstaged, and untracked). Excludes deleted files and ignored files.

```bash
(git diff --cached --diff-filter=AM --name-only && git diff --diff-filter=AM --name-only && git ls-files --exclude-standard --others) | sort | uniq
```

## Show all changes in the branch

```bash
git diff $(git merge-base origin/main HEAD) HEAD
```

## Show commit count by author

```bash
git shortlog -s -n origin/main..HEAD
```
