---
name: refine-plan
description: Review and refine an implementation plan for completeness and correctness
user-invocable: true
---

# Refine plan

Perform a single review-and-revise round on a saved implementation plan, checking for completeness (decision gaps the coder would fill) and correctness (factual accuracy against the codebase). Produces a refined plan ready for `/orchestrate-dev`.

## Arguments

- Plan file path (required): path to a saved plan artifact (e.g., the `{timestamp}_{slug}_plan.md` from `/save-plan`)
- Ticket source (required): file path or URL (GitHub issue URL, Jira URL, etc.)

## Visibility

Before every Task call and after every phase completion, output a status line:

- **Before dispatch:** `-- Refine plan -- delegating to {agent}...`
- **After completion:** `-- Refine plan -- {summary}`

## Flow

### 1. Validate inputs and resolve context

1. Verify the plan file exists (Read). If not found, report an error and stop.
2. Resolve the ticket source:
   - GitHub URL (`github.com/.../issues/...`) -> use `gh issue view --json title,body {url}` via Bash to fetch content.
   - File path -> Read the file.
   - Other URL -> use WebFetch to retrieve content.
3. Use `get-branch-context` to obtain `ticket_id` and `project_slug`.
4. Resolve `artifacts.base_dir`:
   - Read `artifacts.base_dir` from `.agents/preferences.yaml`
   - If not found, read from `~/.agents/preferences.yaml`
   - If still not found, use default: `~/.ai`
   - If relative, resolve from project root (`git rev-parse --show-toplevel`). If absolute, use as-is.
5. Resolve artifact directory: `{base_dir}/projects/{project_slug}/tickets/{ticket_id}/`
6. `mkdir -p {artifact_dir}`

### 2. Detect plan format

1. Read the plan file content.
2. Detect format:
   - If the plan contains a JSON companion file (same base name with `.json` extension), it is an `orchestration` format plan.
   - Otherwise, it is a `prose` format plan.
3. Record the format for passing to the reviewer.

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

- **0 total findings** (AutoResolvable = 0 AND UserQuestions = 0): skip the reviser entirely. Report that the plan needs no refinement and stop.
  ```
  Plan reviewed -- no findings. The plan is ready for implementation.
    Review: {review_output_path}
  ```

- **0 user questions** (UserQuestions = 0, AutoResolvable > 0): skip user interaction. Proceed to step 5 with empty user answers.

- **User questions present** (UserQuestions > 0): read the review artifact. Extract all findings from the "Decision gaps" section (these may be C or X findings -- the section is organized by resolution type, not finding category). Present each finding's question as a numbered item:

  ```
  The plan review identified {UserQuestions} question(s) that need your input:

  1. **C1: {title}** -- {question text}
  2. **X2: {title}** -- {question text}
  ...

  Please answer these questions. You can respond with numbered answers (e.g., "1. Use toast notifications, 2. Follow the existing pattern in...") or as free-form text.
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

### 6. Report completion

```
Plan refined:
  Review:  {review_output_path}
  Revised: {revision_output_path}
```

## Edge cases

- **Plan file not found**: report error and stop. Do not attempt to search for alternatives.
- **Ticket URL unreachable**: report error with the URL and suggest verifying access (e.g., `gh auth status` for GitHub URLs).
- **Reviewer finds 0 findings**: skip the reviser entirely. Report the plan is ready.
- **Reviewer finds only auto-resolvable findings**: skip user interaction. Proceed directly to the reviser.
- **Reviewer or reviser fails** (Status != completed): report the failure and stop. Do not retry.

## Constraints

- All codebase exploration is delegated to the subagents -- do not analyze code directly.
- The user interaction step is conversational -- present questions as formatted text and wait for a free-form response.
- This skill performs one review-and-revise round. Do not loop or iterate.
- The original plan file is never modified. All output goes to new artifact files.
