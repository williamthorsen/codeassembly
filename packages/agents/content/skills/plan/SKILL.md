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

The plan begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema and the [plan provenance](../_data/artifact-conventions.md#plan-provenance) extension. `provenance.model` is omitted — plans authored via this skill are co-authored interactively, not solely AI-generated.

```markdown
---
provenance:
  skill: plan
  timestamp: '{ISO 8601 UTC timestamp}'
  baseSha: '{short SHA of origin/main, omit if unresolvable}'
  isInteractive: true
ticket_id: '{ticket ID from session context, omit if null}'
ticket_ref: '{ticket display ref, omit if null}'
branch: '{branch name from session context}'
commit: '{short hash of HEAD}'
pr: '{full PR URL, omit if not resolved}'
run_id: '{run id, omit when not in an orchestrated run}'
---

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

Before writing, resolve the universal-schema fields documented in [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter):

- `provenance.skill`: always `plan`.
- `provenance.timestamp`: current UTC time in ISO 8601 format.
- `provenance.baseSha`: run `git rev-parse --short origin/main`; omit if it fails.
- `provenance.isInteractive`: always `true`.
- `ticket_id`, `ticket_ref`: from session context. Omit when null.
- `branch`: from session context (`branch_name`).
- `commit`: run `git rev-parse --short HEAD`.
- `pr`: resolve via [`_data/pr-resolution.md`](../_data/pr-resolution.md). Read `platform` from session context, then run the matching snippet via the Bash tool with `timeout: 5000`:
  - **GitHub:** `gh pr list --head "$BRANCH" --state all --json url --jq '.[0].url // empty'`
  - **Bitbucket:** the `curl` snippet in `pr-resolution.md` against `https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests?q=source.branch.name="{branch}"`, extracting `.values[0].links.html.href`.

  On non-empty output, write the URL to `pr:`. On empty output, non-zero exit, or timeout, omit the `pr:` line and emit `Note: PR lookup failed; proceeding without pr field.` in the agent text output.

- `run_id`: emit only when invoked from within an orchestrated run (detected per the [Run context](#run-context) check below).

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
