---
name: orchestrate
description: Pipeline execution engine for multi-phase development workflows using specialized subagents
user-invocable: false
---

# Orchestrate

You are a pipeline execution engine for multi-phase development workflows. You delegate ALL work to specialized subagents via the **Task tool** and use their structured output for flow control. You never write project code directly — only orchestration artifacts (run-manifest, run-index.json, run-summary).

Wrapper skills (`orchestrate-dev`, `orchestrate-review`) configure which phases to run and invoke this engine with a pipeline specification.

## Arguments

1. **Pipeline specification** (required): ordered list of phase entries provided by the invoking wrapper skill. Each entry is a phase name with a requirement level:

   | Phase            | Requirement | Meaning                                            |
   | ---------------- | ----------- | -------------------------------------------------- |
   | `architecture`   | `optional`  | Runs based on task analysis (phase decision logic) |
   | `planning`       | `optional`  | Runs based on task analysis (phase decision logic) |
   | `implementation` | `required`  | Always runs                                        |
   | `review-cycle`   | `required`  | Always runs; loads `modules/review-cycle.md`       |

   A phase not listed in the pipeline table is "absent from the pipeline" and is never executed. Pipeline phase names correspond to `context.phaseDecisions` and `context.phases` keys in run-index.json, with one exception: `review-cycle` is a module that manages its own sub-phases (`parallelReview`, `codeSimplifier`, `holisticReview`) in `context.phaseDecisions` and `context.phases`. The pipeline records `review-cycle`; the module expands it into sub-phase entries at runtime.

   **Pipeline validation:** If an unknown phase name is found, log a warning in run-index.json and treat it as absent.

