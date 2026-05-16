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

The devlog file begins with YAML frontmatter conforming to the canonical schema (see [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the devlog-specific section, [Devlog frontmatter](../_data/artifact-conventions.md#devlog-frontmatter)) followed by the markdown body:

```markdown
---
provenance:
  skill: create-devlog
  timestamp: 2026-04-18T15:30:00Z
  baseSha: 4f8b158
  isInteractive: true
ticket_id: '426'
ticket_ref: '#426'
run_id: 20260419-012539Z
branch: 426/feat/example-branch
commit: 1d2c3b4
pr: https://github.com/williamthorsen/codeassembly/pull/591
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

   Filename uses the standard ticket-level shape: `{YYYYMMDD-HHMMSSZ}_{concise-title-in-kebab-case}.md`.

4. `mkdir -p` the target directory before writing.

`get-session-context` returns `ticket_id: null` for branches without a recognizable ticket prefix (e.g., `experiment/foo`). Treat null as "no ticket" — never produce a path containing `tickets/null/`.

Follow [artifact conventions](../_data/artifact-conventions.md).

### Frontmatter

The devlog frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema plus the devlog-specific extensions listed in [Devlog frontmatter](../_data/artifact-conventions.md#devlog-frontmatter).

<!-- include: ../../_partials/frontmatter-via-script.md -->

- `provenance.skill`: always `create-devlog`.
- `provenance.isInteractive`: always `true`.
- `run_id`: **override** the script's value. Emit only if `--run-id={id}` was supplied as an argument; the caller is the source of truth. Do not use the script's breadcrumb-derived value, and do not perform any filesystem discovery.
- `commits` (devlog-specific extension; distinct from the universal `commit` field):
  - No argument (last commit): single short SHA from `git log -n 1 --format=%h`.
  - `<n>` (last N commits): list of N short SHAs from `git log -n {N} --format=%h`.
  - `working-tree`: omit the `commits` field entirely.
  <!-- /include -->

### Filename examples

- Ticket-scoped: `20260418-153000Z_make-devlogs-ticket-scoped_devlog.md`
- Project-scoped fallback: `20250809-143000Z_fix-csp-violation-preventing-script-injection.md`
