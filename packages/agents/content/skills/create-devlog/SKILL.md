---
name: create-devlog
description: Create a devlog entry summarizing recent work
user-invocable: true
---

# Create devlog entry

Summarize changes made in recent commits or the working tree.

## Arguments

- No arguments: Summarize the last commit
- `<n>`: Summarize the last N commits
- `working-tree`: Summarize uncommitted changes

## Output format

```markdown
# Devlog: {Concise description}

**Date**: {YYYY-MM-DD HH:MM UTC}
**Task**: {Brief task description}

## Problem

{What issue was being addressed}

## Solution

{How it was solved}

## Lessons learned

{Key insights, especially wrong turns that were corrected}

## Work done

{Summary of changes made}
```

## Guidance

- Include code snippets only for important lessons learned
- Never include lengthy code snippets
- Focus on the most important findings
- Use only sections appropriate for the task

## Saving

Resolve artifact directory:

1. Read `artifacts.base_dir` and `artifacts.paths.devlogs` from `.agents/preferences.yaml`
2. If not found there, read from `~/.agents/preferences.yaml`
3. If still not found, use defaults: base_dir=`.ai`, path=`devlogs`
4. If base_dir is relative, resolve from project root (`git rev-parse --show-toplevel`). If absolute, use as-is.
5. Use `get-project-slug` for the project slug.
6. Full path: `{base_dir}/projects/{project-slug}/{path}/`

Follow [artifact conventions](_data/artifact-conventions.md).

Artifact type: `devlog`. Filename format:

```
{YYYYMMDD}-{HHmm}Z_{concise-title-in-kebab-case}.md
```

Example: `20250809-1430Z_fix-csp-violation-preventing-script-injection.md`
