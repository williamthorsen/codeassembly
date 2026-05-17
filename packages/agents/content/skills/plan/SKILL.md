---
name: plan
description: Create a structured plan document for analysis or implementation
user-invocable: true
---

# Plan

Create a structured plan document for analysis, design, or implementation work.

## Arguments

- Task or problem description (required): what to plan for
- `--role=<role>` (optional): agent role for run artifact naming (default: `agent`)

## Output format

The plan begins with YAML frontmatter conforming to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the [plan provenance](../_data/artifact-conventions.md#plan-provenance) extension; field-resolution steps live in the [Frontmatter resolution](#frontmatter-resolution) section below. `provenance.model` is omitted — plans authored via this skill are co-authored interactively, not solely AI-generated.

The body following the frontmatter has this structure:

```markdown
# Plan: {Descriptive title}

**Date**: {YYYY-MM-DD HH:MM UTC}
**Scope**: {Brief scope statement}

## Problem

{What needs to be solved}

## Approach

{High-level strategy}

## Steps

1. {Step description}
2. {Step description}

## Risks

{Known risks or unknowns}

## Dependencies

{External dependencies or blockers}
```

Sections are optional — use only what's appropriate for the task.

## Guidance

- Focus on clarity and actionability
- Include concrete steps, not vague goals
- Call out risks and unknowns explicitly
- Keep the plan concise — detail belongs in implementation, not planning
- When comparing approaches, rank options per [design priorities](../_data/design-priorities.md)

## Saving

Resolve artifact directory based on context.

### Frontmatter resolution

The artifact frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Run `resolve-frontmatter.sh --skill plan --interactive true` via Bash. Prepend the output verbatim to the artifact body.

If the script's stderr contains `Note: PR lookup failed; proceeding without pr field.`, surface that line in your text output once.

### Run context

If inside an active run (`run-index.json` exists in a parent directory):

- Save as run artifact: `{run-dir}/{timestamp}_{role}_plan.md`
- Role comes from `--role` argument (default: `agent`)

### Ticket context

1. Use `get-session-context` to obtain `ticket_id`, `project_slug`, and `artifact_base_dir`. If no ticket ID is available, auto-generate: `{YYYYMMDD}-{4 random hex}`.
2. Save as ticket-level artifact: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/{timestamp}_{slug}_plan.md`
3. Slug derived from the plan's descriptive title (kebab-case, max 60 chars).

Follow [artifact conventions](../_data/artifact-conventions.md).

`mkdir -p` the target directory before writing.

Artifact type: `plan`. Filename format:

```
{YYYYMMDD-HHMMSSZ}_{slug}_plan.md
```

Example: `20260223-143000Z_migrate-auth-to-oauth2_plan.md`

## Completion

Report the file path when done. That's all the user needs to know.
