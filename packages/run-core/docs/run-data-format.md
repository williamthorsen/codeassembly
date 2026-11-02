# Run data format

The files that describe a run directory: `run-index.json` (v2 and v3), the v3 `run-log.jsonl`, and the v1 `status.json`. The retired orchestration engine wrote them, and the current skills do not. The Zod schemas in [`src/schemas/`](../src/schemas/) implement this specification, and `parseRunData` reads every version; change the two together.

## run-index.json

Machine-readable metadata for a run directory. The retired orchestration engine wrote it; the current skills do not. `run-core` parses it.

Every example and value list in this section and in [V3 format](#v3-format-event-sourced-runs) describes runs written by the retired engine, so its roles, agents, phases, and modes are historical values.

### Schema

> **Note:** The following examples show v2 format. The engine's last runs use v3 (event-sourced) -- see the [V3 format](#v3-format-event-sourced-runs) section below.

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

### roleType taxonomy

Each role maps to one of five workflow-function types. Only the retired orchestration engine wrote the `orchestrator`, `analyst`, and `planner` types, and every `reviewer` role but `reviewer`:

| roleType       | Description                                         | Example roles                                                                                           |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `orchestrator` | Coordinates phases and manages run state            | `orchestrator`                                                                                          |
| `analyst`      | Assesses impact and provides architectural guidance | `architect`                                                                                             |
| `planner`      | Produces implementation plans                       | `planner`                                                                                               |
| `author`       | Writes or modifies project code                     | `coder`                                                                                                 |
| `reviewer`     | Evaluates code and produces findings                | `reviewer`, `code-reviewer`, `code-simplification-reviewer`, `silent-failure-reviewer`, `test-reviewer` |

### Artifact entry fields

| Field       | Required | Description                                                                            |
| ----------- | -------- | -------------------------------------------------------------------------------------- |
| `filename`  | yes      | Artifact filename (without directory path)                                             |
| `role`      | yes      | Filename role segment (e.g., `reviewer`, `code-reviewer`)                              |
| `roleType`  | yes      | Workflow function (one of: `orchestrator`, `analyst`, `planner`, `author`, `reviewer`) |
| `agent`     | yes      | Task tool `subagent_type` value (e.g., `plan-reviewer`)                                |
| `type`      | yes      | Artifact type (e.g., `review`, `change-summary`)                                       |
| `phase`     | yes      | Phase that produced this artifact (camelCase, matches `phases` object keys)            |
| `createdAt` | yes      | ISO 8601 timestamp                                                                     |
| `iteration` | no       | Review iteration number (for `parallelReview` phase)                                   |
| `note`      | no       | Free-text context about the artifact                                                   |

### Phase values

Phase values use camelCase and match the keys in the `phases` object. Only the retired orchestration engine wrote them:

- `initialization`: Run setup and manifest creation
- `architecture`: Architectural impact assessment
- `planning`: Implementation planning
- `implementation`: Code authoring
- `parallelReview`: Parallel review and fix cycles
- `codeSimplifier`: Code simplification pass
- `holisticReview`: Final comprehensive review
- `summary`: Run summary generation

### Version field

The `version` field distinguishes schema formats: absent = v1 (`status.json` era), `2` = v2 (inline state in `run-index.json`), `3` = v3 (event-sourced). The engine's last runs use v3. Runs in v1 and v2 remain valid.

## V3 format: Event-sourced runs

V3 separates static run metadata from dynamic state. The `run-index.json` file contains only the header; all state transitions are recorded as events in a companion `run-log.jsonl` file. V3 is a read-only format: Only the retired orchestration engine wrote it, and run-core reads it.

### V3 header schema

`run-index.json` with `version: 3` contains only the header, without `phases`, `phaseDecisions`, `status`, or `completedAt` fields in `context`. `completedAt`, present once the run completed, is at the top level.

Context fields: `runId`, `projectSlug`, `ticketId?`, `projectRoot`, `branch`, `task`, `startedAt`.

Config fields: `externalPlan?`, `mergeBaseSha?`, `diffBase?`, `maxReviewRounds?`, `effort?`, `approvalThreshold?`, `budgetThreshold?`, `mode?`, `model?`. Additional fields are preserved (loose schema).

### Run-log.jsonl

Companion file in the same run directory. Each line is a JSON object (JSONL format) representing one `RunEvent`. The engine appended events in order, timestamped each with field `t` (ISO 8601), and validated each against the `runEventSchema` discriminated union on the `event` field before appending it.

### Event types

All 13 valid event types and their required fields. Fields suffixed with `?` are optional. Only the retired orchestration engine wrote these events. Usage fields (`tokens`, `toolUses`, `durationMs`) are present on its later runs, which recorded Task tool result metrics; older runs omit them:

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
  run-index.json    <- v3 header (top-level completedAt once the run completed)
  run-log.jsonl     <- append-only event log (one JSON object per line)
  {NN}_{role}_{artifact}.md   <- artifact files (sequential counter)
```

Runs are always nested under a ticket ID directory. When its caller did not provide a ticket ID, the engine generated one in the format `{YYYYMMDD}-{4 random hex}` (e.g., `20260302-a3f2`). Caller-supplied ticket IDs with a leading `#` were sanitized to bare numbers before use in file paths (e.g., `#152` became `152`).

### Run ID format (v3)

`{yyyymmdd}-{hhmmss}Z`, generated by the engine. This differs from the historical v2 format `{yyyymmdd}-{hhmmss}Z-orchestrated`.

### Event folding

Full run state (phases, artifacts, review rounds, criticalities) is reconstructed from `run-log.jsonl` by run-core's `foldEvents` function, which returns a `CanonicalRunStatus`.

### Backward compatibility

The run-core parser, `parseRunData`, still reads the v2 `run-index.json` format and the v1 `status.json` format.

## Migration from status.json (v1) to run-index.json (v2)

The retired orchestration engine wrote both formats. This section records how they differ, for readers of historical runs.

### File rename

`status.json` → `run-index.json`. The new name reflects the file's expanded role as an artifact registry, not just a status tracker.

### Schema changes

- **New `version` field** (value: `2`). Enables schema detection; absent version = v1.
- **`context` section** groups: `runId`, `projectSlug`, `ticketId`, `projectRoot`, `branch`, `task`, `startedAt`, `completedAt`, `status`, `phases`, `phaseDecisions`.
- **`config` section** groups: `externalPlan`, `mergeBaseSha` (new), `diffBase` (new), `maxReviewRounds` (new), `effort` (new), `approvalThreshold` (new), `budgetThreshold` (new), `mode`, `model`.
- **`phaseDecision` → `context.phaseDecisions`** (now keyed by phase name, each value is a `{ run, reason? }` object). Each entry now includes an optional `disposition` field (`executed` | `skipped` | `absent`).
- **New `pipeline` field in `config`**. Ordered list of phase names from the engine's pipeline specification (e.g., `["architecture", "planning", "implementation", "review-cycle"]`). Records which phases were configured for the run (intent, not outcome). The `review-cycle` pipeline entry is a module that expands into sub-phase keys (`parallelReview`, `codeSimplifier`, `holisticReview`) in `context.phaseDecisions` and `context.phases` at runtime.
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

### Backward compatibility

`parseRunData` reads `run-index.json` as v3, then as v2, and reads `status.json` only when a run directory does not contain a `run-index.json`. The presence of a `version` field distinguishes v2 from v1.
