---
name: refine-plan
description: Review and refine an implementation plan for completeness and correctness
user-invocable: true
dependencies:
  skills:
    - emit-event
  subagents:
    - plan-reviewer
    - plan-reviser
---

# Refine plan

Perform a single review-and-revise round on a saved implementation plan, checking for completeness (decision gaps the coder would fill) and correctness (factual accuracy against the codebase). Produces a refined plan ready for orchestrated development.

## Arguments

- Plan file path (required): Path to a saved plan artifact (e.g., the `{timestamp}_{slug}_plan.md` from `save-plan`)
- Ticket source (required): File path or URL (GitHub issue URL, Jira URL, etc.)

## Visibility

Before every {tool:Task} call and after every phase completion, output a status line:

- **Before dispatch:** `-- Refine plan -- delegating to {agent}...`
- **After completion:** `-- Refine plan -- {summary}`

## Flow

### 1. Validate inputs and resolve context

1. Read the plan file. If not found, report an error and stop.
2. Parse YAML frontmatter from the plan content. If a `provenance` block is present, store it as `{input-provenance}`. If no frontmatter or no `provenance` block, set `{input-provenance}` to empty.
3. Resolve the ticket source:
   - GitHub URL (`github.com/.../issues/...`) -> use `gh issue view --json title,body {url}` via Bash to fetch content.
   - File path -> Read the file.
   - Other URL -> Fetch the URL content.
4. Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `ticket_id`, `project_slug`, and `artifact_base_dir` from the manifest JSON emitted on stdout.
5. Resolve artifact directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`
6. `mkdir -p {artifact_dir}`
7. Emit `skill.started` (payload `{"skill":"refine-plan"}`) per [Lifecycle events](#lifecycle-events).

### 2. Detect plan format

1. Using the plan content already read in step 1, detect format:
   - If the plan contains a JSON companion file (same base name with `.json` extension), it is an `orchestration` format plan.
   - Otherwise, it is a `prose` format plan.
2. Record the format for passing to the reviewer.

### 3. Dispatch plan-reviewer

Extract the slug from the original plan filename. The slug is the middle segment of `{timestamp}_{slug}_{artifact-type}.md`. If the filename doesn't follow this pattern, derive a slug from the filename.

Generate a UTC timestamp: `{YYYYMMDD-HHMMSSZ}`.

Set the review output path: `{artifact_dir}/{timestamp}_{slug}_plan-review.md`

`-- Refine plan -- delegating to plan-reviewer...`

Call {tool:Task} with `subagent_type: plan-reviewer`, `max_turns: 30`:

> Review the following implementation plan for completeness and correctness.
>
> **Plan file:** {plan_path}
> **Plan format:** {prose|orchestration}
>
> **Ticket/requirements:**
> {ticket content}
>
> **Output path:** {review_output_path}

Parse the return block:

- `Status`: Must be `completed`
- `AutoResolvable`: Integer count of auto-resolvable findings
- `UserQuestions`: Integer count of findings requiring user input

`-- Refine plan -- {AutoResolvable + UserQuestions} findings ({AutoResolvable} auto-resolvable, {UserQuestions} require user input)`

### 4. Present user questions

Evaluate the finding counts:

- **0 total findings** (AutoResolvable = 0 AND UserQuestions = 0): Skip the reviser entirely. Emit `skill.completed` (payload `{"outcome":"no findings"}`) per [Lifecycle events](#lifecycle-events). Report that the plan needs no refinement, then present next steps, emitting `input.requested` (payload `{"prompt":"next-steps"}`) as you present the menu.

  ```
  Plan reviewed -- no findings. The plan is ready for implementation.
    Review: {review_output_path}
  ```

  <HARD-GATE>
  Follow the options, output format, and recommendation rules in [next-steps options](#next-steps-options) exactly. Do not improvise the options. The plan was just reviewed with no issues — use this as recommendation context. Use `{plan_path}` (the original plan argument, not `{revision_output_path}` — no revised plan exists on this path) and `{ticket_source}` in each skill-invoking option line.
  </HARD-GATE>

- **0 user questions** (UserQuestions = 0, AutoResolvable > 0): Skip user interaction. Proceed to step 5 with empty user answers.

- **User questions present** (UserQuestions > 0): Emit `input.requested` (payload `{"prompt":"plan-review questions"}`) per [Lifecycle events](#lifecycle-events) before presenting the questions. Read the review artifact. Extract all findings from the "Decision gaps" section (these may be C or X findings -- the section is organized by resolution type, not finding category). Present each finding's question using the finding's ID (e.g., `C1`, `X2`) as the question identifier. When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)

  ```
  The plan review identified {UserQuestions} question(s) that need your input:

  **C1: {title}**
  {question text}
  1. ■■■ {recommended option}:
     - ➕ {strongest argument}
     - ➕ {secondary argument}
  2. ■□□ {alternative option}:
     - ➕ {pro}
     - ➖ {con}

  **X2: {title}**
  {open-ended question text — describe what you want in free-form text}

  Please answer using the finding ID (e.g., "C1: Option 2; X2: ..."), or respond in free-form text.
  ```

  Wait for the user's response. Capture their answers as `user_answers`.

<!-- include: ../_partials/action-items.md / -->

### 5. Dispatch plan-reviser

Generate a new UTC timestamp for the refined plan.

Set the revision output path: `{artifact_dir}/{new_timestamp}_{slug}_plan-v2.md`

`-- Refine plan -- delegating to plan-reviser...`

Call {tool:Task} with `subagent_type: plan-reviser`, `max_turns: 30`:

> Revise the following implementation plan based on review findings and user answers.
>
> **Original plan:** {plan_path}
> **Review findings:** {review_output_path}
> **User answers:** {user_answers or "No user answers -- all findings are auto-resolvable."}
>
> **Ticket/requirements:**
> {ticket content}
>
> **Output path:** {revision_output_path}

Parse the return block:

- `Status`: Must be `completed`
- `Artifact`: Path to the refined plan

`-- Refine plan -- revision complete`

If the plan-reviser {tool:Task} failed or the return block does not have `Status: completed`, skip the provenance update and report the failure:

```
Plan revision failed -- the plan-reviser did not complete successfully.
  Review: {review_output_path}
