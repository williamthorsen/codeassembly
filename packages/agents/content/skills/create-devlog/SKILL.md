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
- `--run-id={id}`: Optional. Recorded in frontmatter to link the devlog to a completed orchestrated run. Typically supplied by the `wrap-up` skill; not used in direct invocations.

## Output format

The devlog file begins with YAML frontmatter conforming to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the devlog-specific extensions in [Devlog frontmatter](../_data/artifact-conventions.md#devlog-frontmatter). The body following the frontmatter has this structure:

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

- Compose tight from the start ([concision principle](../_data/concision.md)): a devlog records the lessons and outcome, not a play-by-play
- Include code snippets only for important lessons learned
- Never include lengthy code snippets
- Focus on the most important findings
- Use only sections appropriate for the task

## Saving

Resolve session context and the artifact directory before writing.

### Path resolution

1. Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `ticket_id`, `project_slug`, `artifact_base_dir`, `artifact_paths`, and `branch_name` from it.
2. If `ticket_id` is non-null: Save as a ticket-level artifact at:

   ```
   {artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/{filename}
   ```

   Filename uses the ticket-level shape: `{YYYYMMDD-HHMMSSZ}_{slug}_devlog.md`.

3. Else (no ticket — research/exploration sessions): Save to the project-scoped fallback at:

   ```
   {artifact_base_dir}/projects/{project_slug}/{artifact_paths.devlogs}/{filename}
   ```

   Filename uses the standard ticket-level shape: `{YYYYMMDD-HHMMSSZ}_{concise-title-in-kebab-case}.md`.

4. `mkdir -p` the target directory before writing.

The bundled session-context deriver returns `ticket_id: null` for branches without a recognizable ticket prefix (e.g., `experiment/foo`). Treat null as "no ticket" — never produce a path containing `tickets/null/`.

Follow [artifact conventions](../_data/artifact-conventions.md).

### Frontmatter

The devlog frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema plus the devlog-specific extensions listed in [Devlog frontmatter](../_data/artifact-conventions.md#devlog-frontmatter).

Resolve `$run_id_arg` from the `--run-id={id}` argument (empty when not supplied). Resolve the `commits` extension according to the mode:

- No argument (last commit): `commits_arg=$(git log -n 1 --format=%h)`.
- `<n>` (last N commits): `commits_arg=$(git log -n N --format=%h | paste -sd, -)`.
- `working-tree`: Do not pass `--extra-list commits=...`.

Run via Bash, substituting the resolved arguments:

```bash
{harness_home_dir}/scripts/resolve-frontmatter.sh \
  --skill create-devlog \
  --interactive true \
  --model "$MODEL_ID" \
  ${commits_arg:+--extra-list "commits=$commits_arg"} \
  --override "run_id=$run_id_arg"
```

The `${commits_arg:+--extra-list "commits=$commits_arg"}` form expands to the flag only when `$commits_arg` is non-empty, so the `working-tree` mode (where `$commits_arg` is unset) naturally omits the `commits` field rather than emitting `commits: []`. Quoting `run_id=$run_id_arg` ensures the empty-value force-omit case works when no `--run-id` was supplied.

Prepend the script's output verbatim to the artifact body. Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`.

### Filename examples

- Ticket-scoped: `20260418-153000Z_make-devlogs-ticket-scoped_devlog.md`
- Project-scoped fallback: `20250809-143000Z_fix-csp-violation-preventing-script-injection.md`
