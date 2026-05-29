---
name: align-ticket-with-implementation
description: Align an issue ticket with the current branch's implementation
user-invocable: true
---

# Align ticket with implementation

Produce or revise an issue ticket (e.g., GitHub issue, Jira issue) to describe what the current branch's implementation accomplishes.

## Process

1. **Analyze branch changes**: Invoke `node {platform_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch` from the manifest JSON it emits on stdout, then run:

```bash
git diff $DEFAULT_BRANCH...HEAD
```

2. **Write ticket** describing issues that were addressed

## Output structure

The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema. See [Frontmatter resolution](#frontmatter-resolution) below for field resolution. The frontmatter conforms to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter).

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

## Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`.

Run `{platform_home_dir}/scripts/resolve-frontmatter.sh --skill align-ticket-with-implementation --interactive true --model "$MODEL_ID"` via Bash. Prepend the output verbatim to the artifact body.

## Saving

### Path resolution

Invoke `node {platform_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; read `artifact_base_dir`, `project_slug`, and `ticket_id` from it (the same invocation in step 1 already populated the manifest file, so this is a fast-path read).

Follow [artifact conventions](../_data/artifact-conventions.md).

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Artifact type: `ticket`. Filename format:

```
{timestamp}_{slug}_ticket.md
```

Example: `20250809-1430Z_fix-memory-leak_ticket.md`
