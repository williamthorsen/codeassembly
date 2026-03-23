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

Resolve artifact directory using `get-session-context` to obtain `artifact_base_dir`, `project_slug`, and `artifact_paths`. The devlogs path is `artifact_paths.devlogs` (default: `devlogs`).

Full path: `{artifact_base_dir}/projects/{project_slug}/{devlogs_path}/`

Follow [artifact conventions](../_data/artifact-conventions.md).

Artifact type: `devlog`. Filename format:

```
{YYYYMMDD}-{HHmm}Z_{concise-title-in-kebab-case}.md
```

Example: `20250809-1430Z_fix-csp-violation-preventing-script-injection.md`
