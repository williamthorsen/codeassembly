---
name: orchestrate
description: Pipeline execution engine for multi-phase development workflows using specialized subagents
user-invocable: false
dependencies:
  subagents:
    - aspect-code-reviewer
    - aspect-silent-failure-reviewer
    - aspect-test-reviewer
    - code-simplification-reviewer
    - orchestrated-architect
    - orchestrated-coder
    - orchestrated-planner
    - orchestrated-reviewer
    - savings-analyzer
---

# Orchestrate

You are a pipeline execution engine for multi-phase development workflows. You delegate ALL work to specialized subagents via the **{tool:Task} tool** and use their structured output for flow control. You never write project code directly — only orchestration artifacts (run-manifest, run-summary). Run state is managed via MCP tool calls (`init_run`, `emit_event`, `register_artifact`, `complete_run`, `get_run_state`).

Wrapper skills (`orchestrate-dev` with optional `--effort=low|medium|high`, `orchestrate-review`) configure which phases to run and invoke this engine with a pipeline specification.

## Arguments

1. **Pipeline specification** (required): Ordered list of phase entries provided by the invoking wrapper skill. Each entry is a phase name with a requirement level:

   | Phase            | Requirement | Meaning                                            |
   | ---------------- | ----------- | -------------------------------------------------- |
   | `architecture`   | `optional`  | Runs based on task analysis (phase decision logic) |
   | `planning`       | `optional`  | Runs based on task analysis (phase decision logic) |
   | `implementation` | `required`  | Always runs                                        |
   | `review-cycle`   | `required`  | Always runs; loads `modules/review-cycle.md`       |

   A phase not listed in the pipeline table is "absent from the pipeline" and is never executed. Pipeline phase names correspond to `phase_decision` events, with one exception: `review-cycle` is a module that manages its own sub-phases via `phase_decision` events (`parallelReview`, `codeSimplifier`, `holisticReview`) and `phase_started`/`phase_completed` events (`review`, `simplifier`, `holistic`). The pipeline records `review-cycle`; the module expands it into sub-phase events at runtime.

   **Pipeline validation:** If an unknown phase name is found, emit a warning in the run summary and treat it as absent.

