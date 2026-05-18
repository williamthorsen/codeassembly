# Artifact conventions

Standards for AI-generated artifact storage, naming, and lifecycle.

## Directory structure

All artifacts live under a configurable base directory (`base_dir`, default `~/ai-artifacts`). Use `get-session-context` to resolve `artifact_base_dir`:

```
{base_dir}/
└── projects/
    └── {project-slug}/
        ├── tickets/
        │   └── {ticket-id}/
        │       ├── {timestamp}_{slug}_{artifact-type}.md    ← ticket-level artifacts (devlogs land here when a ticket is in session)
        │       └── {run-id}/                                 ← review run directory
        │           ├── {NN}_{role}_{artifact}.md
        │           └── ...
        ├── chats/
        │   └── {timestamp}_{descriptive-title}.md
        ├── deferred-findings/
        │   └── {timestamp}_{slug}_deferred-findings.md      ← project-scoped fallback when no ticket is in session
        ├── devlogs/
        │   └── {timestamp}_{concise-title}.md               ← project-scoped fallback when no ticket is in session
        └── plans/
            └── {design-documents}.md
```

### Project slug

Always present under `projects/`, even when `{base_dir}/` is inside the project. Constant structure enables simple directory sync for export. Use `get-session-context` to obtain `project_slug`.

### Ticket ID

Always present under `tickets/` within the project directory. If no real ticket exists, auto-generate: `{YYYYMMDD}-{4 random hex}` (e.g., `20260221-a3f2`).

### Run directories

Run directories group artifacts from a review workflow cycle:

```
projects/{project-slug}/tickets/{ticket-id}/{run-id}/
  {NN}_{role}_{artifact}.md              ← orchestrated runs (sequential counter)
  {timestamp}_{role}_{artifact}.md       ← interactive runs (timestamp prefix)
```

**Run ID format:** `{timestamp}-{mode}`

- **timestamp:** UTC, `YYYYMMDD-HHMMSSZ` — from the first artifact in the run
- **mode:** `interactive` or `orchestrated` — reflects how the run was _initiated_ (immutable at creation)

Examples: `20260221-034100Z-interactive`, `20260221-090000Z-orchestrated`

Multiple runs per ticket (restarts, separate review cycles) each get their own run directory. Created by the first artifact in a run.

### Persistent export destination

Artifacts under `{base_dir}/` are ephemeral when `base_dir` is a git-ignored path (the default). In worktrees, they are lost on deletion. The `export-ai-artifacts.sh` script copies them to `~/ai-artifacts/projects/{project-slug}/` for long-term retention, preserving the same directory structure. Exported artifacts are immutable (first export wins).

## Path resolution

Skills resolve artifact directories by invoking `get-session-context` and reading `artifact_base_dir` and `project_slug` from the manifest. This is the canonical method for all artifact path resolution.

For contexts where the manifest is unavailable (e.g., standalone scripts without skill access), the manual fallback is:

1. Read `artifacts.base_dir` from `.agents/preferences.yaml`
2. If not found there, read from `~/.agents/preferences.yaml`
3. If still not found, use the default base directory
4. If `base_dir` is relative, resolve from project root. If absolute, use as-is.
5. Read `project.slug` from `.agents/preferences.yaml`, falling back to `~/.agents/preferences.yaml`, then the bare directory name of the working directory.

### Ticket-scoped paths

```
{base_dir}/projects/{project-slug}/tickets/{ticket-id}/
```

Ticket-level artifacts and run directories both live here. Use `get-session-context` to obtain `ticket_id`.

### Run paths

```
{base_dir}/projects/{project-slug}/tickets/{ticket-id}/{run-id}/
```

### Non-ticket paths

| Category          | Default path        | Full default                                            |
| ----------------- | ------------------- | ------------------------------------------------------- |
| chats             | `chats`             | `{base_dir}/projects/{project-slug}/chats/`             |
| deferred-findings | `deferred-findings` | `{base_dir}/projects/{project-slug}/deferred-findings/` |
| devlogs           | `devlogs`           | `{base_dir}/projects/{project-slug}/devlogs/`           |
| plans             | `plans`             | `{base_dir}/projects/{project-slug}/plans/`             |

Non-ticket paths are relative to the project directory. Category names remain configurable via `artifacts.paths.{category}` in preferences.yaml, with one exception: `deferred-findings` is hardcoded and cannot be overridden.

