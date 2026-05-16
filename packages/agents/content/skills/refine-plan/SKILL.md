---
name: refine-plan
description: Review and refine an implementation plan for completeness and correctness
user-invocable: true
---

# Refine plan

Perform a single review-and-revise round on a saved implementation plan, checking for completeness (decision gaps the coder would fill) and correctness (factual accuracy against the codebase). Produces a refined plan ready for orchestrated development.

## Arguments

- Plan file path (required): path to a saved plan artifact (e.g., the `{timestamp}_{slug}_plan.md` from `/save-plan`)
- Ticket source (required): file path or URL (GitHub issue URL, Jira URL, etc.)

## Visibility

Before every Task call and after every phase completion, output a status line:

- **Before dispatch:** `-- Refine plan -- delegating to {agent}...`
- **After completion:** `-- Refine plan -- {summary}`

## Flow

### 1. Validate inputs and resolve context

1. Read the plan file. If not found, report an error and stop.
2. Parse YAML frontmatter from the plan content. If a `provenance` block is present, store it as `{input-provenance}`. If no frontmatter or no `provenance` block, set `{input-provenance}` to empty.
3. Resolve the ticket source:
   - GitHub URL (`github.com/.../issues/...`) -> use `gh issue view --json title,body {url}` via Bash to fetch content.
   - File path -> Read the file.
   - Other URL -> use WebFetch to retrieve content.
4. Use `get-session-context` to obtain `ticket_id`, `project_slug`, and `artifact_base_dir`.
5. Resolve artifact directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`
6. `mkdir -p {artifact_dir}`

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

Call Task with `subagent_type: plan-reviewer`, `max_turns: 30`:

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

- `Status`: must be `completed`
- `AutoResolvable`: integer count of auto-resolvable findings
- `UserQuestions`: integer count of findings requiring user input

`-- Refine plan -- {AutoResolvable + UserQuestions} findings ({AutoResolvable} auto-resolvable, {UserQuestions} require user input)`

### 4. Present user questions

Evaluate the finding counts:

- **0 total findings** (AutoResolvable = 0 AND UserQuestions = 0): skip the reviser entirely. Report that the plan needs no refinement, then present next steps.

  ```
  Plan reviewed -- no findings. The plan is ready for implementation.
    Review: {review_output_path}
  ```

  <HARD-GATE>
  Read [next-steps-after-plan](../_data/next-steps-after-plan.md) and follow its options, output format, and recommendation rules exactly. Do not improvise the options. The plan was just reviewed with no issues — use this as recommendation context. Use `{plan_path}` (the original plan argument, not `{revision_output_path}` — no revised plan exists on this path) and `{ticket_source}` in each skill-invoking option line.
  </HARD-GATE>

- **0 user questions** (UserQuestions = 0, AutoResolvable > 0): skip user interaction. Proceed to step 5 with empty user answers.

- **User questions present** (UserQuestions > 0): read the review artifact. Extract all findings from the "Decision gaps" section (these may be C or X findings -- the section is organized by resolution type, not finding category). Present each finding's question using the finding's ID (e.g., `C1`, `X2`) as the question identifier. When asking option-style questions, follow [`_data/recommendation-gradient.md`](../_data/recommendation-gradient.md). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)

  ```
  The plan review identified {UserQuestions} question(s) that need your input:

  **C1 — {title}**
  {question text}
  1. ■■■ {recommended option}:
     ➕ {strongest argument};
     ➕ {secondary argument}.
  2. ■□□ {alternative option}:
     ➕ {pro};
     ➖ {con}.

  **X2 — {title}**
  {open-ended question text — describe what you want in free-form text}

  Please answer using the finding ID (e.g., "C1: option 2; X2: ..."), or respond in free-form text.
  ```

  Wait for the user's response. Capture their answers as `user_answers`.

### 5. Dispatch plan-reviser

Generate a new UTC timestamp for the refined plan.

Set the revision output path: `{artifact_dir}/{new_timestamp}_{slug}_plan-v2.md`

`-- Refine plan -- delegating to plan-reviser...`

Call Task with `subagent_type: plan-reviser`, `max_turns: 30`:

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

- `Status`: must be `completed`
- `Artifact`: path to the refined plan

`-- Refine plan -- revision complete`

If the plan-reviser Task failed or the return block does not have `Status: completed`, skip the provenance update and report the failure:

```
Plan revision failed -- the plan-reviser did not complete successfully.
  Review: {review_output_path}