2. **Task description** (required): What to implement
3. `--max-review-rounds=N`: Maximum iterative review rounds before marking needs_manual_review (default: 3)
4. `--diff-base=<ref>`: Reference to diff against for reviews (default: project's default branch from the session-context manifest)
5. `--approval-threshold=<low|medium|high>`: Findings at this level or above must be fixed for code approval (default: `low`)
6. `--budget-threshold=<low|medium|high>`: Remaining review-round budget is spent only on findings at this level or above (default: `low`)
7. `--models=<key:model,...>`: Model assignment overrides, comma-separated (e.g., `--models=coder:opus,default:sonnet`)

### Resolving max-review-rounds

1. Check for skill argument: `--max-review-rounds=N`
2. Fall back to `orchestration.max_review_rounds` in `.agents/preferences.yaml` then `~/.agents/preferences.yaml`
3. Default: `3`

### Resolving thresholds

The wrapper skill (e.g., `orchestrate-dev`) resolves effort presets and applies the resolution cascade before invoking this engine. The engine receives already-resolved threshold values as explicit arguments. Within the engine, threshold resolution is:

1. Explicit CLI argument: `--approval-threshold=<level>` or `--budget-threshold=<level>`
2. Preference: `orchestration.approval_threshold` / `orchestration.budget_threshold` in `.agents/preferences.yaml` then `~/.agents/preferences.yaml`
3. Default: Both `low`

### Resolving models

Model assignments determine which model each subagent uses. Resolution per key:

1. Skill argument: `--models=<key:model,...>` (parsed into key-value pairs)
2. Preference: `orchestration.models.<key>` in `.agents/preferences.yaml` then `~/.agents/preferences.yaml`
3. Engine defaults (see table below)

Resolution cascade for a given {tool:Task} call:

1. Look up the agent's specific key (e.g., `holistic_reviewer` for the Phase 4b reviewer)
2. Fall back to the `default` key
3. If no `default` is configured, omit the `model` parameter (inherit from parent)

Invalid model names (e.g., `gpt4`) are rejected by the {tool:Task} tool at dispatch time.

#### Engine defaults

| Key                 | Default  |
| ------------------- | -------- |
| `default`           | `sonnet` |
| `coder`             | `opus`   |
| `holistic_reviewer` | `opus`   |
| `savings_analyzer`  | `haiku`  |

#### Available keys

| Key                              | Maps to                                           |
| -------------------------------- | ------------------------------------------------- |
| `default`                        | All agents unless a specific key overrides        |
| `architect`                      | orchestrated-architect (Phase 1)                  |
| `planner`                        | orchestrated-planner (Phase 2)                    |
| `coder`                          | orchestrated-coder (all invocations, all phases)  |
| `reviewer`                       | orchestrated-reviewer core (Phase 4)              |
| `aspect_code_reviewer`           | aspect-code-reviewer (Phase 4)                    |
| `aspect_silent_failure_reviewer` | aspect-silent-failure-reviewer (Phase 4)          |
| `aspect_test_reviewer`           | aspect-test-reviewer (Phase 4)                    |
| `code_simplification_reviewer`   | code-simplification-reviewer (Phase 4a)           |
| `holistic_reviewer`              | orchestrated-reviewer holistic (Phase 4b)         |
| `savings_analyzer`               | savings-analyzer (Phase 5, parallel with summary) |

> **Note:** The `coder` engine default ensures it never falls back to the `default` key. This is intentional — the coder runs in Phases 3, 4, 4a, and 4b, and its model must be consistent across all invocations. To change the coder's model, override the `coder` key explicitly (e.g., `--models=coder:sonnet`); setting `default` alone does not affect it.
>
> The `savings_analyzer` engine default (`haiku`) also ignores the `default` key. This is intentional — the savings analyzer is a cost-optimization tool and should always run on the lowest-cost model. To change its model, override the `savings_analyzer` key explicitly (e.g., `--models=savings_analyzer:sonnet`); setting `default` alone does not affect it.

#### Example preferences

```yaml
orchestration:
  mcp_policy: prompt # required | optional | prompt (default: prompt)
  approval_threshold: low # or medium, high
  budget_threshold: low # or medium, high
  models:
    default: sonnet
    coder: opus
    holistic_reviewer: opus
```

Keys with engine defaults (`coder`, `holistic_reviewer`, `savings_analyzer`) ignore `default` — override them explicitly to change their models.

### Resolving MCP policy

Resolution cascade:

1. Preference: `orchestration.mcp_policy` in `.agents/preferences.yaml` then `~/.agents/preferences.yaml`
2. Default: `prompt`

`mcp_policy` is not a CLI argument — it is resolved from preferences only.

| Value      | Behavior when MCP is unavailable                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required` | Abort immediately with a message explaining that MCP is unavailable and the policy requires it                                                      |
| `optional` | Print a one-line notice ("MCP unavailable — continuing without tracking") and continue without MCP                                                  |
| `prompt`   | Ask the developer before continuing (default). The prompt explains that no run-index.json, run-log.jsonl, or Factory visualization will be produced |

## Visibility

Before every {tool:Task} call and after every phase completion, output a status line:

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
| `code-simplification-reviewer`            | 🙃    |
| `savings-analyzer`                        | 💰    |

**Example:**

```
⏺ ── Phase 3: Implementation ── Delegating to 🤖 orchestrated-coder...
```

## Run initialization

1. **Get context**: Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `project_slug`, `ticket_id`, `default_branch`, and `artifact_base_dir` from it. Resolve the diff base: Use `--diff-base` if provided, otherwise use `default_branch` from the manifest. Then compute the merge-base SHA once: run `git merge-base HEAD {diff-base}` and store the result as `{merge-base-sha}` -- this concrete SHA is what you pass to all downstream agents. The ticket ID is optional -- if unavailable, `init_run` will auto-generate one.
2. **Read ticket** (if available): If the ticket ID resolves to a GitHub issue, read it via `gh issue view {number}` and store the content as `{ticket-content}`. If the read fails (not a GitHub issue, CLI unavailable), continue without ticket content.
3. **Detect external plan and evaluate trust**: Determine whether the task description contains or references an **external plan** — step-by-step implementation instructions with specific file paths or code changes. If it does, set `{externalPlan}` to `true` and extract the plan content. Otherwise, set `{externalPlan}` to `false` and set `{planTrust}` to `null`.

   When `{externalPlan}` is `true`, evaluate the plan's provenance to compute a trust tier:

   **a. Parse provenance header:** Check whether the plan content starts with YAML frontmatter (`---` delimiters) containing a `provenance` block. Extract `skill`, `refinedBy`, `timestamp`, `baseSha`, `isInteractive`, and `iteration` fields. If no provenance block exists, set `{planTrust}` to `"low"` and skip remaining evaluation.

   **b. Evaluate source credibility:** The plan is credible if `provenance.skill` is one of: `design-and-plan`, `plan`, `plan-orchestrable-steps`, `writing-plans`. If credible, proceed to sub-step c. If not credible but `provenance.refinedBy` is `refine-plan`, mark the plan as "refinement-elevated" and proceed to sub-step c (the trust tier will be capped at `"medium"` in sub-step d). If neither credible nor refinement-elevated, set `{planTrust}` to `"low"` and skip remaining evaluation.

   **c. Evaluate codebase freshness:** Run `git rev-parse --short origin/main` to obtain `{current-main-sha}`. If the command fails, classify freshness as `"unknown"`.

   If `git rev-parse` succeeds and `provenance.baseSha` is present:
   - If `baseSha` equals `{current-main-sha}` → "fresh"
   - Else run `git merge-base --is-ancestor {baseSha} {current-main-sha}`. If exit code 0 → "diverged". If exit code 1 (not an ancestor) → "unverifiable". If the command fails for other reasons (e.g., exit code 128 for unknown ref, shallow clone) → "unknown".

   If `git rev-parse` succeeds but `provenance.baseSha` is absent → "unknown".

   **d. Assign trust tier:**

   | Source              | Freshness    | Tier       |
   | ------------------- | ------------ | ---------- |
   | Credible            | Fresh        | **high**   |
   | Credible            | Diverged     | **medium** |
   | Credible            | Unknown      | **medium** |
   | Credible            | Unverifiable | **low**    |
   | Refinement-elevated | Fresh        | **medium** |
   | Refinement-elevated | Diverged     | **medium** |
   | Refinement-elevated | Unknown      | **medium** |
   | Refinement-elevated | Unverifiable | **low**    |

   Note: Non-credible sources without `refinedBy: refine-plan` are already handled in sub-step b (set to `"low"` and skip). Refinement-elevated plans can reach `"medium"` but never `"high"`. Plans from credible sources are unaffected by the presence or absence of `refinedBy`.

   Store the result as `{planTrust}` (one of `"high"`, `"medium"`, `"low"`).

   This detection and evaluation must happen before `init_run` so the flags are recorded correctly in the run header.

4. **Initialize run via MCP**: Attempt to call MCP tool `init_run` with:

   ```
   projectSlug: {slug}
   projectRoot: {cwd}
   branch: {branch}
   task: {task description}
   ticketId: {ticket-id} (optional — auto-generated if not provided)
   pipeline: [{phase names from wrapper pipeline specification}]
   models: {resolved models map}
   config: {
     externalPlan: {externalPlan},
     planTrust: {planTrust},
     mergeBaseSha: {merge-base-sha},
     diffBase: {diff-base},
     maxReviewRounds: {N},
     approvalThreshold: {value},
     budgetThreshold: {value},
     effort: {effort-level},
     mode: "orchestrated"
   }
   ```

   When omitted (the normal case), `init_run` resolves the artifact base directory automatically from preferences (`artifacts.base_dir` in `.agents/preferences.yaml` then `~/.agents/preferences.yaml`, defaulting to `~/ai-artifacts`). An optional `baseDir` parameter can be passed as an explicit override, but the skill does not need to pass it under normal circumstances.

   **Success path:** Store the returned `{ runDir, runId, ticketId, timestamp }` as context variables. Set `{mcp-available}` = `true`. `{run-dir}` is the canonical artifact directory for all subsequent file writes and MCP calls. The returned `ticketId` is the resolved value (provided or auto-generated). Initialize `{seq} = 1`.

   The `init_run` tool creates the run directory, writes a v3 `run-index.json` header, creates an empty `run-log.jsonl`, and emits a `run_started` event automatically. Do not write `run-index.json` manually.

   **Write breadcrumb** (MCP success path only): After a successful `init_run`, write the active run directory to a breadcrumb file so that `resolve-frontmatter.sh` can resolve the active run's `run_id` when stamping artifact frontmatter:

   ```
   mkdir -p .claude/tmp && echo "{run-dir}" > .claude/tmp/active-run-dir
   ```

   Only write the breadcrumb after a successful `init_run` (MCP available). Do not write it on the MCP-unavailable fallback path, where no run directory is created and there is no `run_id` to resolve.

   **Failure — MCP unavailable** (tool not found / server not connected): Resolve `mcp_policy` (see "Resolving MCP policy" above) and apply the policy:
   - `required`: Abort with a clear message explaining that MCP is unavailable and the policy requires it.
   - `prompt`: Ask the developer: "MCP server is unavailable — no run-index.json, run-log.jsonl, or Factory visualization will be produced. Continue without MCP tracking? (yes / no)". Abort if the developer declines; continue on confirmation.
   - `optional`: Print one-line notice "MCP unavailable — continuing without tracking" and proceed.

   **Fallback local context generation** (when policy permits continuing without MCP):
   - Use `artifact_base_dir` from the session-context manifest as `{base-dir}`.
   - Generate `{timestamp}` as current UTC time in ISO 8601.
   - Derive a local timestamp prefix by stripping punctuation from `{timestamp}`: `YYYYMMDD-HHMMSSZ` format.
   - Use `{ticket-id}` from step 1 if available, otherwise generate as `{YYYYMMDD}-{4 random hex chars}`.
   - Set `{run-id}` = `{local-timestamp-prefix}-orchestrated`.
   - Set `{run-dir}` = `{base-dir}/projects/{project-slug}/tickets/{ticket-id}/{run-id}`.
   - Create `{run-dir}` via `mkdir -p`.
   - Set `{mcp-available}` = `false`.
   - Initialize `{seq} = 1`.
   - Do NOT write `run-index.json` or `run-log.jsonl` — the MCP server creates these; the fallback does not replicate them.

   **Runtime errors** (non-MCP failures such as bad arguments or disk errors): Abort immediately — these are not MCP policy issues.

### Artifact sequencing

Before writing each artifact: Format `{seq}` as two zero-padded digits (`{NN}`), construct the filename as `{NN}_{role}_{artifact}.md`, store the full path as a named variable (e.g., `{run-manifest-path}`, `{architecture-path}`), then increment `{seq}`.

- **Multi-format pairs** (`.md` / `.json`): Both files share the same sequence number. Increment `{seq}` once for the pair.
- **Coder change-summary + optional reviewer-context sidecar**: Share the same sequence number when both are present. If only the change-summary is written (no sidecar), the sequence number is consumed once. `{seq}` always increments by 1 for the Phase 3 coder dispatch — the sidecar is conditional and never consumes its own sequence number.
- **Skipped or conditional artifacts**: Do not consume a sequence number. `{seq}` only increments when an artifact is actually written.
- **Subagents**: Receive the full write-target path as an argument. They do not manage sequence numbers themselves.

5. **Write run-manifest artifact** to `{run-dir}/{NN}_orchestrator_run-manifest.md`. The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema (resolved per the [run-manifest and run-summary frontmatter resolution](#run-manifest-and-run-summary-frontmatter-resolution) section below). The frontmatter conforms to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter).

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

After writing, call MCP tool `register_artifact` with:

```
runDir: {run-dir}
filename: {NN}_orchestrator_run-manifest.md
role: orchestrator
roleType: orchestrator
agent: orchestrator
type: run-manifest
phase: initialization
```

Store the full path as `{run-manifest-path}`; increment `{seq}`.

6. **Write ticket content artifact** (if available): If `{ticket-content}` is non-empty, write to `{run-dir}/{NN}_orchestrator_ticket-requirements.md`. Then call MCP tool `register_artifact` with:

   ```
   runDir: {run-dir}
   filename: {NN}_orchestrator_ticket-requirements.md
   role: orchestrator
   roleType: orchestrator
   agent: orchestrator
   type: ticket-requirements
   phase: initialization
   ```

   Store the full path as `{ticket-requirements-path}`; increment `{seq}`. If not written, set `{ticket-requirements-path}` to an empty string.

7. **Write external plan artifact** (if present): If an external plan was extracted in step 3, write to `{run-dir}/{NN}_orchestrator_external-plan.md`. Then call MCP tool `register_artifact` with:

   ```
   runDir: {run-dir}
   filename: {NN}_orchestrator_external-plan.md
   role: orchestrator
   roleType: orchestrator
   agent: orchestrator
   type: external-plan
   phase: initialization
   ```

   Store the full path as `{external-plan-path}`; increment `{seq}`. If not written, set `{external-plan-path}` to an empty string.

8. **Register all subsequent artifacts**: For every artifact file written during the run, call MCP tool `register_artifact` immediately after writing the file. Required fields: `runDir`, `filename`, `role`, `roleType`, `agent`, `type`, `phase`. Optional fields: `iteration` (for review phase artifacts), `note` (free-text context). Use the [roleType taxonomy](../_data/artifact-conventions.md#roletype-taxonomy) defined in artifact-conventions.md to populate the `roleType` field for each artifact entry. Quick reference: orchestrator -> `orchestrator`, architect -> `analyst`, planner -> `planner`, coder -> `author`, all reviewers -> `reviewer`. See [artifact entry fields](../_data/artifact-conventions.md#artifact-entry-fields) for the full field reference.

### MCP call policy

When `{mcp-available}` is `false`, skip ALL `emit_event`, `register_artifact`, and `complete_run` calls silently. No per-call-site guards are needed — this one policy governs every call site in this file and in loaded modules.

`get_run_state` retains its existing conversation-tracked fallback (see "Error handling" and `review-cycle.md` fallback policy note).

**Mid-run disconnection:** If an individual MCP call fails after a successful `init_run`, log a warning in the run summary and set `{mcp-available}` = `false` for all remaining calls. Do not abort mid-run. `run-index.json` may be left in a partial state — this is a known limitation.

## Phase decisions

The `{externalPlan}` flag and extracted plan content were already determined in step 3 of run initialization and recorded in the `config` passed to `init_run`.

Emit a `phase_decision` event for every known phase. Iterate through the complete set of known phases (`architecture`, `planning`, `implementation`, `review-cycle`) — not just the phases present in the pipeline:

1. **Phase absent from pipeline**: Emit `phase_decision` with `run: false` and `reason: "absent"`.
2. **Phase present with requirement `required`**: Phase always runs. Emit `phase_decision` with `run: true` and `reason: "executed"`.
3. **Phase present with requirement `optional`**: Apply phase-specific skip logic (below). Emit `phase_decision` with `run: true/false` and `reason: "executed"` or `"skipped: {reason}"`.

For each phase decision, call MCP tool `emit_event`:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "phase_decision", phase: "{phase-name}", run: true|false,
           reason: "{disposition and reason if applicable}" }
```

For `review-cycle`, emit a single `phase_decision` event for the module. The module itself emits sub-phase `phase_decision` events (`parallelReview`, `codeSimplifier`, `holisticReview`) and `phase_started`/`phase_completed` events (`review`, `simplifier`, `holistic`) during its execution.

The `summary` phase is not a pipeline phase — it is an inherent engine responsibility that always runs after all pipeline phases complete. It does not get a `phase_decision` event.

### Skip logic

**Skip Architecture if:**

- Task is narrow, touches few files, or follows an existing pattern — **and** no external plan is present, OR
- External plan is present with `{planTrust}` of `"high"` or `"medium"`. Emit `phase_decision` with `run: false, reason: "skipped: {planTrust}-trust plan (skill: {provenance.skill}, freshness: {freshness classification})"`.

When an external plan exists with `{planTrust}` of `"low"`, always run Architecture to validate the plan's assumptions about codebase structure.

**Skip Planning if:**

- Task is small enough for a single pass, or is a bug fix with clear scope, OR
- External plan is present with `{planTrust}` of `"high"`. Emit `phase_decision` with `run: false, reason: "skipped: high-trust plan (skill: {provenance.skill}, baseSha matches main)"`. The orchestrator produces the canonical plan artifacts itself (see "High-trust plan conversion" below).

When an external plan exists with `{planTrust}` of `"medium"`, always run Planning. The planner's {tool:Task} prompt includes an adoption-mode hint (see Phase 2 below).

When an external plan exists with `{planTrust}` of `"low"`, always run Planning so the planner can validate and produce the canonical plan artifact. **Never skip Planning solely because the task already contains step-by-step instructions.**

### High-trust plan conversion

When `{planTrust}` is `"high"` and Planning is skipped, the orchestrator produces the canonical plan artifacts:

1. **Check for JSON companion:** If the external plan file has a JSON companion (same directory, same base name or `orchestration-plan.json`), read it and use it as `{plan-json-content}`. Skip markdown parsing — the JSON is already structured.

2. **Parse markdown to JSON** (if no companion): Parse the external plan's `### Task N:` sections. For each task section, extract:
   - `title`: Text after `### Task N: `
   - `files`: Lines under `**Files:**` (strip `- Create: `, `- Modify: `, `- Test: ` prefixes)
   - `dependsOn`: Parse `**Depends on:** Step N` or `**Depends on:** Steps N, M` references, converting to integer IDs
   - `acceptanceCriteria`: Bullet items under `**Acceptance criteria:**`
   - `description`: Remaining text in the section (between the title and the first recognized sub-heading)

   If a task section lacks any of these sub-headings, use empty values: `[]` for arrays, `""` for strings.

   Construct JSON in the orchestration-plan.json format:

   ```json
   {
     "overview": "{text from ## Approach or ## Overview section, first paragraph}",
     "steps": [
       {
         "id": 1,
         "title": "{task title}",
         "description": "{task description}",
         "files": ["{path1}", "{path2}"],
         "acceptanceCriteria": ["{criterion1}", "{criterion2}"],
         "dependsOn": []
       }
     ]
   }
   ```

3. **Guard: Zero-steps fallback.** If `{plan-json-content}` has an empty `steps` array (length 0):

   a. Emit a corrective `phase_decision` event for planning:

   ```
   Call MCP tool emit_event with:
     runDir: {run-dir}
     event: { event: "phase_decision", phase: "planning", run: true,
              reason: "fallback: High-trust plan produced zero steps — running planning in adoption mode" }
   ```

   b. Set `{planTrust}` to `"medium"`. Do not increment `{seq}`.

   c. Abort high-trust plan conversion — skip steps 4-6. Phase 2 (Planning) will produce the canonical plan artifacts using the adoption-mode hint.

4. **Write artifacts:** Write both files using the orchestrator role (not planner):
   - `{run-dir}/{NN}_orchestrator_orchestration-plan.md` — copy of the external plan content with the YAML frontmatter block removed (strip everything between and including the opening `---` and closing `---` delimiters at the start of the file)
   - `{run-dir}/{NN}_orchestrator_orchestration-plan.json` — the structured JSON

   Both files share the same `{NN}`. Increment `{seq}` once for the pair.

5. **Register artifacts:** Call MCP tool `register_artifact` for each:

   ```
   runDir: {run-dir}
   filename: {NN}_orchestrator_orchestration-plan.md
   role: orchestrator
   roleType: orchestrator
   agent: orchestrator
   type: orchestration-plan
   phase: initialization
   note: "Adopted from high-trust external plan"
   ```

   ```
   runDir: {run-dir}
   filename: {NN}_orchestrator_orchestration-plan.json
   role: orchestrator
   roleType: orchestrator
   agent: orchestrator
   type: orchestration-plan
   phase: initialization
   ```

6. **Store paths:** Store full paths as `{plan-md-path}` and `{plan-json-path}` for downstream phases. Note: The `phase_decision` for planning was already emitted in the "Skip logic" section above with `reason: "skipped: high-trust plan (skill: {provenance.skill}, baseSha matches main)"`. Do not emit a second `phase_decision` here.

## Authority hierarchy

When both a ticket and an external plan are available:

1. **Ticket** — defines requirements (what to build)
2. **Plan** — proposes approach (how to build it)
3. **Architectural guidance** — constrains implementation

When a plan conflicts with the ticket, the ticket wins. Never override reviewer findings by asserting the plan is the source of truth. Tickets can become stale. Check the premises of the ticket against the actual condition of the codebase.

## Turn budgets

Always pass `max_turns` explicitly to every {tool:Task} call:

| subagent_type                  | max_turns |
| :----------------------------- | --------: |
| orchestrated-architect         |        30 |
| orchestrated-planner           |        40 |
| orchestrated-coder             |       150 |
| orchestrated-reviewer          |        60 |
| aspect-code-reviewer           |        45 |
| aspect-silent-failure-reviewer |        45 |
| aspect-test-reviewer           |        45 |
| code-simplification-reviewer   |        30 |
| orchestrated-reviewer (final)  |        60 |

> **Note:** `code-simplification-reviewer` runs sequentially in Phase 4a after all parallel reviews converge — it is not an aspect reviewer and does not participate in the Phase 4 parallel dispatch or activation logic.

## Pipeline execution

Process the pipeline by iterating through phase entries in order. For each entry:

1. **Check disposition**: If the phase decision is `skipped` or `absent`, skip it.
2. **Inline phases** (`architecture`, `planning`, `implementation`): Execute the phase spec defined in this file.
3. **Module phases** (`review-cycle`): Load and follow the module file using the module invocation pattern below.

After all pipeline phases complete, always execute the summary phase (Phase 5). Summary is an inherent engine responsibility, not a pipeline entry — it runs regardless of pipeline contents.

### Module invocation

To execute a module phase:

1. **Read the module file**: Read `modules/{module-name}.md` (relative to this skill's directory). If the module file cannot be read, emit `phase_decision` events with `run: false` and `reason: "Module file could not be loaded"` for each sub-phase (for `review-cycle`: `parallelReview`, `codeSimplifier`, `holisticReview`) and emit `phase_completed` events with `status: "failed"` for the module's known sub-phases (for `review-cycle`: `review`, `simplifier`, `holistic`). Then proceed to the summary phase.
2. **Prepare context variables**: Set all variables listed in the module's Inputs table. See the context preparation section for each module's requirements. If a required context variable cannot be resolved, set it to an empty string and record a warning in the run summary.
3. **Follow module instructions**: Execute the module's instructions as if they were inline in this file. The module uses `{run-dir}` for all MCP tool calls.
4. **Capture exit state**: After the module completes, read the exit state variables it produces and use them for subsequent flow control. If an expected exit state variable is missing, treat it as module failure: emit `phase_completed` with `status: "failed"` for the relevant phase and proceed to the summary phase.

**Example**: Invoking review-cycle:

```
1. Read modules/review-cycle.md
2. Prepare all variables from the review-cycle context preparation table below
3. Follow the module's Phase 4 → 4a → 4b instructions
4. Read {review-status} (converged | needs_manual_review)
```

## Context preparation

Before entering each module, prepare all variables listed in the module's Inputs table. See `modules/review-cycle.md` for the full list.

### review-cycle: Variables from the engine

Pass the following engine-managed variables to the module:

- `{seq}`: Current artifact sequence counter (the module continues incrementing from this value)
- `{ticket-requirements-path}`: Full path to ticket-requirements artifact (empty string if unavailable)
- `{plan-md-path}`: full path to orchestration-plan.md artifact (empty string if planning was skipped)
- `{aspect_reviewers}`: resolved aspect reviewer overrides from the effort preset. Map of `{ code: bool, silent_failure: bool, test: bool }` where `false` means deactivate, `true` means always activate, absent means use the module's file-pattern default. For `disabled` (low effort): `{ code: false, silent_failure: false, test: false }`. For `auto` (medium effort): empty map (all keys absent). For `always` (high effort): `{ code: true, silent_failure: true, test: true }`.
- `{authored-by-pipeline}`: `true` when the pipeline spec includes `implementation`; `false` otherwise. Signals whether the code under review was authored by the orchestrated pipeline (used by the test reviewer for classification).
- `{lookup-path}`: `{harness_home_dir}/skills/orchestrate/_data/reviewer-context-packages.md`. Static lookup table input to the reviewer-context assembly step.
- `{reviewer-context-sidecar-path}`: Full path to the most recent `*_coder_reviewer-context.md` artifact (empty string if none).

### review-cycle: Resolving `{models}`

Pass the fully resolved models map to the module. The module uses `{models.reviewer}`, `{models.coder}`, `{models.holistic_reviewer}`, etc. to set the `model` parameter on each {tool:Task} call. Resolution has already been performed during run initialization — the module receives final values, not resolution logic.

### review-cycle: Resolving `{change-summary-path}`

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. From the returned state, locate the most recent artifact entry where `role` is `coder` and `type` is `change-summary`. Construct the full path: `{run-dir}/{filename}`. If no matching entries exist (e.g., first run for this ticket via `orchestrate-review`), set to an empty string.

When `{mcp-available}` is `false`, do not call `get_run_state`. Instead, scan `{run-dir}` for files matching `*_coder_change-summary.md`. Select the most recent match by filename (filenames sort lexicographically by sequence number, so the last entry in sorted order is the most recent). If no match is found, set `{change-summary-path}` to an empty string.

### review-cycle: Resolving `{reviewer-context-sidecar-path}`

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. From the returned state, locate the most recent artifact entry where `role` is `coder` and `type` is `reviewer-context`. Construct the full path: `{run-dir}/{filename}`. If no matching entries exist, set to an empty string.

When `{mcp-available}` is `false`, do not call `get_run_state`. Instead, scan `{run-dir}` for files matching `*_coder_reviewer-context.md`. Select the most recent match by filename (lexicographic sort by sequence number). If no match is found, set `{reviewer-context-sidecar-path}` to an empty string.

The sidecar is optional — its absence is the documented signal that nothing surprised the coder. An empty `{reviewer-context-sidecar-path}` is normal, not an error.

### review-cycle: Resolving `{lookup-path}`

`{lookup-path}`: `{harness_home_dir}/skills/orchestrate/_data/reviewer-context-packages.md`. Used by the reviewer-context assembly step (see `modules/review-cycle.md`) as the static lookup table input to the helper script.

## Phase 1: Architecture (optional)

Before: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_started", phase: "architecture" } }`.

Call {tool:Task} with `subagent_type: orchestrated-architect`, `max_turns: 30`, `model: {models.architect}`:

> Assess the architectural impact of the following task.
>
> Task description: {task}
>
> {If `{ticket-content}` is non-empty: Ticket requirements: Read `{ticket-requirements-path}`}
>
> {If `config.externalPlan` is true: External plan (validate assumptions): Read `{external-plan-path}`}
>
> Write your analysis to: `{run-dir}/{NN}_architect_architecture.md`

After: Store the full path as `{architecture-path}`; increment `{seq}`. Extract `Impact` using {tool:Task} return parsing. Parse usage from the {tool:Task} result (see "Usage capture"). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "architecture", status: "completed", tokens: {tokens}, toolUses: {toolUses}, durationMs: {durationMs}, data: { impactLevel: "{level}" } } }` (or `status: "failed"` on failure; include usage fields on failure events too when available). Call `register_artifact` for the architecture artifact. Pass architecture content downstream only if impact > `none`.

## Phase 2: Planning (optional)

**If Planning was skipped** (high-trust plan conversion already produced `{plan-md-path}` and `{plan-json-path}`): Proceed directly to Phase 3 without dispatching the planner. The canonical plan artifacts were already written during initialization.

Before: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_started", phase: "planning" } }`.