```

Emit `skill.completed` (payload `{"outcome":"stopped: revision failed"}`) per [Lifecycle events](#lifecycle-events). Stop here. Do not attempt provenance update or report completion.

Stamp the revised plan with frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema plus the [plan provenance](../_data/artifact-conventions.md#plan-provenance) extensions. This is the single write point for the revised plan's frontmatter — `plan-reviser` outputs no frontmatter of its own; `refine-plan` owns it.

The stamp writes the full canonical schema in one atomic write: the `provenance:` block plus the top-level canonical fields. The seal marker follows the closing `---`, as it does in every artifact:

<!-- include: ../../_partials/seal-marker.md / -->

The top-level fields come from the script; the `provenance:` block is computed from `{input-provenance}` plus the stamping logic below.

This site uses `--format json` because the `provenance:` block is case-branched on the input artifact's existing provenance — see [artifact-conventions.md](../_data/artifact-conventions.md#bespoke-frontmatter-composition).

Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --format json` via Bash. It emits a JSON object with the universal artifact fields (`branch`, `commit`, `baseSha`, `pr`, `ticket_id`, `ticket_ref`, `scm`, `timestamp`, `run_id`). Use those values verbatim for the matching YAML keys. Optional fields the script omits from its output (`baseSha`, `pr`, `ticket_id`, `ticket_ref`, `run_id`) must be omitted from the frontmatter too — do not emit `null` or empty strings.

The `provenance:` block is **not** populated from the script. Construct it manually per the case branches below.

**Round-trip preservation:** The top-level canonical fields (`branch`, `commit`, etc.) are always re-resolved from current session context via the script; they are not carried forward from `{input-provenance}`. This is correct: The output is a new artifact at a new point in time on a potentially different branch. The `provenance:` block's camelCase convention (`baseSha`, `isInteractive`, `refinedBy`) is preserved as-is on both read and write; there is no rename. Provenance fields carried forward from the input are `skill`, `baseSha`, `isInteractive`, and `iteration` (per the case branches).

**When `{input-provenance}` is non-empty:**

1. Use the script's `baseSha` as the new value. If the script omitted `baseSha`, preserve the original `baseSha` from `{input-provenance}`.
2. Read the revised plan file at `{revision_output_path}`.
3. Construct updated provenance:
   - `skill`: Preserve from `{input-provenance}` (the original authoring skill)
   - `refinedBy`: Set to `refine-plan`
   - `timestamp`: Use the script's `timestamp`
   - `baseSha`: The script's value (or preserved original)
   - `isInteractive`: Preserve from `{input-provenance}` if present
   - `iteration`: If `{input-provenance}.iteration` is present, set to `{input-provenance}.iteration + 1`. If absent, set to `2`.
