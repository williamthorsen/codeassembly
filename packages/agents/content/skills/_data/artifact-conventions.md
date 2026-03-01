# Artifact conventions

Standards for AI-generated artifact storage, naming, and lifecycle.

## Directory structure

All artifacts live under a configurable base directory (`base_dir`, default `~/.ai`):

```
{base_dir}/
└── projects/
    └── {project-slug}/
        ├── tickets/
        │   └── {ticket-id}/
        │       ├── {timestamp}_{slug}_{artifact-type}.md    ← ticket-level artifacts
        │       └── {run-id}/                                 ← review run directory
        │           ├── {timestamp}_{role}_{artifact}.md
        │           └── ...
        ├── chats/
        │   └── {timestamp}_{descriptive-title}.md
        ├── devlogs/
        │   └── {timestamp}_{concise-title}.md
        └── plans/
            └── {design-documents}.md
```

### Project slug

Always present under `projects/`, even when `.ai/` is inside the project. Constant structure enables simple directory sync for export (`.ai/projects/` ↔ `~/.ai/projects/`). Use `get-project-slug` to obtain.

### Ticket ID

Always present under `tickets/` within the project directory. If no real ticket exists, auto-generate: `{YYYYMMDD-HHMM}Z-{4 random alphanumeric}` (e.g., `20260221-2359Z-a3f2`).

### Run directories

Run directories group artifacts from a review workflow cycle:

```
projects/{project-slug}/tickets/{ticket-id}/{run-id}/
  {timestamp}_{role}_{artifact}.md
```

**Run ID format:** `{timestamp}-{mode}`

- **timestamp:** UTC, `YYYYMMDD-HHMMSSZ` — from the first artifact in the run
- **mode:** `interactive` or `orchestrated` — reflects how the run was _initiated_ (immutable at creation)

Examples: `20260221-034100Z-interactive`, `20260221-090000Z-orchestrated`

Multiple runs per ticket (restarts, separate review cycles) each get their own run directory. Created by the first artifact in a run.

### Persistent export destination

Artifacts under `{base_dir}/` are ephemeral when `base_dir` is a git-ignored path (the default). In worktrees, they are lost on deletion. The `export-ai-artifacts.sh` script copies them to `~/.ai/projects/{project-slug}/` for long-term retention, preserving the same directory structure. Exported artifacts are immutable (first export wins).

## Path resolution

Skills resolve artifact directories using this algorithm:

1. Read `artifacts.base_dir` from `.agents/preferences.yaml`
2. If not found there, read from `~/.agents/preferences.yaml`
3. If still not found, use default: `base_dir` = `~/.ai`
4. If `base_dir` is relative, resolve from project root (`git rev-parse --show-toplevel`). If absolute, use as-is.
5. Use `get-project-slug` for the project slug.

### Ticket-scoped paths

```
{base_dir}/projects/{project-slug}/tickets/{ticket-id}/
```

Ticket-level artifacts and run directories both live here. Use `get-ticket-id` for the ticket ID.

### Run paths

```
{base_dir}/projects/{project-slug}/tickets/{ticket-id}/{run-id}/
```

### Non-ticket paths

| Category | Default path | Full default                                  |
| -------- | ------------ | --------------------------------------------- |
| chats    | `chats`      | `{base_dir}/projects/{project-slug}/chats/`   |
| devlogs  | `devlogs`    | `{base_dir}/projects/{project-slug}/devlogs/` |
| plans    | `plans`      | `{base_dir}/projects/{project-slug}/plans/`   |

Non-ticket paths are relative to the project directory. Category names remain configurable via `artifacts.paths.{category}` in preferences.yaml.

## Naming conventions

### Ticket-level artifacts

```
{timestamp}_{slug}_{artifact-type}.md
```

- **timestamp**: UTC, `YYYYMMDD-HHMMSSZ` format (e.g., `20260219-143000Z`)
- **slug**: Kebab-case descriptor drawn from work context — e.g., branch description (`improve-artifact-naming`) or commit subject (`fix-login-validation`). Max 60 chars, filesystem-safe.
- **artifact-type**: One of the registered types (see below)

