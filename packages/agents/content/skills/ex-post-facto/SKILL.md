---
name: ex-post-facto
description: Write issue ticket for already-completed work based on branch changes
user-invocable: true
---

# Ex post facto ticket

Write an issue ticket (e.g., Jira issue) describing the issues that would have needed to be fixed, had the current branch changes not been made.

## Process

1. **Analyze branch changes** using `get-default-branch`:

```bash
git diff $DEFAULT_BRANCH...HEAD
```

2. **Write ticket** describing issues that were addressed

## Output structure

```markdown
# {Title}

## Description

{One-sentence summary}

### Issues

- {Issue 1}
- {Issue 2}

## Acceptance criteria

### Must have

{Critical fixes required for functionality}

### Should have

{Important improvements - include single "Fix lint" item if applicable}

### Nice to have

{Optional enhancements}

## Context

{Brief note if changes are part of larger effort}
```

## Guidance

- Do not mention linting violations in detail - use single "Fix lint" item if needed
- Keep tone professional but concise
- Focus on what was broken and what needed fixing
- Prioritize functional issues in "Must have"
- Place code quality/maintenance items in "Should have"

## Saving

### Path resolution

1. Read `artifacts.base_dir` from `.agents/preferences.yaml`, falling back to `~/.agents/preferences.yaml`, then default `~/.ai`
2. If base_dir is relative, resolve from project root. If absolute, use as-is.
3. Use `get-project-slug` for the project slug.

Follow [artifact conventions](_data/artifact-conventions.md).

Ticket directory: `{base_dir}/projects/{project-slug}/tickets/{ticket-id}/`

Artifact type: `ticket`. Filename format:

```
{timestamp}_{slug}_ticket.md
```

Example: `20250809-1430Z_fix-memory-leak_ticket.md`
