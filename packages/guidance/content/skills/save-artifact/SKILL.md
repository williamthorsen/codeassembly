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
- **slug**: Kebab-case descriptor of the change. See [artifact-conventions.md](../_data/artifact-conventions.md#naming-conventions) for what it is drawn from and the length bound, and [Slug generation](#slug-generation) below for how to produce one.
- **artifact-type**: Type of artifact. See [artifact-conventions.md](../_data/artifact-conventions.md#artifact-types) for the artifact type list.

### Run directories (review workflow)

```text
{timestamp}_{role}_{artifact}.md
```

- **timestamp**: UTC time in `YYYYMMDD-HHMMSSZ` format
- **role**: Kebab-case identifier; hyphens are free within the name, underscores are reserved as structural separators. Each role has a `roleType`. See [artifact-conventions.md](../_data/artifact-conventions.md#run-artifacts-review-workflow) for the current role list and [roleType taxonomy](../_data/artifact-conventions.md#roletype-taxonomy).
- **artifact**: Kebab-case identifier following the same naming conventions. See [artifact-conventions.md](../_data/artifact-conventions.md#artifact-types) for the artifact type list.

Run artifacts are saved by the skills that produce them (`review-branch`, `respond-to-review`). They handle run directory discovery and creation.

> **Note:** `review-branch` reads a run directory's `run-index.json` to decide whether the run is still active for the current branch; neither skill writes the file.

## Path resolution

Resolve the artifact directory before saving. Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `artifact_base_dir`, `project_slug`, and `ticket_id` from the manifest JSON emitted on stdout.

### Ticket-scoped path

```
{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/
```

Create the directory if needed.

### Non-ticket paths

Read `artifact_paths` from the session-context manifest for category paths (chats, devlogs, plans). These are relative to the project directory: `{artifact_base_dir}/projects/{project_slug}/{category}/`.

Devlogs and deferred-findings artifacts use their non-ticket category paths only as a fallback: When a ticket is in session context they are written as ticket-level artifacts under `tickets/{ticket_id}/` instead. See [artifact conventions](../_data/artifact-conventions.md#non-ticket-paths) for the dual-homing rule. For frontmatter shapes, see `create-devlog/SKILL.md` (devlogs) and the deferred-findings step in `wrap-up/SKILL.md` (deferred-findings).

Follow [artifact conventions](../_data/artifact-conventions.md).

## Slug generation

Create a filesystem-safe slug (for ticket-level artifacts only):

1. Reuse the slug of the artifacts already in the ticket directory for this change, if any are there, unless the change's descriptor has moved
2. If explicit title provided, use it (convert to kebab-case)
3. Extract descriptive part from branch name after ticket ID
4. Analyze recent commits for work theme
5. Generate concise description

Format requirements, within the length bound set by [artifact-conventions.md](../_data/artifact-conventions.md#naming-conventions):

- Kebab-case (lowercase, hyphens)
- Filesystem-safe characters only
- No leading/trailing hyphens
