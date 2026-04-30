---
name: save-artifact
description: Save AI-generated artifacts with standardized naming and organization
user-invocable: false
---

# Save artifact

Save AI-generated files with standardized naming conventions.

## Filename formats

### Ticket-level artifacts

```text
{timestamp}_{slug}_{artifact-type}.md
```

- **timestamp**: UTC time in `YYYYMMDD-HHMMSSZ` format
- **slug**: Kebab-case descriptor drawn from work context — e.g., branch description (`improve-artifact-naming`) or commit subject (`fix-login-validation`). Max 60 chars, filesystem-safe.
- **artifact-type**: Type of artifact (see below)

### Run artifacts (review workflow)

**Interactive runs:**

```text
{timestamp}_{role}_{artifact}.md
```

- **timestamp**: UTC time in `YYYYMMDD-HHMMSSZ` format

**Orchestrated runs:**

```text
{NN}_{role}_{artifact}.md
```

- **{NN}**: Two-digit zero-padded sequence number reflecting artifact creation order within the run (e.g., `01`, `02`, ... `99`). The sequence counter is managed exclusively by the orchestrate engine — individual skills do not manage sequence numbers in orchestrated runs.

**Common fields (both formats):**

- **role**: Kebab-case identifier; hyphens are free within the name, underscores are reserved as structural separators. Each role has a `roleType` (one of: `orchestrator`, `analyst`, `planner`, `author`, `reviewer`). See [artifact-conventions.md](../_data/artifact-conventions.md#run-artifacts-review-workflow) for the current role list and [roleType taxonomy](../_data/artifact-conventions.md#roletype-taxonomy).
- **artifact**: Kebab-case identifier following the same naming conventions. See [artifact-conventions.md](../_data/artifact-conventions.md#artifact-types) for the complete artifact type list.

Run artifacts are saved by the skills that produce them (`review-change`, `respond-to-review`). They handle run directory discovery and creation.

> **Note:** In orchestrated runs, the orchestrator is responsible for maintaining `run-index.json` — individual skills do not write to it directly.

## Artifact types

### Ticket-level

- `change-summary` — Branch change summary for PRs
- `devlog` — Development log entry (ticket-scoped when a ticket is in session; falls back to project-scoped `devlogs/` otherwise)
- `orchestration-plan` — Orchestration plan for the orchestrate engine
- `plan` — Implementation plan document
- `plan-review` — Plan review findings (completeness and correctness analysis)
- `plan-v2` — Refined implementation plan after review and revision
- `pull-request` — PR description file
- `review` — Code review (ticket-level, commit scope)
- `ticket` — Issue ticket
- `deferred-findings` — Record of findings deferred during a `/wrap-up` session, with cross-references to any tickets created (ticket-scoped when a ticket is in session; falls back to project-scoped `deferred-findings/` otherwise)

### Run artifacts

- `run-manifest` — Immutable record of run initial conditions
- `change-summary` — What changed + dispositions on prior findings
- `orchestration-plan` — Structured orchestration steps
- `plan` — Implementation plan document
- `review` — Code review findings + dispositions on own prior findings
- `holistic-review` — Holistic review after iterative convergence
- `run-summary` — Final summary of the orchestrated run

### Non-ticket

- `chat-summary` — Conversation summary

## Path resolution

Resolve the artifact directory before saving. Use `get-session-context` to obtain `artifact_base_dir`, `project_slug`, and `ticket_id`.

### Ticket-scoped path

```
{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/
```

Create the directory if needed.

### Non-ticket paths

Read `artifact_paths` from the `get-session-context` manifest for category paths (chats, devlogs, plans). These are relative to the project directory: `{artifact_base_dir}/projects/{project_slug}/{category}/`.

Devlogs and deferred-findings artifacts use their non-ticket category paths only as a fallback — when a ticket is in session context they are written as ticket-level artifacts under `tickets/{ticket_id}/` instead. See [artifact conventions](../_data/artifact-conventions.md#non-ticket-paths) for the dual-homing rule. For frontmatter shapes, see `create-devlog/SKILL.md` (devlogs) and the deferred-findings step in `wrap-up/SKILL.md` (deferred-findings).

Follow [artifact conventions](../_data/artifact-conventions.md).

## Slug generation

Create a filesystem-safe slug (for ticket-level artifacts only):

1. If explicit title provided, use it (convert to kebab-case)
2. Extract descriptive part from branch name after ticket ID
3. Analyze recent commits for work theme
4. Generate concise description

Format requirements:

- Kebab-case (lowercase, hyphens)
- Maximum 60 characters
- Filesystem-safe characters only
- No leading/trailing hyphens