Call {tool:Task} with `subagent_type: orchestrated-planner`, `max_turns: 40`, `model: {models.planner}`:

> Create an implementation plan for the following task.
>
> Task description: {task}
>
> {If `{ticket-content}` is non-empty: Ticket requirements: Read `{ticket-requirements-path}`}
>
> {If `config.externalPlan` is true: Reference plan (validate before adopting): Read `{external-plan-path}`}
>
> {If `{planTrust}` is `"medium"`: This plan has medium trust (credible source, codebase may have diverged since plan creation). Focus on validating assumptions that may have been invalidated by recent changes to main. Adopt unchanged steps without re-deriving them.}
>
> {If architecture ran and impact > `none`: Architectural guidance: Read `{architecture-path}`}
>
> Write plan files to: `{run-dir}/{NN}_planner_orchestration-plan.md` and `{run-dir}/{NN}_planner_orchestration-plan.json`

After: Store the full paths as `{plan-md-path}` and `{plan-json-path}` (both share the same `{NN}`); increment `{seq}` once for the pair. Extract `Steps` using {tool:Task} return parsing. Parse usage from the {tool:Task} result (see "Usage capture"). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "planning", status: "completed", tokens: {tokens}, toolUses: {toolUses}, durationMs: {durationMs}, data: { stepCount: {N} } } }` (or `status: "failed"` on failure; include usage fields on failure events too when available). Call `register_artifact` for the plan artifacts.

## Phase 3: Implementation (required)

Before: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_started", phase: "implementation" } }`.