### Run artifacts (review workflow)

```
{timestamp}_{role}_{artifact}.md
```

- **timestamp**: UTC, `YYYYMMDD-HHMMSSZ` format
- **role**: `architect`, `coder`, `code-reviewer`, `code-simplifier`, `orchestrator`, `planner`, `reviewer`, `silent-failure-reviewer`, `test-reviewer` (extensible — this is a common roles list, not exhaustive)
- **artifact**: What the document is — `architecture`, `change-summary`, `code-review`, `code-simplifier-review`, `orchestration-plan`, `plan`, `review`, `run-manifest`, `run-summary`, `silent-failure-review`, `test-review`

Underscore separates all structural parts. Hyphens are free for use within any part (role names, artifact names, slugs).

Each role has a **roleType** classifying its workflow function. See the [roleType taxonomy](#roletype-taxonomy) in the run-index.json section below.

The first artifact's timestamp matches the run directory timestamp. This intentional redundancy makes files independently interpretable if moved or referenced from elsewhere.

Example run directory (full orchestrated run with iterative review):

```
.ai/projects/williamthorsen-configs-macos/tickets/MAC-68/20260221-034100Z-orchestrated/
  run-index.json
  20260221-034100Z_orchestrator_run-manifest.md                      # initialization
  20260221-034200Z_architect_architecture.md                         # Phase 1: architecture
  20260221-034300Z_planner_orchestration-plan.md                     # Phase 2: planning
  20260221-034300Z_planner_orchestration-plan.json                   # Phase 2: planning (JSON)
  20260221-034500Z_coder_change-summary.md                           # Phase 3: implementation
  20260221-034700Z_reviewer_review.md                                # Phase 4: parallel review (iteration 1)
  20260221-034700Z_silent-failure-reviewer_silent-failure-review.md   # Phase 4: parallel review (iteration 1)
  20260221-034700Z_test-reviewer_test-review.md                      # Phase 4: parallel review (iteration 1)
  20260221-034700Z_code-reviewer_code-review.md                      # Phase 4: parallel review (iteration 1)
  20260221-040000Z_coder_change-summary.md                           # Phase 4: coder fix cycle
  20260221-041000Z_reviewer_review.md                                # Phase 4: selective re-review (iteration 2)
  20260221-041000Z_code-reviewer_code-review.md                      # Phase 4: selective re-review (iteration 2)
  20260221-042000Z_code-simplifier_code-simplifier-review.md         # Phase 4a: code simplifier
  20260221-042200Z_coder_change-summary.md                           # Phase 4a: coder fix cycle
  20260221-042500Z_reviewer_holistic-review.md                       # Phase 4b: holistic review
  20260221-043000Z_orchestrator_run-summary.md                       # Phase 5: summary
```

## run-index.json

Machine-readable metadata for orchestrated runs. Written and maintained exclusively by the orchestrator. Individual skills do not write to this file directly.

### Schema

**Initial write** (at run start):

```json
{
  "version": 2,
  "context": {
    "runId": "20260221-034100Z-orchestrated",
    "projectSlug": "williamthorsen-configs-macos",
    "ticketId": "MAC-68",
    "projectRoot": "/Users/william/repos/configs/macos",
    "branch": "mac-68/feat/improve-artifact-naming",
    "task": "Implement artifact naming improvements",
    "startedAt": "2026-02-21T03:41:00Z",
    "completedAt": null,
    "status": "in_progress",
    "phases": {},
    "phaseDecisions": {}
  },
  "config": {
    "pipeline": ["architecture", "planning", "implementation", "review-cycle"],
    "externalPlan": false,
    "mergeBaseSha": "abc1234",
    "diffBase": "main",
    "maxReviewRounds": 3,
    "fixLowFindings": true,
    "mode": "orchestrated",
    "model": "claude-opus-4-6"
  },
  "artifacts": []
}
```

**Final state** (at run completion):

```json
{
  "version": 2,
  "context": {
    "runId": "20260221-034100Z-orchestrated",
    "projectSlug": "williamthorsen-configs-macos",
    "ticketId": "MAC-68",
    "projectRoot": "/Users/william/repos/configs/macos",
    "branch": "mac-68/feat/improve-artifact-naming",
    "task": "Implement artifact naming improvements",
    "startedAt": "2026-02-21T03:41:00Z",
    "completedAt": "2026-02-21T04:16:00Z",
    "status": "completed",
    "phaseDecisions": {
      "architecture": { "run": true, "disposition": "executed", "reason": "External plan requires validation" },
      "planning": { "run": true, "disposition": "executed", "reason": "External plan present" },
      "implementation": { "run": true, "disposition": "executed" },
      "review-cycle": { "run": true, "disposition": "executed" },
      "parallelReview": { "run": true, "disposition": "executed" },
      "codeSimplifier": { "run": true, "disposition": "executed" },
      "holisticReview": { "run": true, "disposition": "executed" }
    },
    "phases": {
      "architecture": {
        "status": "completed",
        "impactLevel": "moderate",
        "startedAt": "2026-02-21T03:41:30Z",
        "completedAt": "2026-02-21T03:42:00Z"
      },
      "planning": {
        "status": "completed",
        "stepCount": 5,
        "startedAt": "2026-02-21T03:42:10Z",
        "completedAt": "2026-02-21T03:43:00Z"
      },
      "implementation": {
        "status": "completed",
        "startedAt": "2026-02-21T03:43:10Z",
        "completedAt": "2026-02-21T03:45:00Z"
      },
      "parallelReview": {
        "status": "completed",
        "startedAt": "2026-02-21T03:45:10Z",
        "completedAt": "2026-02-21T04:10:00Z",
        "aggregatedCriticality": "medium",
        "reviewers": {
          "reviewer": {
            "status": "completed",
            "criticality": "medium",
            "reReviewCriticality": "low",
            "startedAt": "2026-02-21T03:45:10Z",
            "completedAt": "2026-02-21T03:47:00Z"
          },
          "silent-failure-reviewer": {
            "status": "completed",
            "criticality": "low",
            "startedAt": "2026-02-21T03:45:10Z",
            "completedAt": "2026-02-21T03:47:00Z"
          },
          "test-reviewer": { "status": "skipped", "reason": "no source or test files changed" },
          "code-reviewer": {
            "status": "completed",
            "criticality": "medium",
            "reReviewCriticality": "none",
            "startedAt": "2026-02-21T03:45:10Z",
            "completedAt": "2026-02-21T03:47:00Z"
          }
        },
        "coderFixCycleRan": true,
        "selectiveReReview": {
          "ran": true,
          "reviewersDispatched": ["reviewer", "code-reviewer"],
          "additionalFixCycleRan": false
        },
        "iterations": [
          {
            "reviewers": ["reviewer", "silent-failure-reviewer", "code-reviewer"],
            "dispatchedAt": "2026-02-21T03:45:10Z",
            "reviewsCompletedAt": "2026-02-21T03:47:00Z",
            "coderFixStartedAt": "2026-02-21T03:47:30Z",
            "coderFixCompletedAt": "2026-02-21T04:00:00Z"
          },
          {
            "reviewers": ["reviewer", "code-reviewer"],
            "dispatchedAt": "2026-02-21T04:00:30Z",
            "reviewsCompletedAt": "2026-02-21T04:10:00Z"
          }
        ]
      },
      "codeSimplifier": {
        "ran": true,
        "actionableFindings": true,
        "coderFixCycleRan": true,
        "startedAt": "2026-02-21T04:10:10Z",
        "completedAt": "2026-02-21T04:12:00Z"
      },
      "holisticReview": {
        "status": "completed",
        "criticality": "none",
        "startedAt": "2026-02-21T04:12:10Z",
        "completedAt": "2026-02-21T04:15:00Z"
      }
    }
  },
  "config": {
    "pipeline": ["architecture", "planning", "implementation", "review-cycle"],
    "externalPlan": false,
    "mergeBaseSha": "abc1234",
    "diffBase": "main",
    "maxReviewRounds": 3,
    "fixLowFindings": true,
    "mode": "orchestrated",
    "model": "claude-opus-4-6"
  },
  "artifacts": [
    {
      "filename": "20260221-034100Z_orchestrator_run-manifest.md",
      "role": "orchestrator",
      "roleType": "orchestrator",
      "agent": "orchestrator",
      "type": "run-manifest",
      "phase": "initialization",
      "createdAt": "2026-02-21T03:41:00Z"
    },
    {
      "filename": "20260221-034200Z_architect_architecture.md",
      "role": "architect",
      "roleType": "analyst",
      "agent": "orchestrated-architect",
      "type": "architecture",
      "phase": "architecture",
      "createdAt": "2026-02-21T03:42:00Z"
    },
    {
      "filename": "20260221-034300Z_planner_orchestration-plan.md",
      "role": "planner",
      "roleType": "planner",
      "agent": "orchestrated-planner",
      "type": "orchestration-plan",
      "phase": "planning",
      "createdAt": "2026-02-21T03:43:00Z"
    },
    {
      "filename": "20260221-034500Z_coder_change-summary.md",
      "role": "coder",
      "roleType": "author",
      "agent": "orchestrated-coder",
      "type": "change-summary",
      "phase": "implementation",
      "createdAt": "2026-02-21T03:45:00Z"
    },
    {
      "filename": "20260221-034700Z_reviewer_review.md",
      "role": "reviewer",
      "roleType": "reviewer",
      "agent": "orchestrated-reviewer",
      "type": "review",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T03:47:00Z",
      "iteration": 1
    },
    {
      "filename": "20260221-034700Z_silent-failure-reviewer_silent-failure-review.md",
      "role": "silent-failure-reviewer",
      "roleType": "reviewer",
      "agent": "aspect-silent-failure-reviewer",
      "type": "silent-failure-review",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T03:47:00Z",
      "iteration": 1
    },
    {
      "filename": "20260221-034700Z_code-reviewer_code-review.md",
      "role": "code-reviewer",
      "roleType": "reviewer",
      "agent": "aspect-code-reviewer",
      "type": "code-review",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T03:47:00Z",
      "iteration": 1
    },
    {
      "filename": "20260221-040000Z_coder_change-summary.md",
      "role": "coder",
      "roleType": "author",
      "agent": "orchestrated-coder",
      "type": "change-summary",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T04:00:00Z",
      "note": "Addresses aggregated findings from iteration 1"
    },
    {
      "filename": "20260221-041500Z_reviewer_review.md",
      "role": "reviewer",
      "roleType": "reviewer",
      "agent": "orchestrated-reviewer",
      "type": "review",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T04:15:00Z",
      "iteration": 2
    },
    {
      "filename": "20260221-041600Z_orchestrator_run-summary.md",
      "role": "orchestrator",
      "roleType": "orchestrator",
      "agent": "orchestrator",
      "type": "run-summary",
      "phase": "summary",
      "createdAt": "2026-02-21T04:16:00Z"
    }
  ]
}
```

### Incremental write pattern

The `parallelReview` entry is first written with `status: "in_progress"` before reviewers are dispatched, then updated at each state transition (batch completion, coder fix dispatch/completion, re-review dispatch/completion, phase completion). The `iterations` array captures per-iteration data: which reviewers were dispatched, when reviews completed, and when coder fix cycles ran. Per-reviewer `startedAt`/`completedAt` timestamps track individual agent execution.

The same pattern applies to all phases: `architecture`, `planning`, `implementation`, `codeSimplifier`, and `holisticReview` are each written with `status: "in_progress"` and `startedAt` before the agent is dispatched, then updated with `status: "completed"` (or `"failed"`) and `completedAt` after the agent completes. The `startedAt` and `completedAt` fields are optional on all phase objects.

**Backward compatibility:** Old `run-index.json` data without top-level `status` fields on phase objects (e.g., `parallelReview` without a `status` field) is treated as completed by the factory visualization. The factory only blocks advancement past a phase when `status` is explicitly `"in_progress"`.

### roleType taxonomy

Each role maps to one of five workflow-function types:

| roleType       | Description                                         | Example roles                                                                              |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `orchestrator` | Coordinates phases and manages run state            | `orchestrator`                                                                             |
| `analyst`      | Assesses impact and provides architectural guidance | `architect`                                                                                |
| `planner`      | Produces implementation plans                       | `planner`                                                                                  |
| `author`       | Writes or modifies project code                     | `coder`                                                                                    |
| `reviewer`     | Evaluates code and produces findings                | `reviewer`, `code-reviewer`, `code-simplifier`, `silent-failure-reviewer`, `test-reviewer` |

### Artifact entry fields

| Field       | Required | Description                                                                             |
| ----------- | -------- | --------------------------------------------------------------------------------------- |
| `filename`  | yes      | Artifact filename (without directory path)                                              |
| `role`      | yes      | Filename role segment (e.g., `reviewer`, `code-reviewer`)                               |
| `roleType`  | yes      | Workflow function (one of: `orchestrator`, `analyst`, `planner`, `author`, `reviewer`)  |
| `agent`     | yes      | Task tool `subagent_type` value (e.g., `orchestrated-reviewer`, `aspect-code-reviewer`) |
| `type`      | yes      | Artifact type (e.g., `review`, `change-summary`)                                        |
| `phase`     | yes      | Phase that produced this artifact (camelCase, matches `phases` object keys)             |
| `createdAt` | yes      | ISO 8601 timestamp                                                                      |
| `iteration` | no       | Review iteration number (for `parallelReview` phase)                                    |
| `note`      | no       | Free-text context about the artifact                                                    |

### Phase values

Phase values use camelCase and match the keys in the `phases` object:

- `initialization` — run setup and manifest creation
- `architecture` — architectural impact assessment
- `planning` — implementation planning
- `implementation` — code authoring
- `parallelReview` — parallel review and fix cycles
- `codeSimplifier` — code simplification pass
- `holisticReview` — final comprehensive review
- `summary` — run summary generation

### Version field

The `version` field (value: `2`) enables schema detection. Absent version implies v1 (`status.json` era). Future schema changes will increment this value.

## Artifact types

### Run artifacts (in run directories)

| Artifact                 | Purpose                                                   | Dispositions?                          |
| ------------------------ | --------------------------------------------------------- | -------------------------------------- |
| `architecture`           | Architectural impact assessment and integration guidance  | No                                     |
| `change-summary`         | What changed + dispositions on prior findings (if any)    | Yes, when responding to a prior review |
| `code-review`            | Aspect review: CLAUDE.md compliance, bugs, logic errors   | No                                     |
| `code-simplifier-review` | Aspect review: simplification opportunities and dead code | No                                     |
| `holistic-review`        | Holistic review after iterative convergence               | Only for own prior findings            |
| `orchestration-plan`     | Structured orchestration steps (.md and .json variants)   | No                                     |
| `plan`                   | Implementation plan document                              | No                                     |
| `review`                 | Code review findings + dispositions on own prior findings | Only for own prior findings            |
| `run-manifest`           | Immutable record of run initial conditions                | No                                     |
| `run-summary`            | Final summary of the orchestrated run                     | No                                     |
| `silent-failure-review`  | Aspect review: error handling and silent failure analysis | No                                     |
| `test-review`            | Aspect review: test coverage quality and behavioral gaps  | No                                     |

The first `coder_change-summary` in a run has no dispositions (nothing to respond to). Subsequent ones embed dispositions alongside the change summary.

### Ticket-level artifacts

- `change-summary` — Branch change summary for PRs
- `orchestration-plan` — Orchestration plan (`orchestration-plan.json` is a **mutable** artifact overwritten each planning iteration; `{timestamp}_planner_orchestration-plan.md` files are versioned human-readable snapshots)
- `plan` — Implementation plan document
- `pull-request` — PR description file
- `review` — Code review (ticket-level, commit scope)
- `ticket` — Issue ticket

### Non-ticket artifacts

- `devlog` — Development log entry
- `chat-summary` — Conversation summary

## Run lifecycle

### Starting a run

Orchestrated runs begin with `orchestrator_run-manifest` as the first artifact, recording the run's initial conditions. Interactive runs allow either role to produce the first artifact. Common patterns:

- Orchestrated: orchestrator produces `orchestrator_run-manifest`, then coder produces `coder_change-summary`
- Interactive: coder produces `coder_change-summary`, then reviewer produces `reviewer_review`
- Interactive: reviewer produces `reviewer_review` directly (human is the coder)

### Iteration pattern

1. `reviewer_review` contains findings
2. `coder_change-summary` contains fixes + dispositions on prior findings
3. `reviewer_review` reads all prior artifacts chronologically — dispositions are embedded in the documents that contain them

### Termination

Run ends when no party has further actionable input. The last artifact can be from any role. In orchestrated runs, the orchestrator writes `orchestrator_run-summary` as the final artifact.

### Stacking

Multiple reviews can arrive in the same iteration (e.g., `reviewer_review` + `overseer_review`). The next `coder_change-summary` addresses all of them.

## Disposition rules

### Embedding

Dispositions live in the document produced by the responding role. No separate disposition artifact.

### Scope

A role can only disposition findings directed at it or its own prior findings. The overseer is exempt (arbiter authority).

| Role     | Can disposition                                              | Cannot disposition                                       |
| -------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Coder    | Reviewer/overseer findings on the code                       | Own changes (self-review)                                |
| Reviewer | Own prior findings (revise/withdraw in light of new context) | Coder rejections (re-raise as escalated finding instead) |
| Overseer | Any finding (arbiter authority)                              | —                                                        |

## Finding scheme (F/W/T/R/S/L)

Used by review-producing skills and agents for structured code review findings. Every finding (F/W/T/R/S) must include a concrete action the author can take. Non-actionable observations belong in prose sections (e.g., Technical Assessment), not in numbered findings.

| ID     | Category       | Severity       | Merge-blocking?                                                    |
| ------ | -------------- | -------------- | ------------------------------------------------------------------ |
| `F{n}` | FIXME          | critical       | Yes — must fix before merge                                        |
| `W{n}` | Warning        | warning        | May block — questionable decisions requiring justification         |
| `T{n}` | TODO           | todo           | No — should fix, can wait for next PR                              |
| `R{n}` | Recommendation | recommendation | No — advisable but discretionary                                   |
| `S{n}` | Suggestion     | suggestion     | No — optional improvement                                          |
| `L{n}` | Legacy         | legacy         | No — observation in pre-existing code, not authored in this branch |

### Category criteria

**FIXME (F)** — must fix before merge:

- Bugs: incorrect logic, unhandled error paths, data loss risks
- Security: injection, auth bypass, exposed secrets
- Contract violations: breaking API changes, type unsafety
- Test failures: tests that don't pass or don't test what they claim

**Warning (W)** — questionable, may block merge:

- Missing edge case handling that could cause runtime errors
- Convention violations that affect maintainability
- Decisions that seem wrong but may be intentional (require justification)

**TODO (T)** — should fix, not in this PR:

- Missing or inadequate tests for new functionality
- Performance issues with measurable impact
- Incomplete error handling that won't cause immediate failures

**Recommendation (R)** — advisable but discretionary:

- Better patterns available in the codebase
- Opportunities to reduce complexity
- Architectural improvements worth considering

**Suggestion (S)** — optional improvement:

- Better naming or code organization
- Additional test cases for edge cases
- Documentation improvements

**Legacy (L)** — pre-existing code observation:

- Issues in code not authored in this branch
- Frame as future opportunities, not current defects
- Never count against the review score

### Overall criticality mapping

| Findings present                   | Criticality | Meaning                                      |
| ---------------------------------- | ----------- | -------------------------------------------- |
| None, or only S/R/L                | `none`      | Ready to merge                               |
| W and/or T, but no F               | `low`       | Acceptable to merge with optional follow-ups |
| 1–2 F (straightforward), or many W | `medium`    | Needs fixes but approach is sound            |
| Multiple F, or structural issues   | `high`      | Needs significant rework                     |

### Re-review severity escalation

`S → R → T → W → F`. L findings are never escalated.

## Artifact lifecycle

- **Active**: artifact is current and relevant
- **Stale**: branch has been merged or deleted, and artifact is 30+ days old

## Portability

Every level degrades gracefully:

- Missing project `.agents/preferences.yaml` → fall back to global `~/.agents/preferences.yaml`
- Missing global preferences → fall back to hardcoded default (`~/.ai`)
- Missing `~/.ai/` directory → created automatically on first artifact save
- Missing `get-project-slug` result → derive from git remote or directory name

## Migration from status.json (v1) to run-index.json (v2)

### File rename

`status.json` → `run-index.json`. The new name reflects the file's expanded role as an artifact registry, not just a status tracker.

### Schema changes

- **New `version` field** (value: `2`). Enables schema detection; absent version = v1.
- **`context` section** groups: `runId`, `projectSlug`, `ticketId`, `projectRoot`, `branch`, `task`, `startedAt`, `completedAt`, `status`, `phases`, `phaseDecisions`.
- **`config` section** groups: `externalPlan`, `mergeBaseSha` (new), `diffBase` (new), `maxReviewRounds` (new), `fixLowFindings` (new), `mode`, `model`.
- **`phaseDecision` → `context.phaseDecisions`** (now keyed by phase name, each value is a `{ run, reason? }` object). Each entry now includes an optional `disposition` field (`executed` | `skipped` | `absent`).
- **New `pipeline` field in `config`**. Ordered list of phase names from the wrapper skill's pipeline specification (e.g., `["architecture", "planning", "implementation", "review-cycle"]`). Records which phases were configured for the run (intent, not outcome). The `review-cycle` pipeline entry is a module that expands into sub-phase keys (`parallelReview`, `codeSimplifier`, `holisticReview`) in `context.phaseDecisions` and `context.phases` at runtime.
- **New `artifacts` array**. Each entry includes `roleType` for workflow-function classification. See [artifact entry fields](#artifact-entry-fields) for the full schema.

### Role and reviewer renames

Reviewer keys in `context.phases.parallelReview.reviewers`:

| v1 key                  | v2 key                    |
| ----------------------- | ------------------------- |
| `core`                  | `reviewer`                |
| `aspect-silent-failure` | `silent-failure-reviewer` |
| `aspect-test`           | `test-reviewer`           |
| `aspect-code`           | `code-reviewer`           |

Role segments in artifact filenames:

| v1 role  | v2 role                   |
| -------- | ------------------------- |
| `aspect` | `silent-failure-reviewer` |
| `aspect` | `test-reviewer`           |
| `aspect` | `code-reviewer`           |
| `aspect` | `code-simplifier`         |

### Timestamp format

All timestamps (run IDs and artifact filenames): `YYYYMMDD-HHMMZ` → `YYYYMMDD-HHMMSSZ` (adds seconds).

### Known consumers (codeassembly)

The following codeassembly files reference the run metadata schema and will need updates:

- `project-scanner.ts` — filename patterns for artifact discovery
- `status-adapter.ts` — schema parsing and normalization
- `runs.ts` — artifact filtering and run enumeration
- `canonical.ts` — type definitions

### Backward compatibility

During the transition period, scanners should check for both `run-index.json` and `status.json`. The presence of a `version` field distinguishes v2 from v1.