Devlogs and deferred-findings artifacts are dual-homed: When a ticket is in session context they are written as ticket-level artifacts under `tickets/{ticket-id}/`; otherwise they fall back to the project-scoped paths above (`devlogs/` for devlogs, `deferred-findings/` for deferred-findings). All filenames in both types use the standard `YYYYMMDD-HHMMSSZ` ticket-level timestamp shape regardless of where they land.

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
{NN}_{role}_{artifact}.md
```

- **{NN}**: Two-digit zero-padded sequence number reflecting artifact creation order within the run (e.g., `01`, `02`, ... `99`)
- **role**: `architect`, `coder`, `code-reviewer`, `code-simplification-reviewer`, `orchestrator`, `planner`, `reviewer`, `silent-failure-reviewer`, `test-reviewer` (extensible — this is a common roles list, not exhaustive)
- **artifact**: What the document is — `architecture`, `change-summary`, `code-review`, `code-simplification-review`, `orchestration-plan`, `plan`, `review`, `run-manifest`, `run-summary`, `silent-failure-review`, `test-review`

Underscore separates all structural parts. Hyphens are free for use within any part (role names, artifact names, slugs).

Each role has a **roleType** classifying its workflow function. See the [roleType taxonomy](#roletype-taxonomy) in the run-index.json section below.

Artifact ordering is explicit via the sequence number. Timing is captured in the `artifact_written` event's `t` field in `run-log.jsonl`, not the filename.

Example run directory (full orchestrated run with iterative review):

```
{base_dir}/projects/williamthorsen-configs-macos/tickets/MAC-68/20260221-034100Z-orchestrated/
  run-index.json
  01_orchestrator_run-manifest.md                       # Initialization
  02_orchestrator_ticket-requirements.md                # Initialization (optional)
  03_architect_architecture.md                          # Phase 1 (optional)
  04_planner_orchestration-plan.md                      # Phase 2 (optional)
  04_planner_orchestration-plan.json                    # Phase 2 (same seq — same artifact, two formats)
  05_coder_change-summary.md                            # Phase 3
  06_reviewer_review.md                                 # Phase 4: Iteration 1
  07_silent-failure-reviewer_silent-failure-review.md   # Phase 4: Iteration 1
  08_test-reviewer_test-review.md                       # Phase 4: Iteration 1
  09_code-reviewer_code-review.md                       # Phase 4: Iteration 1
  10_coder_change-summary.md                            # Phase 4: Coder fix
  11_reviewer_review.md                                 # Phase 4: Re-review (iteration 2)
  12_code-reviewer_code-review.md                       # Phase 4: Re-review (iteration 2)
  13_code-simplification-reviewer_code-simplification-review.md # Phase 4a
  14_coder_change-summary.md                            # Phase 4a: Coder fix
  15_reviewer_holistic-review.md                        # Phase 4b
  16_orchestrator_run-summary.md                        # Phase 5
```

## Universal artifact frontmatter

All skill- and subagent-authored artifacts begin with a YAML frontmatter block conforming to the canonical schema below. A single shape lets one parser serve every artifact type, and a single source of truth keeps the per-artifact sections free of duplication.

```yaml
---
provenance:
  skill: <skill-name> # required — the skill or subagent that wrote this artifact
  timestamp: <ISO 8601 UTC> # required — write time
  baseSha: <short SHA> # optional — short SHA of origin/main; omit if unresolvable
  isInteractive: true|false # required — true for interactive flows, false for orchestrated dispatch
  refinedBy: <skill-name> # optional — the skill that last processed/refined the artifact
  model: <model id> # optional — present when an AI model authored the body