```

Stop here. Do not attempt provenance update or report completion.

Stamp the revised plan with frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema. This is the single write point for the revised plan's frontmatter — `plan-reviser` outputs no frontmatter of its own; `refine-plan` owns it.

The stamp writes the full canonical schema in one atomic write: the `provenance:` block (with `iteration` extension) plus the top-level canonical fields (`branch`, `commit`, `pr`, `ticket_id`, `ticket_ref`, `run_id`). The behavior of the `provenance:` block depends on whether `{input-provenance}` is non-empty or empty; the top-level fields are resolved identically in both cases.

**Resolve top-level canonical fields (both cases):**

1. Run `git rev-parse --short HEAD` via Bash to obtain `{commit}`.
2. Read `branch_name`, `ticket_id`, and `ticket_ref` from session context (already obtained in step 1.4 above). `branch_name` is always present; `ticket_id` and `ticket_ref` are emitted only when non-null.
3. Detect whether the stamp is running inside an active run (`run-index.json` exists in a parent of the revision output path or in session context). If so, set `{run_id}` to the run ID; otherwise omit.
4. Resolve `{pr}` via the shared dispatch in [`../_data/pr-resolution.md`](../_data/pr-resolution.md). Read `platform` from session context, then run the matching snippet via the Bash tool with `timeout: 5000`:
   - **GitHub:** `gh pr list --head "$BRANCH" --state all --json url --jq '.[0].url // empty'`
   - **Bitbucket:** the `curl` snippet in `pr-resolution.md` against `https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests?q=source.branch.name="{branch}"`, extracting `.values[0].links.html.href`.

   On non-empty output, set `{pr}` to the URL. On empty output (no PR exists), omit the `pr:` line — emit no warning. On non-zero exit, timeout, or other failure, omit the `pr:` line and emit `Note: PR lookup failed; proceeding without pr field.` in the agent text output.

**Round-trip preservation:** when the input plan already carries top-level canonical fields (`branch`, `commit`, `pr`, etc.), they are **not** carried forward from the input — the stamp re-resolves them from current session context at stamp time. This is correct: the output is a new artifact at a new point in time on a potentially different branch. The `provenance:` block's camelCase casing convention (`baseSha`, `isInteractive`, `refinedBy`) is preserved as-is on both read and write — there is no rename. The only provenance fields carried forward from the input are `skill`, `baseSha`, `isInteractive`, and `iteration` (per the case branches below).

**When `{input-provenance}` is non-empty:**

1. Run `git rev-parse --short origin/main` via Bash to obtain `{baseSha}`. If the command fails, preserve the original `baseSha` from `{input-provenance}`.
2. Read the revised plan file at `{revision_output_path}`.
3. Construct updated provenance:
   - `skill`: preserve from `{input-provenance}` (the original authoring skill)
   - `refinedBy`: set to `refine-plan`
   - `timestamp`: current UTC time in ISO 8601 format
   - `baseSha`: the newly resolved value (or preserved original)
   - `isInteractive`: preserve from `{input-provenance}` if present
   - `iteration`: If `{input-provenance}.iteration` is present, set to `{input-provenance}.iteration + 1`. If `{input-provenance}.iteration` is absent, set to `2`.
4. Prepend the unified YAML frontmatter (provenance block plus top-level canonical fields resolved above) to the revised plan and write back. Example output (assuming input had `skill: design-and-plan`, `isInteractive: true`, no `iteration` field):

   ```yaml
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
   pr: https://github.com/williamthorsen/codeassembly/pull/591
   run_id: 20260310-080000Z
   ---
   ```

   Include `isInteractive` only if it was present in `{input-provenance}`. Include `baseSha` only if resolved or preserved from input. Include `ticket_id`, `ticket_ref`, `pr`, and `run_id` only when resolved.

**When `{input-provenance}` is empty:**

1. Run `git rev-parse --short origin/main` via Bash to obtain `{baseSha}`. If the command fails, omit `baseSha`.
2. Read the revised plan file at `{revision_output_path}`.
3. Construct provenance with:
   - `skill`: set to `unknown`
   - `refinedBy`: set to `refine-plan`
   - `timestamp`: current UTC time in ISO 8601 format
   - `baseSha`: the resolved value (omit if command failed)
   - `isInteractive`: always `true`. `refine-plan` is an interactive user-invocable skill (it presents review questions to the user in step 4 and waits for their answers); when it stamps a plan that arrived without prior provenance, the stamp itself is always produced inside that interactive session.
   - `iteration`: set to `2`
4. Prepend the unified YAML frontmatter (provenance block plus top-level canonical fields resolved above) to the revised plan and write back:

   ```yaml
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
   pr: https://github.com/williamthorsen/codeassembly/pull/591
   run_id: 20260310-080000Z
   ---
   ```

   Include `ticket_id`, `ticket_ref`, `pr`, and `run_id` only when resolved.

### 6. Offer ticket update if approach diverged

Compare the revised plan's approach/solution with the source ticket's solution section. If they materially diverge, offer to update the ticket to match the revised plan. If the approaches haven't diverged, skip this step silently.

**Material divergence** means a different technical approach (e.g., build-time flag changed to runtime detection) or changed scope boundaries (features added or removed). **Non-divergence** means refined details within the same approach (e.g., different function names, reordered steps).

- For GitHub tickets (resolved via `gh issue view` in step 1): offer to update by writing the revised body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern, then `gh issue edit {number} --body-file "$body_path"`.
- For file-based tickets: offer to update the file directly

This is a shared-state action — do not update without explicit consent. If the user declines, continue to step 7.

### 7. Report completion and present next steps

```
Plan refined:
  Review:  {review_output_path}
  Revised: {revision_output_path}
```

<HARD-GATE>
Read [next-steps-after-plan](../_data/next-steps-after-plan.md) and follow its options, output format, and recommendation rules exactly. Do not improvise the options. The plan was just reviewed. If the review surfaced significant scope changes or unresolved questions that led to a dramatic revision, the plan may warrant another refinement round; otherwise, either orchestration or direct implementation may apply depending on whether the work's consequences fit a single review pass. Use this as recommendation context. Include both `{revision_output_path}` (as the plan path) and `{ticket_source}` in each skill-invoking option line.
</HARD-GATE>

## Edge cases

- **Ticket URL unreachable**: report error with the URL and suggest verifying access (e.g., `gh auth status` for GitHub URLs).

## Constraints

- All codebase exploration is delegated to the subagents -- do not analyze code directly.
- The user interaction step is conversational -- present questions as formatted text and wait for a free-form response.
- This skill performs one review-and-revise round. Do not loop or iterate.
- The original plan file is never modified. All output goes to new artifact files.