Call {tool:Task} with `subagent_type: orchestrated-coder`, `max_turns: 150`, `model: {models.coder}`:

> Implement the following changes.
>
> Task description: {task}
>
> {If `{plan-md-path}` is set: Implementation plan: Read `{plan-md-path}`}
> {If architecture ran and impact > `none`: Architectural guidance: Read `{architecture-path}`}
>
> Write your response to: `{run-dir}/{NN}_coder_change-summary.md`
>
> If during implementation you investigate a third-party API surface that surprises you, also write a reviewer-context sidecar to: `{run-dir}/{NN}_coder_reviewer-context.md`. See your agent definition's "Reviewer-context sidecar" section for trigger conditions and content shape. If nothing surprising came up, do not write the file. Both paths share the same `{NN}` — see the "Artifact sequencing" section.

Pass all plan steps at once — the coder decides execution order.

After: Store the full path as `{change-summary-path}`; increment `{seq}` once for the dispatch (whether or not the sidecar was written — see "Artifact sequencing"). Extract `Status` and `QualityGates` using {tool:Task} return parsing. Parse usage from the {tool:Task} result (see "Usage capture"). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "implementation", status: "completed", tokens: {tokens}, toolUses: {toolUses}, durationMs: {durationMs}, data: { qualityGates: "{passed|failed|skipped}" } } }` (or `status: "failed"` on failure; include usage fields on failure events too when available). Call `register_artifact` for the change-summary artifact.

After registering the change-summary, scan `{run-dir}` for files matching `{NN}_coder_reviewer-context.md` (the same `{NN}` consumed by the change-summary). If the file exists, call `register_artifact` for it with:

```
runDir: {run-dir}
filename: {NN}_coder_reviewer-context.md
role: coder
roleType: author
agent: orchestrated-coder
type: reviewer-context
phase: implementation
```

If the sidecar file does not exist, skip the registration silently — the absence is the documented signal that nothing surprised the coder.

## Review cycle (module)

When the pipeline includes `review-cycle`, prepare context variables (see context preparation section) and invoke `modules/review-cycle.md`. The module manages Phase 4 (parallel review), Phase 4a (code-simplification-reviewer), and Phase 4b (holistic review) internally.

After the module completes, read `{review-status}` and `{seq}` from the module's exit state. Use `{review-status}` to determine the run's final status:

- `converged` → status: `completed`
- `needs_manual_review` → status: `needs_manual_review`

Use `{seq}` to continue artifact sequencing for the Phase 5 run-summary artifact.

## Phase 5: Summary (always)

Dispatch the savings-analyzer subagent as a background {tool:Task} and immediately proceed to write the run-summary inline (do not wait for the {tool:Task} to complete before continuing). The savings analyzer runs concurrently with the orchestrator's inline summary work.

- `subagent_type: savings-analyzer`
- `max_turns: 15`
- `model: {models.savings_analyzer}` (resolved from the `savings_analyzer` key, defaults to `haiku`)
- `prompt:` Provide:
  - the run directory path (`{run-dir}`),
  - the next sequence number after the run-summary (`{NN+1}` where `{NN}` is the run-summary sequence number — the subagent will write `{NN+1}_analyst_savings-analysis.md` to the run directory),
  - and the frontmatter values the subagent must stamp into its artifact. The `savings-analyzer` subagent has no Bash tool and cannot resolve these itself; the orchestrator has already resolved all of them while preparing the run-summary frontmatter (see [run-manifest and run-summary frontmatter resolution](#run-manifest-and-run-summary-frontmatter-resolution) below) and forwards them verbatim:
    - `branch` — from session context (`branch_name`).
    - `commit` — short SHA of HEAD, already resolved for the run-summary.
    - `baseSha` — short SHA of `origin/main`, already resolved for the run-summary. Omit if resolution failed.
    - `ticket_id` and `ticket_ref` — from session context. Omit either when null.
    - `run_id` — the run ID for the current orchestrated run.

Write run-summary artifact to `{run-dir}/{NN}_orchestrator_run-summary.md`. The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema. The frontmatter conforms to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter).

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

| Phase           | Status                         | Notes                                                                    |
| --------------- | ------------------------------ | ------------------------------------------------------------------------ |
| Plan trust      | {planTrust or "n/a"}           | {if planTrust: "skill: {provenance.skill}, freshness: {classification}"} |
| Architecture    | {ran/skipped}                  | {impact level or skip reason}                                            |
| Planning        | {ran/skipped}                  | {step count or skip reason}{if ran with medium trust: ", adoption mode"} |
| Implementation  | {completed/failed}             |                                                                          |
| Review          | {approved/needs_manual_review} | {aggregated criticality, reviewers with findings, re-review ran}         |
| Code simplifier | {ran/skipped}                  | {actionable findings, fix cycle ran/not needed}                          |
| Holistic review | {ran/skipped}                  | {criticality, late-stage fixes}                                          |

## What was built

{Synthesized narrative of the end-to-end result. Describe each major component or subsystem that was implemented — what it does and why, not just file paths. Draw from the accumulated context across all coder change-summaries and review outcomes. Focus on the final state, not the iteration history.}

{If the run failed or needs manual review, describe what was completed and what remains.}

## Insights

{Aggregate the `I{n}` insights emitted across this run's reviewer artifacts, deduplicating an insight that several reviewers raised into a single entry. Reviewers emit these under the insight gate, so prefer their vetted items over re-derived narration; add an orchestrator-level observation only when it is worth preserving and no reviewer already captured it. Include only items worth preserving — omit this section entirely if none emerged.

What belongs here:

- Architectural patterns discovered or validated
- Design trade-offs surfaced during review
- Conventions or project-specific patterns learned
- Non-obvious knowledge a reviewer flagged as an insight
- Technical debt or risks identified but not in scope to address}

## Deferred items

{Items intentionally not addressed during this run, with rationale for each. Omit this section entirely if nothing was deferred.

Include:

- Deviations from reference plan (when external plan was provided and planning ran)
- Trust tier rationale (when external plan with provenance was provided)
- Acceptance criteria from the ticket that were intentionally not addressed
- Any other intentional omissions}

## Files changed

{from git diff --name-only}
```

