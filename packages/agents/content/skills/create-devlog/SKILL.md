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
- `--run-id={id}`: Optional. Recorded in frontmatter to link the devlog to a completed orchestrated run. Typically supplied by `/wrap-up`; not used in direct invocations.

## Output format

The devlog file begins with YAML frontmatter (see [Frontmatter](#frontmatter) below) followed by the markdown body:

```markdown
---
provenance:
  skill: create-devlog
  timestamp: 2026-04-18T15:30:00Z
  baseSha: 4f8b158
  isInteractive: true
ticket_id: '426'
run_id: 20260419-012539Z
branch: 426
commits: [a1b2c3d, e4f5g6h]
---

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

Resolve session context and the artifact directory before writing.

### Path resolution

1. Call `get-session-context` to obtain `ticket_id`, `project_slug`, `artifact_base_dir`, `artifact_paths`, and `branch_name`.
2. If `ticket_id` is non-null: save as a ticket-level artifact at:

   ```
   {artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/{filename}
   ```

   Filename uses the ticket-level shape: `{YYYYMMDD-HHMMSSZ}_{slug}_devlog.md`.

3. Else (no ticket — research/exploration sessions): save to the project-scoped fallback at:

   ```
   {artifact_base_dir}/projects/{project_slug}/{artifact_paths.devlogs}/{filename}
   ```

   Filename uses the existing project-scoped shape: `{YYYYMMDD-HHMMZ}_{concise-title-in-kebab-case}.md`.

4. `mkdir -p` the target directory before writing.

`get-session-context` returns `ticket_id: null` for branches without a recognizable ticket prefix (e.g., `experiment/foo`). Treat null as "no ticket" — never produce a path containing `tickets/null/`.

Follow [artifact conventions](../_data/artifact-conventions.md).

### Frontmatter

Prepend YAML frontmatter to every newly created devlog. The shape mirrors `save-plan`'s provenance block so a single parser handles both artifact types. See [Devlog frontmatter](../_data/artifact-conventions.md#devlog-frontmatter) for the full field reference.

Generation rules:

- **`provenance` block** — always emitted.
  - `skill`: always `create-devlog`.
  - `timestamp`: current UTC time in ISO 8601 format.
  - `baseSha`: run `git rev-parse --short origin/main`. Omit the field if the command fails (no remote, shallow clone). Mirrors `save-plan` behavior.
  - `isInteractive`: always `true`.
- **`branch`** — always emitted, taken from `branch_name` in session context.
- **`ticket_id`** — emit only if non-null in session context. Omit otherwise.
- **`run_id`** — emit only if `--run-id={id}` was supplied as an argument. Do not perform any filesystem discovery to find a run directory; the caller is the source of truth.
- **`commits`** — derived from the invocation argument:
  - No argument (last commit): single short SHA from `git log -n 1 --format=%h`.
  - `<n>` (last N commits): list of N short SHAs from `git log -n {N} --format=%h`.
  - `working-tree`: omit the `commits` field entirely.

### Filename examples

- Ticket-scoped: `20260418-153000Z_make-devlogs-ticket-scoped_devlog.md`
- Project-scoped fallback: `20250809-1430Z_fix-csp-violation-preventing-script-injection.md`