ticket_id: <id> # optional — omit when no ticket is in session
ticket_ref: <display ref> # optional — omit when ticket_id is null
branch: <branch name> # required — raw branch_name from session context
commit: <short SHA of HEAD> # required — short HEAD SHA at write time
pr: <full URL> # optional — omit when no PR or lookup fails
author: <name(s)> # optional — used by review artifacts
commits: [<sha>, ...] # optional — used by devlogs
run_id: <run id> # optional — present in orchestrated runs
---
```

### Field naming convention

Keys inside the `provenance:` block use **camelCase** (e.g., `baseSha`, `isInteractive`, `refinedBy`). All other top-level keys use **snake_case** (e.g., `ticket_id`, `ticket_ref`, `run_id`). This split preserves the existing convention used by 544+ historical artifacts and the consumers (`refine-plan`, orchestrator trust evaluation) that read them, while keeping the rest of the schema consistent with the surrounding snake_case YAML.

### Field definitions

The table below lists only the universal fields. Artifact-specific extensions (`provenance.iteration`, `session_type`, `tickets_created`, `title`, `scope`, `type`, `responding_to`, etc.) are documented in the per-artifact sections below.

| Field                      | Required | Description                                                                                                                                          |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provenance.skill`         | yes      | The skill or subagent that wrote the artifact (e.g., `create-devlog`, `orchestrated-reviewer`).                                                      |
| `provenance.timestamp`     | yes      | ISO 8601 UTC timestamp of when the artifact was written.                                                                                             |
| `provenance.baseSha`       | no       | Short SHA of `origin/main` at write time. Omitted if unresolvable (no remote, shallow clone).                                                        |
| `provenance.isInteractive` | yes      | `true` for interactive flows; `false` for non-interactive orchestrated dispatch.                                                                     |
| `provenance.refinedBy`     | no       | The skill that last processed/refined the artifact (e.g., `refine-plan`). Records processing, not authorship.                                        |
| `provenance.model`         | no       | The model identifier authoring the body (e.g., `claude-opus-4-7`). Omitted for human-authored or co-authored artifacts.                              |
| `ticket_id`                | no       | Ticket ID from session context. Omitted when no ticket is in session.                                                                                |
| `ticket_ref`               | no       | Human-readable ticket reference (e.g., `#537`, `MAC-68`). Omitted when `ticket_id` is omitted.                                                       |
| `branch`                   | yes      | Current branch name from session context. Written as-is — no sanitization.                                                                           |
| `commit`                   | yes      | Short SHA of HEAD at write time. Resolved via `git rev-parse --short HEAD`. Distinct from `commits` (the devlog-specific list).                      |
| `pr`                       | no       | Full PR URL (e.g., `https://github.com/{owner}/{repo}/pull/{n}`). Omitted when no PR exists or lookup fails — see [PR resolution](pr-resolution.md). |
| `author`                   | no       | Human author of the work. Used by review artifacts where the reviewing surface records the code author.                                              |
| `commits`                  | no       | List of short SHAs the artifact summarizes. Used by devlogs. Distinct from `commit` (HEAD short SHA).                                                |
| `run_id`                   | no       | Orchestrated run ID. Present in orchestrated runs and in artifacts that link back to one.                                                            |

### `commit` vs. `commits`

`commit` is a singular top-level field holding the short HEAD SHA at write time. Every artifact has one. `commits` is an optional list used only by devlogs, recording the SHAs whose changes the devlog summarizes. The two coexist and never conflict.

### PR resolution

Skills resolve `pr` at write time via the shared dispatch documented in [`pr-resolution.md`](pr-resolution.md). On failure, the `pr:` line is omitted and the skill emits the canonical warning text — the artifact write itself is never blocked.

### Bespoke frontmatter composition

Most skills and subagents produce frontmatter by running `resolve-frontmatter.sh` in its default YAML mode and prepending the output verbatim. Two sites are deliberate exceptions and opt into `--format json` to compose the YAML block themselves:

- `refine-plan` — the `provenance:` block is case-branched on the input artifact's existing provenance (preserving `skill`, `baseSha`, `isInteractive`, and `iteration` from the original authoring skill, with fallbacks when the input has no provenance). The shell flag surface cannot express this conditional logic cleanly.
- `wrap-up` (deferred-findings artifact) — `tickets_created` is a list of `{id, items}` objects, a structure that has no clean CLI expression and is best composed in the skill's own logic.

These two sites read the script's JSON output, then write the YAML frontmatter themselves. The pattern is intentional, not a workaround — keep new skills on the YAML mode path unless they have a similarly structural reason to deviate.

## Subagent dispatch precondition

Subagents that produce frontmatter artifacts depend on `.agents/{sanitized-branch}.branch-manifest.json`. The manifest is created exclusively by the `get-session-context` skill, which is not available to subagents (they are tool-restricted to `Read, Grep, Glob, Bash, Write` to prevent reviewer agents in `/orchestrate-dev` workflows from reaching beyond their purview).