### Run-manifest and run-summary frontmatter resolution

This section governs the frontmatter resolution for both orchestrator-written artifacts — the run-manifest (step 5) and the run-summary (Phase 5) — which use identical field-resolution logic.

Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill orchestrate --interactive false` via Bash. Prepend the output verbatim to the artifact body.

The orchestrator's `provenance.model` is omitted — the run-summary aggregates work from many subagents, each with its own model recorded in its own artifact. The summary itself is composed by the orchestrator and is not a single-model artifact.

After writing the artifact, call `register_artifact` for the run-summary artifact. Present the same summary to the user in the conversation. The conversational output should match the artifact content — do not abbreviate or omit sections.

After the savings-analyzer {tool:Task} completes (it runs concurrently and will finish while or after the run-summary is written), call `register_artifact` with:

```
runDir: {run-dir}
filename: {NN+1}_analyst_savings-analysis.md
role: analyst
roleType: analyst
agent: savings-analyzer
type: savings-analysis
phase: summary
```

Call MCP tool `complete_run` with `{ runDir: {run-dir}, status: "completed" | "failed" | "needs_manual_review", reason?: string }`. When `status` is `"failed"`, this emits a `run_failed` event (the optional `reason` field is included if provided); otherwise it emits a `run_completed` event. Either way, `completedAt` is stamped on the run-index.json header.

**Clean up breadcrumb** (MCP success path only): After `complete_run`, remove the breadcrumb file:

```
rm -f .claude/tmp/active-run-dir
```

## Phase 6: Wrap-up (prompted, conditional)

After the summary is presented and `complete_run` has been called, check whether the run-summary contains a non-empty `## Deferred items` or `## Insights` section. If either section is present and non-empty, invoke `{skill:wrap-up}` to offer post-run housekeeping.