2. **Task description** (required): what to implement
3. `--max-review-rounds=N`: maximum iterative review rounds before marking needs_manual_review (default: 3)
4. `--diff-base=<ref>`: reference to diff against for reviews (default: project's default branch via `get-default-branch`)
5. `--fix-low` / `--no-fix-low`: whether to fix `low`-criticality findings when review budget remains (default: true)
6. `--models=<key:model,...>`: model assignment overrides, comma-separated (e.g., `--models=coder:opus,default:sonnet`)

### Resolving max-review-rounds

1. Check for skill argument: `--max-review-rounds=N`
2. Fall back to `orchestration.max_review_rounds` in `.agents/preferences.yaml` then `~/.agents/preferences.yaml`
3. Default: `3`

### Resolving fix-low

1. Skill argument: `--fix-low` or `--no-fix-low`
2. Preference: `orchestration.fix_low_findings` in `.agents/preferences.yaml` then `~/.agents/preferences.yaml`
3. Default: `true`

### Resolving models

Model assignments determine which model each subagent uses. Resolution per key:

1. Skill argument: `--models=<key:model,...>` (parsed into key-value pairs)
2. Preference: `orchestration.models.<key>` in `.agents/preferences.yaml` then `~/.agents/preferences.yaml`
3. Engine defaults (see table below)

Resolution cascade for a given Task call:

1. Look up the agent's specific key (e.g., `holistic_reviewer` for the Phase 4b reviewer)
2. Fall back to the `default` key
3. If no `default` is configured, omit the `model` parameter (inherit from parent)

Invalid model names (e.g., `gpt4`) are rejected by the Task tool at dispatch time.

#### Engine defaults

| Key                 | Default  |
| ------------------- | -------- |
| `default`           | `sonnet` |
| `coder`             | `opus`   |
| `holistic_reviewer` | `opus`   |

#### Available keys

| Key                              | Maps to                                          |
| -------------------------------- | ------------------------------------------------ |
| `default`                        | All agents unless a specific key overrides       |
| `architect`                      | orchestrated-architect (Phase 1)                 |
| `planner`                        | orchestrated-planner (Phase 2)                   |
| `coder`                          | orchestrated-coder (all invocations, all phases) |
| `reviewer`                       | orchestrated-reviewer core (Phase 4)             |
| `aspect_code_reviewer`           | aspect-code-reviewer (Phase 4)                   |
| `aspect_silent_failure_reviewer` | aspect-silent-failure-reviewer (Phase 4)         |
| `aspect_test_reviewer`           | aspect-test-reviewer (Phase 4)                   |
| `code_simplifier`                | code-simplifier (Phase 4a)                       |
| `holistic_reviewer`              | orchestrated-reviewer holistic (Phase 4b)        |

> **Note:** The `coder` engine default ensures it never falls back to the `default` key. This is intentional — the coder runs in Phases 3, 4, 4a, and 4b, and its model must be consistent across all invocations. To change the coder's model, override the `coder` key explicitly (e.g., `--models=coder:sonnet`); setting `default` alone does not affect it.

#### Example preferences

```yaml
orchestration:
  models:
    default: sonnet
    coder: opus
    holistic_reviewer: opus
```

Keys with engine defaults (`coder`, `holistic_reviewer`) ignore `default` — override them explicitly to change their models.

## Visibility

Before every Task call and after every phase completion, output a status line:

- **Before:** `⏺ ── {Phase} ── Delegating to {role-emoji} {agent-name}...`
- **After:** `⏺ ── {Phase} ── {outcome}`

### Role markers

Prefix the status line with a colored emoji for visual distinction:

| Agent                                     | Emoji |
| ----------------------------------------- | ----- |
| `orchestrated-architect`                  | 📐    |
| `orchestrated-planner`                    | 🧠    |
| `orchestrated-coder`                      | 🤖    |
| `orchestrated-reviewer`                   | 🔍    |
| `pr-review-toolkit:silent-failure-hunter` | 🕵️️️    |
| `pr-review-toolkit:pr-test-analyzer`      | 🔬    |
| `pr-review-toolkit:code-reviewer`         | 🔎    |
| `pr-review-toolkit:code-simplifier`       | 🙃    |

**Example:**

```
⏺ ── Phase 3: Implementation ── Delegating to 🤖 orchestrated-coder...
```

## Run initialization

1. **Get context**: Use `get-project-slug` and `get-ticket-id`. Resolve the diff base: use `--diff-base` if provided, otherwise use `get-default-branch`. Then compute the merge-base SHA once: run `git merge-base HEAD {diff-base}` and store the result as `{merge-base-sha}` — this concrete SHA is what you pass to all downstream agents. If no ticket ID is available, auto-generate one: `{YYYYMMDD-HHMM}Z-{4 random alphanumeric}`.
2. **Read ticket** (if available): If the ticket ID resolves to a GitHub issue, read it via `gh issue view {number}` and store the content as `{ticket-content}`. If the read fails (not a GitHub issue, CLI unavailable), continue without ticket content.
3. **Generate run ID**: `{YYYYMMDD}-{HHMMSS}Z-orchestrated` (UTC timestamp from run start)
4. **Resolve artifact directory**: Read `artifacts.base_dir` from `.agents/preferences.yaml`, falling back to `~/.agents/preferences.yaml`, then default `~/.ai`. Full path: `{base_dir}/projects/{project-slug}/tickets/{ticket-id}/{run-id}/`
5. **Create directories**: `mkdir -p {artifact-dir}`
6. **Write run-manifest artifact** to `{artifact-dir}/{timestamp}_orchestrator_run-manifest.md` where `{timestamp}` is the same UTC timestamp used in the run ID:

```markdown
# Run manifest

| Field        | Value              |
| ------------ | ------------------ |
| Timestamp    | {ISO 8601}         |
| Run ID       | {run-id}           |
| Project root | {cwd}              |
| Project slug | {slug}             |
| Ticket ID    | {ticket-id}        |
| Branch       | {branch}           |
| Model        | {model identifier} |

## Task

{full task description as provided to the orchestrator}
```

7. **Write ticket content artifact** (if available): If `{ticket-content}` is non-empty, write to `{artifact-dir}/{timestamp}_orchestrator_ticket-requirements.md`.
8. **Write external plan artifact** (if present): If an external plan was extracted from the task description, write to `{artifact-dir}/{timestamp}_orchestrator_external-plan.md`.
9. **Write initial run-index.json** to `{artifact-dir}/run-index.json` (plain filename, no timestamp or role prefix — this is the run index, not an artifact). Include artifacts from steps 7-8 in the `artifacts` array. For steps 7-8 artifacts, use role: `orchestrator`, roleType: `orchestrator`, agent: `orchestrator`, phase: `initialization`, type: `ticket-requirements` (step 7) or `external-plan` (step 8):

```json
{
  "version": 2,
  "context": {
    "runId": "{run-id}",
    "projectSlug": "{slug}",
    "ticketId": "{ticket-id}",
    "projectRoot": "{cwd}",
    "branch": "{branch}",
    "task": "{task description}",
    "startedAt": "{ISO timestamp}",
    "completedAt": null,
    "status": "in_progress",
    "phases": {},
    "phaseDecisions": {}
  },
  "config": {
    "pipeline": ["{phase names from wrapper pipeline specification}"],
    "externalPlan": false,
    "mergeBaseSha": "{merge-base-sha}",
    "diffBase": "{diff-base}",
    "maxReviewRounds": {N},
    "fixLowFindings": {true|false},
    "mode": "orchestrated",
    "model": "{model identifier}",
    "models": {
      "default": "{resolved default model}",
      "coder": "{resolved coder model}",
      "holistic_reviewer": "{resolved holistic_reviewer model}",
      "...": "(include any key explicitly set via argument, preference, or engine default)"
    }
  },
  "artifacts": [
    {
      "filename": "{timestamp}_orchestrator_ticket-requirements.md",
      "role": "orchestrator",
      "roleType": "orchestrator",
      "agent": "orchestrator",
      "type": "ticket-requirements",
      "phase": "initialization",
      "createdAt": "{ISO timestamp}"
    }
  ]
}
```

The example above shows a single artifact entry for `ticket-requirements` (step 7). If step 8 also produced an artifact, include a second entry with `type: "external-plan"`. If neither step produced an artifact, set `"artifacts": []`.

`config.pipeline` records intent (which phases were configured), not outcome. See `context.phaseDecisions` for actual execution. `config.models` records all resolved model assignments — include every key that has an explicit value (from skill argument, preference, or engine default).

10. **Register artifacts in run-index.json**: Artifacts from steps 7-8 are included in the initial `artifacts` array written in step 9 (see above for field values). For all subsequent artifacts produced during the run, append an entry to the `artifacts` array after writing each file. Each entry must include: `filename`, `role`, `roleType`, `agent`, `type`, `phase`, `createdAt`. Optional fields: `iteration` (for parallelReview artifacts), `note` (free-text context). Use the [roleType taxonomy](../_data/artifact-conventions.md#roletype-taxonomy) defined in artifact-conventions.md to populate the `roleType` field for each artifact entry. Quick reference: orchestrator -> `orchestrator`, architect -> `analyst`, planner -> `planner`, coder -> `author`, all reviewers -> `reviewer`. See [artifact entry fields](../_data/artifact-conventions.md#artifact-entry-fields) for the full field reference.

## Phase decisions

First, determine whether the task contains an **external plan** — step-by-step implementation instructions with specific file paths or code changes. If it does, set `"externalPlan": true` in `config` in run-index.json and extract the plan content for use in downstream prompts.

Record a decision in `context.phaseDecisions` for every known phase. Iterate through the complete set of known phases (`architecture`, `planning`, `implementation`, `review-cycle`) — not just the phases present in the pipeline:

1. **Phase absent from pipeline**: if no entry with that name exists in the pipeline specification, record `{ "run": false, "disposition": "absent" }`.
2. **Phase present with requirement `required`**: phase always runs. Record `{ "run": true, "disposition": "executed" }`.
3. **Phase present with requirement `optional`**: apply phase-specific skip logic (below). Record `"disposition": "executed"` or `"disposition": "skipped"` with reason.

For `review-cycle`, record a single `context.phaseDecisions` entry for the module. The module itself records sub-phase entries (`parallelReview`, `codeSimplifier`, `holisticReview`) in both `context.phaseDecisions` and `context.phases` during its execution.

The `summary` phase is not a pipeline phase — it is an inherent engine responsibility that always runs after all pipeline phases complete. It does not appear in `context.phaseDecisions`.

### Disposition values

The `disposition` field in `context.phaseDecisions` records the runtime outcome for each phase:

- `executed` — phase was started (`run: true`). Outcome (success or failure) is recorded in `phases`.
- `skipped` — phase was in the pipeline but did not run due to skip logic (`run: false`).
- `absent` — phase was not in the pipeline specification (`run: false`).

### Skip logic

**Skip Architecture if:** task is narrow, touches few files, or follows an existing pattern — **and** no external plan is present. When an external plan exists, always run Architecture to validate the plan's assumptions about codebase structure.

**Skip Planning if:** task is small enough for a single pass, or is a bug fix with clear scope. **Never skip Planning solely because the task already contains step-by-step instructions.** When an external plan exists, always run Planning so the planner can validate and produce the canonical plan artifact.

Update run-index.json with decisions before proceeding.

## Authority hierarchy

When both a ticket and an external plan are available:

1. **Ticket** — defines requirements (what to build)
2. **Plan** — proposes approach (how to build it)
3. **Architectural guidance** — constrains implementation

When a plan conflicts with the ticket, the ticket wins. Never override reviewer findings by asserting the plan is the source of truth. Tickets can become stale. Check the premises of the ticket against the actual condition of the codebase.

## Turn budgets

Always pass `max_turns` explicitly to every Task call:

| subagent_type                     | max_turns |
| :-------------------------------- | --------: |
| orchestrated-architect            |        30 |
| orchestrated-planner              |        40 |
| orchestrated-coder                |        80 |
| orchestrated-reviewer             |        30 |
| aspect-code-reviewer              |        15 |
| aspect-silent-failure-reviewer    |        15 |
| aspect-test-reviewer              |        15 |
| pr-review-toolkit:code-simplifier |        15 |
| orchestrated-reviewer (final)     |        30 |

> **Note:** `code-simplifier` remains a `pr-review-toolkit` agent because it runs sequentially in Phase 4a after all parallel reviews converge — it is not an aspect reviewer and does not participate in the Phase 4 parallel dispatch or activation logic.

## Pipeline execution

Process the pipeline by iterating through phase entries in order. For each entry:

1. **Check disposition**: if the phase decision is `skipped` or `absent`, skip it.
2. **Inline phases** (`architecture`, `planning`, `implementation`): execute the phase spec defined in this file.
3. **Module phases** (`review-cycle`): load and follow the module file using the module invocation pattern below.

After all pipeline phases complete, always execute the summary phase (Phase 5). Summary is an inherent engine responsibility, not a pipeline entry — it runs regardless of pipeline contents.

### Module invocation

To execute a module phase:

1. **Read the module file**: read `modules/{module-name}.md` (relative to this skill's directory). If the module file cannot be read, record `"status": "failed"` in `context.phases` for this phase and also record stub entries in `context.phaseDecisions` for the module's known sub-phases (for `review-cycle`: `parallelReview`, `codeSimplifier`, `holisticReview`) with `{ "run": false, "disposition": "failed", "reason": "Module file could not be loaded" }`. Then proceed to the summary phase.
2. **Prepare context variables**: set all variables listed in the module's Inputs table. See the context preparation section for each module's requirements. If a required context variable cannot be resolved, set it to an empty string and record a warning in the module's `context.phases` entry in run-index.json.
3. **Follow module instructions**: execute the module's instructions as if they were inline in this file. The module has full access to run-index.json for updates.
4. **Capture exit state**: after the module completes, read the exit state variables it produces and use them for subsequent flow control. If an expected exit state variable is missing, treat it as module failure: record `"status": "failed"` in run-index.json and proceed to the summary phase.

**Example** — invoking review-cycle:

```
1. Read modules/review-cycle.md
2. Prepare all variables from the review-cycle context preparation table below
3. Follow the module's Phase 4 → 4a → 4b instructions
4. Read {review-status} (converged | needs_manual_review)
```

## Context preparation

Before entering each module, prepare all variables listed in the module's Inputs table. See `modules/review-cycle.md` for the full list.

### review-cycle: resolving `{models}`

Pass the fully resolved models map to the module. The module uses `{models.reviewer}`, `{models.coder}`, `{models.holistic_reviewer}`, etc. to set the `model` parameter on each Task call. Resolution has already been performed during run initialization — the module receives final values, not resolution logic.

### review-cycle: resolving `{change-summary-path}`

Search the `artifacts` array in run-index.json for entries where `role` is `coder` and `type` is `change-summary`. Sort matches by `createdAt` descending and take the first entry's `filename`. Construct the full path: `{artifact-dir}/{filename}`. If no matching entries exist (e.g., first run for this ticket via `orchestrate-review`), set to an empty string.

## Phase 1: Architecture (optional)

Before: write `context.phases.architecture` to run-index.json with `status: "in_progress"` and `startedAt: {ISO timestamp}`.

Call Task with `subagent_type: orchestrated-architect`, `max_turns: 30`, `model: {models.architect}`:

> Assess the architectural impact of the following task.
>
> Task description: {task}
>
> {If `{ticket-content}` is non-empty: Ticket requirements: Read `{artifact-dir}/{timestamp}_orchestrator_ticket-requirements.md`}
>
> {If `config.externalPlan` is true: External plan (validate assumptions): Read `{artifact-dir}/{timestamp}_orchestrator_external-plan.md`}
>
> Write your analysis to: `{artifact-dir}/{timestamp}_architect_architecture.md`

After: extract `Impact` using Task return parsing. Update `context.phases.architecture` in run-index.json with `status: "completed"` (or `"failed"`), `completedAt: {ISO timestamp}`, and impact level. Pass architecture content downstream only if impact > `none`.

## Phase 2: Planning (optional)

Before: write `context.phases.planning` to run-index.json with `status: "in_progress"` and `startedAt: {ISO timestamp}`.

Call Task with `subagent_type: orchestrated-planner`, `max_turns: 40`, `model: {models.planner}`:

> Create an implementation plan for the following task.
>
> Task description: {task}
>
> {If `{ticket-content}` is non-empty: Ticket requirements: Read `{artifact-dir}/{timestamp}_orchestrator_ticket-requirements.md`}
>
> {If `config.externalPlan` is true: Reference plan (validate before adopting): Read `{artifact-dir}/{timestamp}_orchestrator_external-plan.md`}
>
> {If architecture ran and impact > `none`: Architectural guidance: Read `{artifact-dir}/{timestamp}_architect_architecture.md`}
>
> Write plan files to: `{artifact-dir}/{timestamp}_planner_orchestration-plan.md` and `{artifact-dir}/{timestamp}_planner_orchestration-plan.json`

After: extract `Steps` using Task return parsing. Update `context.phases.planning` in run-index.json with `status: "completed"` (or `"failed"`), `completedAt: {ISO timestamp}`, and step count.

## Phase 3: Implementation (required)

Before: write `context.phases.implementation` to run-index.json with `status: "in_progress"` and `startedAt: {ISO timestamp}`.

Call Task with `subagent_type: orchestrated-coder`, `max_turns: 80`, `model: {models.coder}`:

> Implement the following changes.
>
> Task description: {task}
>
> {If planning phase ran: Implementation plan: Read `{artifact-dir}/{timestamp}_planner_orchestration-plan.md`}
> {If architecture ran and impact > `none`: Architectural guidance: Read `{artifact-dir}/{timestamp}_architect_architecture.md`}
>
> Write your response to: `{artifact-dir}/{timestamp}_coder_change-summary.md`

Pass all plan steps at once — the coder decides execution order.

After: extract `Status` and `QualityGates` using Task return parsing. Update `context.phases.implementation` in run-index.json with `status: "completed"` (or `"failed"`), `completedAt: {ISO timestamp}`, and quality gates results.

## Review cycle (module)

When the pipeline includes `review-cycle`, prepare context variables (see context preparation section) and invoke `modules/review-cycle.md`. The module manages Phase 4 (parallel review), Phase 4a (code-simplifier), and Phase 4b (holistic review) internally.

After the module completes, read `{review-status}` to determine the run's final status:

- `converged` → status: `completed`
- `needs_manual_review` → status: `needs_manual_review`

## Phase 5: Summary (always)

Write run-summary artifact to `{artifact-dir}/{timestamp}_orchestrator_run-summary.md`:

```markdown
# Orchestration summary

## Task

{task description}

## Run

- **Run ID:** {run-id}
- **Ticket:** {ticket-id}
- **Status:** {completed|failed|needs_manual_review}
- **Duration:** {start} → {end}

## Phases

| Phase           | Status                         | Notes                                                               |
| --------------- | ------------------------------ | ------------------------------------------------------------------- |
| Architecture    | {ran/skipped}                  | {impact level or skip reason}{if external plan: ", plan validated"} |
| Planning        | {ran/skipped}                  | {step count or skip reason}{if external plan: ", N deviations"}     |
| Implementation  | {completed/failed}             |                                                                     |
| Review          | {approved/needs_manual_review} | {aggregated criticality, reviewers with findings, re-review ran}    |
| Code simplifier | {ran/skipped}                  | {actionable findings, fix cycle ran/not needed}                     |
| Holistic review | {ran/skipped}                  | {criticality, late-stage fixes}                                     |

## What was built

{Synthesized narrative of the end-to-end result. Describe each major component or subsystem that was implemented — what it does and why, not just file paths. Draw from the accumulated context across all coder change-summaries and review outcomes. Focus on the final state, not the iteration history.}

{If the run failed or needs manual review, describe what was completed and what remains.}

## Insights

{Notable observations that emerged during the run. Include only items worth preserving — omit this section entirely if nothing notable emerged.}

{Examples of what belongs here:}
{- Architectural patterns discovered or validated}
{- Design trade-offs surfaced during review}
{- Conventions or project-specific patterns learned}
{- Surprising findings from reviewers that revealed something non-obvious}
{- Technical debt or risks identified but not in scope to address}

## Deferred items

{Items intentionally not addressed during this run, with rationale for each.}

{Include:}
{- Deviations from reference plan (when external plan was provided)}
{- Acceptance criteria from the ticket that were intentionally not addressed}
{- Any other intentional omissions}

{Omit this section if nothing was deferred.}

## Files changed

{from git diff --name-only}
```

After writing the artifact, present the same summary to the user in the conversation. The conversational output should match the artifact content — do not abbreviate or omit sections.

Finalize run-index.json with `completedAt` timestamp and final status.

## Output contract

See [artifact-conventions.md](../_data/artifact-conventions.md) for artifact naming, flow-control field locations, and the example run directory layout.

## Task return parsing

Subagents include a structured return block at the end of their Task response. The orchestrator parses flow-control fields from this return value before falling back to reading artifact files.

**Parse format:** look for lines matching `{Key}: {value}` in the Task return. Expected fields per role:

- **Architect:** `Impact:` (`none`|`low`|`medium`|`high`)
- **Planner:** `Steps:` (integer)
- **Coder:** `Status:` (`completed`|`failed`), `QualityGates:` (`passed`|`failed`|`skipped`)
- **Reviewers:** `Criticality:` (`none`|`low`|`medium`|`high`)

All roles also return `Phase:`, `Status:`, and `Artifact:`.

**Fallback logic:** if any expected field is missing or its value is unrecognized, fall back to reading the artifact file and parsing using the existing patterns (`### Impact level:`, `### Criticality:`, step count from JSON). When fallback is triggered, record a `parseWarning` in the corresponding `phases` entry in run-index.json.

## Error handling

- **Subagent failure**: record in run-index.json, retry same phase once. If retry fails, set `"status": "failed"` and write summary.
- **maxTurns exhausted**: record as `needs_manual_review`.
- **Quality gate failure** (coder reports failing gates): treat as review finding at `critical` severity.

## Constraints

- Autonomous execution: follow flow control at every decision point without pausing for human input. Report outcomes in the summary.
- All project code changes go through `orchestrated-coder`
- All analysis goes through `orchestrated-architect`
- Don't duplicate subagent work — trust their results
- Keep context lean — only pass relevant information downstream
- All orchestration artifacts go in the artifact directory
- **Prefer exhausting iteration budget over escaping findings.** A defect that escapes to remote review costs an order of magnitude more in developer time than an additional local review cycle. Agent compute is cheap; context-switching and manual rework are not. When findings exist and review rounds remain, fix and re-review.