The dispatcher, the skill or main agent that invokes the subagent via the Task tool, must invoke `get-session-context` in the current working directory before dispatching any subagent that calls `resolve-frontmatter.sh`. The manifest must exist when the subagent runs; the subagent cannot create it itself.

Current dispatchers:

| Dispatcher                | Location                                                                   |
| ------------------------- | -------------------------------------------------------------------------- |
| `orchestrate`             | `packages/agents/content/skills/orchestrate/SKILL.md` (Phase 1 step 1)     |
| `refine-plan`             | `packages/agents/content/skills/refine-plan/SKILL.md` (step 4)             |
| `plan-orchestrable-steps` | `packages/agents/content/skills/plan-orchestrable-steps/SKILL.md` (step 1) |

When authoring a new dispatcher: invoke `get-session-context` as the first step, before any Task tool dispatch. `resolve-frontmatter.sh` hard-fails inside the subagent if the precondition is unmet, with a message identifying the violation.

## Plan provenance

This artifact uses the [universal artifact frontmatter](#universal-artifact-frontmatter) plus the following artifact-specific extension:

| Field                  | Required | Description                                                                                                                     |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `provenance.iteration` | no       | Refinement iteration counter. Absent on first authoring; set to `2` on first refinement, incremented on subsequent refinements. |

Plan-specific `provenance.skill` values include `design-and-plan`, `plan-orchestrable-steps`, `plan-mode`, and `unknown` (when the authoring skill cannot be determined). `refinedBy` is the skill that last processed the plan (typically `refine-plan`).

## Devlog frontmatter

This artifact uses the [universal artifact frontmatter](#universal-artifact-frontmatter). Devlogs typically populate `commits` (the SHAs the devlog summarizes) in addition to the universally-required fields. `provenance.skill` is `create-devlog`; `provenance.isInteractive` is `true`. `commits` is omitted for `working-tree` invocations.

## Deferred-findings frontmatter

This artifact uses the [universal artifact frontmatter](#universal-artifact-frontmatter) plus the following artifact-specific extensions. The artifact is written when at least one finding became a created ticket or at least one finding was dropped; see [`wrap-up/SKILL.md`](../wrap-up/SKILL.md) Phase 4 Step 1 for the write conditions.

| Field             | Required | Description                                                                                                                                                                              |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_type`    | yes      | The session classification from wrap-up's Phase 1a (`orchestrated`, `interactive-dev`, `review`, or `research`).                                                                         |
| `tickets_created` | no       | List of `{id, items}` entries cross-referencing each created ticket to the wrap-up item IDs it addresses. `items` is always a list (e.g., `[F1]` or `[F1, T2, R1]`). Omitted when empty. |

`provenance.skill` is `wrap-up`; `provenance.isInteractive` is `true`.

**Single-finding case** — a ticket addressing one finding:

```yaml
tickets_created:
  - id: '<number>'
    items: [F1]
```

**Batch case** — a single ticket addressing multiple findings uses the same shape with additional IDs in `items`:

```yaml
tickets_created:
  - id: '<number>'
    items: [F1, T2, R1]
```

## Change-summary frontmatter

This artifact uses the [universal artifact frontmatter](#universal-artifact-frontmatter) plus the following artifact-specific extensions consumed by downstream PR-creation skills (`create-pr`, `create-gh-pr`, `create-bitbucket-pr`):

| Field   | Required | Description                                                                                      |
| ------- | -------- | ------------------------------------------------------------------------------------------------ |
| `title` | yes      | The change-summary title, used as the proposed PR title.                                         |
| `scope` | yes      | The scope segment for the commit/PR title (e.g., `agents`, `factory`, `root`).                   |
| `type`  | yes      | The work type (see `work-types.json`) for the commit/PR title (e.g., `feat`, `fix`, `refactor`). |

The unified frontmatter shape places `provenance:` first, then top-level canonical fields (`branch`, `commit`, `pr`, `ticket_id`, `ticket_ref`, `run_id`), then the consumer extensions (`title`, `scope`, `type`). `commit:` and `ticket_id:` appear exactly once each and serve a dual role: canonical identity fields that downstream consumers may also read. This is the canonical example for any future skill that carries consumer-specific fields alongside canonical ones.

## run-index.json

Machine-readable metadata for orchestrated runs. Written and maintained exclusively by the orchestrator. Individual skills do not write to this file directly.

### Schema

> **Note:** The following examples show v2 format. New orchestrated runs use v3 (event-sourced) -- see the [V3 format](#v3-format-event-sourced-runs) section below.

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
    "effort": "medium",
    "approvalThreshold": "medium",
    "budgetThreshold": "medium",
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
        "status": "completed",
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
    "effort": "medium",
    "approvalThreshold": "medium",
    "budgetThreshold": "medium",
    "mode": "orchestrated",
    "model": "claude-opus-4-6"
  },
  "artifacts": [
    {
      "filename": "01_orchestrator_run-manifest.md",
      "role": "orchestrator",
      "roleType": "orchestrator",
      "agent": "orchestrator",
      "type": "run-manifest",
      "phase": "initialization",
      "createdAt": "2026-02-21T03:41:00Z"
    },
    {
      "filename": "02_architect_architecture.md",
      "role": "architect",
      "roleType": "analyst",
      "agent": "orchestrated-architect",
      "type": "architecture",
      "phase": "architecture",
      "createdAt": "2026-02-21T03:42:00Z"
    },
    {
      "filename": "03_planner_orchestration-plan.md",
      "role": "planner",
      "roleType": "planner",
      "agent": "orchestrated-planner",
      "type": "orchestration-plan",
      "phase": "planning",
      "createdAt": "2026-02-21T03:43:00Z"
    },
    {
      "filename": "04_coder_change-summary.md",
      "role": "coder",
      "roleType": "author",
      "agent": "orchestrated-coder",
      "type": "change-summary",
      "phase": "implementation",
      "createdAt": "2026-02-21T03:45:00Z"
    },
    {
      "filename": "05_reviewer_review.md",
      "role": "reviewer",
      "roleType": "reviewer",
      "agent": "orchestrated-reviewer",
      "type": "review",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T03:47:00Z",
      "iteration": 1
    },
    {
      "filename": "06_silent-failure-reviewer_silent-failure-review.md",
      "role": "silent-failure-reviewer",
      "roleType": "reviewer",
      "agent": "aspect-silent-failure-reviewer",
      "type": "silent-failure-review",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T03:47:00Z",
      "iteration": 1
    },
    {
      "filename": "07_code-reviewer_code-review.md",
      "role": "code-reviewer",
      "roleType": "reviewer",
      "agent": "aspect-code-reviewer",
      "type": "code-review",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T03:47:00Z",
      "iteration": 1
    },
    {
      "filename": "08_coder_change-summary.md",
      "role": "coder",
      "roleType": "author",
      "agent": "orchestrated-coder",
      "type": "change-summary",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T04:00:00Z",
      "note": "Addresses aggregated findings from iteration 1"
    },
    {
      "filename": "09_reviewer_review.md",
      "role": "reviewer",
      "roleType": "reviewer",
      "agent": "orchestrated-reviewer",
      "type": "review",
      "phase": "parallelReview",
      "createdAt": "2026-02-21T04:15:00Z",
      "iteration": 2
    },
    {
      "filename": "10_orchestrator_run-summary.md",
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

| roleType       | Description                                         | Example roles                                                                                           |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `orchestrator` | Coordinates phases and manages run state            | `orchestrator`                                                                                          |
| `analyst`      | Assesses impact and provides architectural guidance | `architect`                                                                                             |
| `planner`      | Produces implementation plans                       | `planner`                                                                                               |
| `author`       | Writes or modifies project code                     | `coder`                                                                                                 |
| `reviewer`     | Evaluates code and produces findings                | `reviewer`, `code-reviewer`, `code-simplification-reviewer`, `silent-failure-reviewer`, `test-reviewer` |

### Artifact entry fields

| Field       | Required | Description                                                                               |
| ----------- | -------- | ----------------------------------------------------------------------------------------- |
| `filename`  | yes      | Artifact filename (without directory path)                                                |
| `role`      | yes      | Filename role segment (e.g., `reviewer`, `code-reviewer`)                                 |
| `roleType`  | yes      | Workflow function (one of: `orchestrator`, `analyst`, `planner`, `author`, `reviewer`)    |
| `agent`     | yes      | {tool:Task} `subagent_type` value (e.g., `orchestrated-reviewer`, `aspect-code-reviewer`) |
| `type`      | yes      | Artifact type (e.g., `review`, `change-summary`)                                          |
| `phase`     | yes      | Phase that produced this artifact (camelCase, matches `phases` object keys)               |
| `createdAt` | yes      | ISO 8601 timestamp                                                                        |
| `iteration` | no       | Review iteration number (for `parallelReview` phase)                                      |
| `note`      | no       | Free-text context about the artifact                                                      |

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

The `version` field distinguishes schema formats: absent = v1 (`status.json` era), `2` = v2 (inline state in `run-index.json`), `3` = v3 (event-sourced). New orchestrated runs use v3. Existing v2 runs remain valid.

## V3 format: Event-sourced runs

V3 separates static run metadata from dynamic state. The `run-index.json` file contains only the header; all state transitions are recorded as events in a companion `run-log.jsonl` file.

### V3 header schema

`run-index.json` with `version: 3` contains only the header — no `phases`, `phaseDecisions`, `status`, or `completedAt` fields in `context`. `completedAt` is stamped at the top level by `complete_run`.

Context fields: `runId`, `projectSlug`, `ticketId?`, `projectRoot`, `branch`, `task`, `startedAt`.

Config fields: `externalPlan?`, `mergeBaseSha?`, `diffBase?`, `maxReviewRounds?`, `effort?`, `approvalThreshold?`, `budgetThreshold?`, `mode?`, `model?`. Additional fields are preserved (loose schema).

### Run-log.jsonl

Companion file in the same run directory. Each line is a JSON object (JSONL format) representing one `RunEvent`. Events are append-only and timestamped with field `t` (ISO 8601, server-generated). Events are validated against the `runEventSchema` discriminated union on `event` field before being appended.

### Event types

All 13 valid event types and their required fields. Fields suffixed with `?` are optional — usage fields (`tokens`, `toolUses`, `durationMs`) are present on newer runs where the orchestrator captures {tool:Task} result metrics; older runs omit them:

| Event type             | Key fields                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run_started`          | _(none beyond `t`, `event`)_                                                                                                                     |
| `run_completed`        | `status` (`completed`\|`failed`\|`needs_manual_review`)                                                                                          |
| `run_failed`           | `status`, `reason?`                                                                                                                              |
| `phase_decision`       | `phase` (string), `run` (boolean), `reason?`                                                                                                     |
| `phase_started`        | `phase` (one of: `architecture`\|`planning`\|`implementation`\|`review`\|`simplifier`\|`holistic`)                                               |
| `phase_completed`      | `phase`, `status` (one of: `completed`\|`skipped`\|`failed`\|`in_progress`\|`approved`), `data?` (record), `tokens?`, `toolUses?`, `durationMs?` |
| `reviewer_dispatched`  | `reviewer` (string)                                                                                                                              |
| `reviewer_completed`   | `reviewer`, `status` (`completed`\|`skipped`\|`failed`), `criticality` (`none`\|`low`\|`medium`\|`high`), `tokens?`, `toolUses?`, `durationMs?`  |
| `coder_fix_started`    | `iteration` (number)                                                                                                                             |
| `coder_fix_completed`  | `iteration` (number), `tokens?`, `toolUses?`, `durationMs?`                                                                                      |
| `re_review_dispatched` | `reviewers` (string array)                                                                                                                       |
| `re_review_completed`  | `criticalities` (record: reviewer name -> criticality), `tokens?`, `toolUses?`, `durationMs?`                                                    |
| `artifact_written`     | `filename`, `role`, `roleType`, `agent`, `type`, `phase`, `iteration?`, `note?`                                                                  |

### Run directory layout (v3)

```
{base_dir}/projects/{projectSlug}/tickets/{ticketId}/{runId}/
  run-index.json    <- v3 header (written by init_run, completedAt stamped by complete_run)
  run-log.jsonl     <- append-only event log (one JSON object per line)
  {NN}_{role}_{artifact}.md   <- artifact files (orchestrated runs use sequential counters)
```

Runs are always nested under a ticket ID directory. When no ticket ID is provided to `init_run`, one is auto-generated in the format `{YYYYMMDD}-{4 random hex}` (e.g., `20260302-a3f2`). The date prefix aids human navigation. Caller-supplied ticket IDs with a leading `#` are sanitized to bare numbers before use in file paths (e.g., `#152` becomes `152`).

### Run ID format (v3)

`{yyyymmdd}-{hhmmss}Z` (generated by `init_run`). This differs from the v2 format `{yyyymmdd}-{hhmmss}Z-orchestrated`.

### Event folding

Full run state (phases, artifacts, review rounds, criticalities) is reconstructed by the `foldEvents` function from `run-log.jsonl`. The `get_run_state` MCP tool performs this reconstruction and returns a `CanonicalRunStatus`. Orchestrators should call `get_run_state` for cumulative decisions instead of maintaining state in conversation memory.

### Backward compatibility

V2 and v1 `run-index.json` formats remain supported by the Factory consumer.

## Artifact types

### Run artifacts (in run directories)

| Artifact                     | Purpose                                                   | Dispositions?                          |
| ---------------------------- | --------------------------------------------------------- | -------------------------------------- |
| `architecture`               | Architectural impact assessment and integration guidance  | No                                     |
| `change-summary`             | What changed + dispositions on prior findings (if any)    | Yes, when responding to a prior review |
| `code-review`                | Aspect review: CLAUDE.md compliance, bugs, logic errors   | No                                     |
| `code-simplification-review` | Aspect review: Simplification opportunities and dead code | No                                     |
| `holistic-review`            | Holistic review after iterative convergence               | Only for own prior findings            |
| `orchestration-plan`         | Structured orchestration steps (.md and .json variants)   | No                                     |
| `plan`                       | Implementation plan document                              | No                                     |
| `review`                     | Code review findings + dispositions on own prior findings | Only for own prior findings            |
| `run-manifest`               | Immutable record of run initial conditions                | No                                     |
| `run-summary`                | Final summary of the orchestrated run                     | No                                     |
| `silent-failure-review`      | Aspect review: Error handling and silent failure analysis | No                                     |
| `test-review`                | Aspect review: Test coverage quality and behavioral gaps  | No                                     |

The first `coder_change-summary` in a run has no dispositions (nothing to respond to). Subsequent ones embed dispositions alongside the change summary.

### Ticket-level artifacts

- `change-summary` — Branch change summary for PRs
- `devlog` — Development log entry (falls back to non-ticket path when no ticket is in session)
- `orchestration-plan` — Orchestration plan (`orchestration-plan.json` is a **mutable** artifact overwritten each planning iteration; `{timestamp}_planner_orchestration-plan.md` files are versioned human-readable snapshots)
- `plan` — Implementation plan document
- `plan-review` — Plan review findings (completeness and correctness analysis)
- `plan-v2` — Refined implementation plan after review and revision
- `pull-request` — PR description file
- `review` — Code review (ticket-level, commit scope)
- `ticket` — Issue ticket
- `deferred-findings` — Record of findings deferred during a `/wrap-up` session, with cross-references to created tickets (falls back to non-ticket path when no ticket is in session)

### Non-ticket artifacts

- `chat-summary` — Conversation summary

## Run lifecycle

### Starting a run

Orchestrated runs begin with `orchestrator_run-manifest` as the first artifact, recording the run's initial conditions. Interactive runs allow either role to produce the first artifact. Common patterns:

- Orchestrated: Orchestrator produces `orchestrator_run-manifest`, then coder produces `coder_change-summary`
- Interactive: Coder produces `coder_change-summary`, then reviewer produces `reviewer_review`
- Interactive: Reviewer produces `reviewer_review` directly (human is the coder)

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

## Finding scheme (F/W/T/R/S + legacy suffix)

Used by review-producing skills and agents for structured code review findings. Every finding (F/W/T/R/S) must include a concrete action the author can take. Non-actionable observations belong in prose sections (e.g., Technical Assessment), not in numbered findings.

| ID                 | Category       | Icon | Criticality | Merge-blocking?            |
| ------------------ | -------------- | ---- | ----------- | -------------------------- |
| `F{n}`             | FIXME          | 🚨   | `high`      | Always                     |
| `W{n}`             | Warning        | ⚠️   | `medium`    | Unless justified           |
| `T{n}`             | TODO           | 📋   | `low`       | Never (ticket if deferred) |
| `R{n}`             | Recommendation | 🧠   | `low`       | Never (note if deferred)   |
| `S{n}`             | Suggestion     | ☝️   | `none`      | Never (piggyback only)     |
| `{F,W,T,R,S}{n}-L` | Legacy         | 🔍   | excluded    | Never                      |

Consumers that present or report findings (review skills, wrap-up, response artifacts) should render the icon alongside the prefix or category to give an at-a-glance severity cue. The Legacy row uses 🔍 regardless of underlying severity letter.

### Category criteria

**FIXME (F)** — must fix before merge:

- Bugs: Incorrect logic, unhandled error paths, data loss risks
- Security: Injection, auth bypass, exposed secrets
- Contract violations: Breaking API changes, type unsafety
- Test failures: Tests that don't pass or don't test what they claim

**Warning (W)** — questionable, may block merge:

- Missing edge case handling that could cause runtime errors
- Convention violations that affect maintainability
- Decisions that seem wrong but may be intentional (require justification)
- **Gate:** A warning must reflect a judgment call by the author, not a mechanical oversight. If automated tooling (linters, type-checkers, CI) would catch the issue, it is not a warning — classify as Suggestion at most.

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

**Legacy (-L suffix)** — pre-existing code observation:

- Issues in code not authored in this branch — use the same severity letter as the equivalent author finding plus a `-L` suffix
- Legacy findings share the numbering sequence with author findings of the same severity letter. Example: If a review has `F1`, `F2` (author findings), the first legacy FIXME is `F3-L`
- Set the `**Severity:**` field to `{severity} (legacy)` — e.g., `critical (legacy)`, `warning (legacy)`, `suggestion (legacy)`
- Frame as future opportunities, not current defects
- Never count against the review score

### Overall criticality mapping

| Highest finding present    | Criticality | Meaning                    |
| -------------------------- | ----------- | -------------------------- |
| None, only S, or only `-L` | `none`      | No actionable findings     |
| T and/or R (no W/F)        | `low`       | Deferrable items available |
| W (no F)                   | `medium`    | Real issues to address     |
| F                          | `high`      | Must fix before merge      |

### Re-review severity escalation

`S → R → T → W → F`. Legacy (`-L`) findings are never escalated.

## Knowledge items

Knowledge items capture observations and learnings worth preserving. They are not findings: They have no criticality, are never merge-blocking, and are never emitted by code review skills. They appear in housekeeping artifacts (wrap-up inventories, chat summaries, devlogs) where conveying knowledge — not assigning blame or action — is the point.

| ID     | Category | Icon | Kind      |
| ------ | -------- | ---- | --------- |
| `I{n}` | Insight  | 💡   | knowledge |

Consumers that present insights (`wrap-up`, `summarize-chat`) should render the icon alongside the prefix or label to mirror the convention used for findings.

## Artifact lifecycle

- **Active**: Artifact is current and relevant
- **Stale**: Branch has been merged or deleted, and artifact is 30+ days old

## Portability

Every level degrades gracefully:

- Missing project `.agents/preferences.yaml` -> fall back to global `~/.agents/preferences.yaml`
- Missing global preferences -> fall back to the default base directory
- Missing `{base_dir}/` directory -> created automatically on first artifact save
- Missing `project.slug` in preferences -> use the bare directory name of the working directory

## Migration from status.json (v1) to run-index.json (v2)

### File rename

`status.json` → `run-index.json`. The new name reflects the file's expanded role as an artifact registry, not just a status tracker.

### Schema changes

- **New `version` field** (value: `2`). Enables schema detection; absent version = v1.
- **`context` section** groups: `runId`, `projectSlug`, `ticketId`, `projectRoot`, `branch`, `task`, `startedAt`, `completedAt`, `status`, `phases`, `phaseDecisions`.
- **`config` section** groups: `externalPlan`, `mergeBaseSha` (new), `diffBase` (new), `maxReviewRounds` (new), `effort` (new), `approvalThreshold` (new), `budgetThreshold` (new), `mode`, `model`.
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

| v1 role  | v2 role                        |
| -------- | ------------------------------ |
| `aspect` | `silent-failure-reviewer`      |
| `aspect` | `test-reviewer`                |
| `aspect` | `code-reviewer`                |
| `aspect` | `code-simplification-reviewer` |

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