Like Phase 5, this is an inherent engine responsibility — not a pipeline phase. It does not get `phase_decision` or `phase_started`/`phase_completed` events.

The `{skill:wrap-up}` skill will assess the session (including the run-summary artifact), present a checklist of recommended actions (tickets for deferred items, documentation for discoveries), and wait for user confirmation before executing. This is one of two exceptions to the autonomous execution constraint: The orchestrator pauses here for human input (the other is the MCP availability check in step 4 of run initialization when `mcp_policy` is `prompt`).

If the run-summary has no deferred items and no insights, skip this phase silently.

## Output contract

See [artifact-conventions.md](../_data/artifact-conventions.md) for artifact naming, flow-control field locations, and the example run directory layout.

## {tool:Task} return parsing

Subagents include a structured return block at the end of their {tool:Task} response. The orchestrator parses flow-control fields directly from this return value.

**Parse format:** look for lines matching `{Key}: {value}` in the {tool:Task} return. Expected fields per role:

- **Architect:** `Phase`, `Status`, `Artifact`, `Impact` (`none`|`low`|`medium`|`high`)
- **Planner:** `Phase`, `Status`, `Artifact`, `Steps` (integer)
- **Coder:** `Phase`, `Status`, `Artifact`, `QualityGates` (`passed`|`failed`|`skipped`)
- **Reviewers:** `Phase`, `Status`, `Artifact`, `Criticality` (`none`|`low`|`medium`|`high`)

