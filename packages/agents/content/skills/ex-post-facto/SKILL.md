---
name: ex-post-facto
description: Write issue ticket for already-completed work based on branch changes
user-invocable: true
---

# Ex post facto ticket

Write an issue ticket (e.g., Jira issue) describing the issues that would have needed to be fixed, had the current branch changes not been made.

## Process

1. **Analyze branch changes** using `get-session-context` to obtain `default_branch`:

```bash
git diff $DEFAULT_BRANCH...HEAD
```

2. **Write ticket** describing issues that were addressed

## Output structure

The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema. See [Frontmatter resolution](#frontmatter-resolution) below for field resolution.

```markdown
---
provenance:
  skill: ex-post-facto
  timestamp: '{ISO 8601 UTC timestamp}'
  baseSha: '{short SHA of origin/main, omit if unresolvable}'
  isInteractive: true
  model: '{model id}'
ticket_id: '{ticket id, omit if absent}'
ticket_ref: '{ticket display ref, omit if absent}'
branch: '{current branch name}'
commit: '{short hash of HEAD}'
pr: '{full PR URL, omit if not resolved}'
---

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

## Frontmatter resolution

Resolve the universal-schema fields documented in [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter):

- `provenance.skill`: always `ex-post-facto`.
- `provenance.timestamp`: current UTC time in ISO 8601 format.
- `provenance.baseSha`: run `git rev-parse --short origin/main` via Bash; omit if it fails.
- `provenance.isInteractive`: always `true`.
- `provenance.model`: the model identifier executing this skill (read from the environment block in the system prompt).
- `ticket_id`, `ticket_ref`: from session context. Omit when null.
- `branch`: from session context (`branch_name`).
- `commit`: run `git rev-parse --short HEAD`.
- `pr`: resolve via [`../_data/pr-resolution.md`](../_data/pr-resolution.md). Read `platform` from session context, then run the matching snippet via the Bash tool with `timeout: 5000`:
  <!-- include: ../../_partials/pr-resolution-dispatch.md / -->

  On non-empty output, write the URL to `pr:`. On empty output (no PR exists), omit the `pr:` line — emit no warning. On non-zero exit, timeout, or other failure, omit the `pr:` line and emit `Note: PR lookup failed; proceeding without pr field.` in the agent text output.

## Saving

### Path resolution

Use `get-session-context` to obtain `artifact_base_dir`, `project_slug`, and `ticket_id`.

Follow [artifact conventions](../_data/artifact-conventions.md).

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Artifact type: `ticket`. Filename format:

```
{timestamp}_{slug}_ticket.md
```

Example: `20250809-1430Z_fix-memory-leak_ticket.md`