4. Prepend the unified YAML frontmatter (`provenance:` block plus top-level canonical fields from the script), then the seal marker, to the revised plan and write back. Example output (assuming input had `skill: design-and-plan`, `isInteractive: true`, no `iteration` field):

   ```markdown
   ---
   provenance:
     skill: design-and-plan
     refinedBy: refine-plan
     timestamp: 2026-03-10T08:00:00Z
     baseSha: abc123def456...
     isInteractive: true
     iteration: 2
   ticket_id: '537'
   ticket_ref: '#537'
   branch: 537/feat/example
   commit: 1d2c3b4
   run_id: 20260310-080000Z
   ---
   <!-- Sealed record. Do not edit this file to match anything downstream, and do not report its divergence from current state. -->
   ```

   Include `isInteractive` only if it was present in `{input-provenance}`. Include `baseSha` only if available. Top-level fields follow the script's omit rules.

**When `{input-provenance}` is empty:**

1. Use the script's `baseSha`. If the script omitted it, omit it.
2. Read the revised plan file at `{revision_output_path}`.
3. Construct provenance:
   - `skill`: `unknown`
   - `refinedBy`: `refine-plan`
   - `timestamp`: Script's value
   - `baseSha`: Script's value (omit when absent)
   - `isInteractive`: Always `true`. `refine-plan` is an interactive user-invocable skill — when it stamps a plan that has no prior provenance, the stamp itself is always produced inside that interactive session.
   - `iteration`: `2`
4. Prepend the unified YAML frontmatter, then the seal marker, and write back:

   ```markdown
   ---
   provenance:
     skill: unknown
     refinedBy: refine-plan
     timestamp: 2026-03-10T08:00:00Z
     baseSha: abc123def456...
     isInteractive: true
     iteration: 2
   ticket_id: '537'
   ticket_ref: '#537'
   branch: 537/feat/example
   commit: 1d2c3b4
   run_id: 20260310-080000Z
   ---
   <!-- Sealed record. Do not edit this file to match anything downstream, and do not report its divergence from current state. -->
   ```

Once the revised plan is written, emit `artifact.written` (payload `{"path":"<path>","kind":"plan"}`) per [Lifecycle events](#lifecycle-events), then emit `skill.completed` (payload `{"outcome":"plan-refined"}`) on the same turn. Emitting completion at the save point folds an abandoned session to a finished state.

### 6. Offer ticket update if approach diverged

Compare the revised plan's approach/solution with the source ticket's solution section. If they materially diverge, emit `input.requested` (payload `{"prompt":"ticket-update"}`) per [Lifecycle events](#lifecycle-events), then offer to update the ticket to match the revised plan. If the approaches haven't diverged, skip this step silently.

**Material divergence** means a different technical approach (e.g., build-time flag changed to runtime detection) or changed scope boundaries (features added or removed). **Non-divergence** means refined details within the same approach (e.g., different function names, reordered steps).

- For GitHub tickets (resolved via `gh issue view` in step 1): Offer to update by writing the revised body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern, then `gh issue edit {number} --body-file "$body_path"`.
- For file-based tickets: Offer to update the file directly

This is a shared-state action; do not update without explicit consent. If the user declines, continue to step 7.

<!-- include: ../../_partials/prose-line-breaks.md / -->

### 7. Report completion and present next steps

```
Plan refined:
  Review:  {review_output_path}
  Revised: {revision_output_path}
```

As you present the next-steps menu, emit `input.requested` (payload `{"prompt":"next-steps"}`) per [Lifecycle events](#lifecycle-events).

<HARD-GATE>
Follow the options, output format, and recommendation rules in [next-steps options](#next-steps-options) exactly. Do not improvise the options. The plan was just reviewed. If the review surfaced significant scope changes or unresolved questions that led to a dramatic revision, the plan may warrant another refinement round; otherwise, either orchestration or implementation may apply depending on whether the work's consequences fit a single review pass. Use this as recommendation context. Include both `{revision_output_path}` (as the plan path) and `{ticket_source}` in each skill-invoking option line.
</HARD-GATE>

## Edge cases

- **Ticket URL unreachable**: Report error with the URL and suggest verifying access (e.g., `gh auth status` for GitHub URLs).

## Constraints

- All codebase exploration is delegated to the subagents -- do not analyze code directly.
- The user interaction step is conversational -- present questions as formatted text and wait for a free-form response.
- This skill performs one review-and-revise round. Do not loop or iterate.
- The original plan file is never modified. All output goes to new artifact files.

<!-- include: ../_partials/next-steps-after-plan.md / -->

<!-- include: ../_partials/option-format.md / -->

<!-- include: ../_partials/lifecycle-events.md / -->