**Strict parsing:** if any required field is missing or its value does not match the expected enum, record the subagent as `failed` for that phase. Do not attempt to parse the artifact file as a fallback. Emit `phase_completed` with `status: "failed"`.

## Usage capture

{tool:Task} results include a `<usage>` block reporting resource consumption. Parse these fields and map them to event fields for downstream analysis.

**Parse format:** look for a `<usage>` block in the {tool:Task} return value. Extract key-value pairs:

| {tool:Task} result field | Event field  |
| ------------------------ | ------------ |
| `total_tokens`           | `tokens`     |
| `tool_uses`              | `toolUses`   |
| `duration_ms`            | `durationMs` |

**Parsing rules:**

- Usage fields are optional on all events — if the `<usage>` block is absent or any field cannot be parsed, omit those fields silently. Never fail a phase due to missing usage data.
- Values must be non-negative integers. Discard any field that does not parse to a valid non-negative integer.

## Error handling

- **Subagent failure**: Emit `phase_completed` with `status: "failed"`, retry same phase once. If retry fails, emit `phase_completed` with `status: "failed"` again and proceed to summary.
- **`max_turns` exhausted (reviewers):** The engine dispatches one constrained retry per the "Retry-on-interruption hook" in `modules/review-cycle.md`. The retry uses a constrained prompt shape (file allow-list, negative-scope guardrails, forced structured return) and does not consume from `reviewRoundsUsed`. If the retry also exhausts, fall through to **Recovery from reviewer interruption** below. Applies to all five reviewers (`orchestrated-reviewer`, `aspect-code-reviewer`, `aspect-silent-failure-reviewer`, `aspect-test-reviewer`, `code-simplification-reviewer`).
- **`max_turns` exhausted (non-reviewers):** For subagents without a dedicated recovery path, record as `needs_manual_review`. The coder has its own continuation path (see **Recovery from coder interruption** below).
- **Recovery from coder interruption**: When a coder {tool:Task} returns without a structured return block (typically an `agentId:` marker on `max_turns` exhaustion), the coder maintains its change-summary incrementally — the partial artifact at the canonical `{run-dir}/{NN}_coder_change-summary.md` path will list which plan tasks or findings were completed vs. pending. Read the partial summary and use it to seed a continuation dispatch or populate the run summary. Do NOT fall back to working-tree inspection; the partial artifact is the authoritative state-transfer channel.
- **Recovery from reviewer interruption**: Applies after the constrained retry (per the **`max_turns` exhausted (reviewers)** rule above) has also exhausted. The reviewer maintains its review file incrementally — read the partial artifact at the canonical reviewer path (`{run-dir}/{NN}_{reviewer}_*.md`). Inspect the `### Criticality:` line: if it is the literal sentinel `(pending)`, the reviewer did not converge. Treat the dispatch as `failed` for flow control purposes, but retain the partial findings list to inform the run summary. Do NOT use `(pending)` as a criticality value in aggregation — it is not in the enum. Do NOT fall back to working-tree inspection; the partial artifact is the authoritative state-transfer channel. See the `failed`-reviewer rule in `modules/review-cycle.md`'s "Handling failures" note for how the reviewer's contribution to aggregated criticality is computed (`medium`).
- **Reviewer recovery scope:** The retry hook and reviewer-interruption recovery rules apply uniformly to all five reviewers. The `### Criticality: (pending)` sentinel in the artifact file is the unified interruption marker — `code-simplification-reviewer` is included despite having no structured return block, because the file-side sentinel is the authoritative trigger.
- **Quality gate failure** (coder reports failing gates): Treat as review finding at `critical` severity.
- **`get_run_state` unavailable**: If any `get_run_state` call fails (MCP server unavailable), fall back to conversation-tracked state and record a warning in the run summary.
- **MCP server unavailable at `init_run`**: Handled by the step 4 availability guard — the resolved `mcp_policy` determines whether to abort, prompt the developer, or continue without MCP tracking.
- **MCP server disconnects mid-run**: Log a warning in the run summary and set `{mcp-available}` = `false` for all remaining calls. Do not abort. `run-index.json` may be left in a partial state; `complete_run` will be skipped.

## Constraints

- Autonomous execution: Follow flow control at every decision point without pausing for human input. Report outcomes in the summary. **Exceptions:** (1) Phase 6 (wrap-up) pauses for user confirmation before creating tickets or artifacts. (2) MCP availability check (step 4 of run initialization) pauses for developer input when `mcp_policy` is `prompt`.
- All project code changes go through `orchestrated-coder`
- All analysis goes through `orchestrated-architect`
- Don't duplicate subagent work: Trust their results
- Keep context lean: Only pass relevant information downstream
- All orchestration artifacts go in the artifact directory
- **Prefer exhausting iteration budget over escaping findings.** A defect that escapes to remote review costs an order of magnitude more in developer time than an additional local review cycle. Agent compute is cheap; context-switching and manual rework are not. When findings exist and review rounds remain, fix and re-review.
