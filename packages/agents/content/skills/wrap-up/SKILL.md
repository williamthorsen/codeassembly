---
name: wrap-up
description: Post-session housekeeping — create tickets for deferred items, post insights, and generate devlogs
user-invocable: true
---

# Wrap up

Post-session housekeeping. Assess what happened during the session, present an inventory of addressable items with a numbered action menu, and delegate to existing skills after user confirmation.

This skill is context-adaptive: it detects the session type and adjusts its recommendations, but the user always confirms before anything executes.

## Item vocabulary

Items in the wrap-up output use spelled-out prefixes followed by a short ID. The prefix tells the developer the nature of the work at a glance. The ID provides a handle for referencing the item in instructions.

| Prefix           | ID pattern         | Meaning                                        |
| ---------------- | ------------------ | ---------------------------------------------- |
| `fixme`          | `F{n}`             | Must fix — bugs, security issues, breakage     |
| `warning`        | `W{n}`             | Questionable — may need action, needs judgment |
| `todo`           | `T{n}`             | Should do — not urgent, can wait               |
| `recommendation` | `R{n}`             | Advisable — discretionary improvement          |
| `suggestion`     | `S{n}`             | Optional — nice-to-have                        |
| `legacy`         | `{F,W,T,R,S}{n}-L` | Pre-existing — noticed in old code             |
| `insight`        | `I{n}`             | Knowledge — pattern, gotcha, or learning       |

This vocabulary is consistent with the F/W/T/R/S classification (with `-L` suffix for legacy) used by review agents. The `insight` prefix extends it for knowledge items that aren't defects.

### Numbering rules

- **Fresh numbering per wrap-up.** IDs are assigned sequentially within each prefix, regardless of what IDs existed in source artifacts. `F1` in the wrap-up may correspond to `F3` in a review — the wrap-up is its own namespace.
- Items may originate from orchestration runs, conversation, review artifacts, or casual observation. Fresh numbering unifies all sources.

## Process

### Phase 1: Session assessment

Gather signals to classify the session and identify actionable items.

#### 1a. Detect session type

Check these signals in order to classify the session:

| Signal                           | How to check                                                                                                                                                                                                                                 | Session type             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Orchestrated run artifacts       | Look for run subdirectories under the current ticket directory (resolve via `get-session-context` → ticket ID, then list subdirectories of `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` that contain `run-index.json`) | **Orchestrated**         |
| Code changes on branch           | `git diff --name-only {default_branch}...HEAD` produces output                                                                                                                                                                               | **Interactive dev**      |
| Review artifacts in conversation | Conversation contains review findings or `/review-change` output                                                                                                                                                                             | **Review**               |
| None of the above                | No code changes, no run artifacts, no review artifacts                                                                                                                                                                                       | **Research/exploration** |

Check from top to bottom. Use the first match. If an orchestrated run also has interactive changes after the run, treat it as orchestrated (the run-summary already captured the orchestrated portion).

When the orchestrated path matches, identify the specific run directory whose basename will be captured as `run_id` for later use. Run directory basenames begin with a `YYYYMMDD-HHMMSSZ` timestamp prefix and therefore sort chronologically; if multiple run directories exist under the ticket (restarts or separate review cycles), pick the one with the lexicographically greatest basename — that is the latest run. Phase 3 passes this `run_id` through to `/create-devlog` as `--run-id`, and Phase 4 records it in the deferred-findings artifact frontmatter, so both artifacts can link back to the run that produced the work.

#### 1b. Scan for deferred items

Deferred items are things that were identified during the session but intentionally not addressed.

**Structured sources** (high confidence):

- **Run-summary artifact**: if an orchestrated run was detected, read the most recent `*_orchestrator_run-summary.md` in the run directory. Extract items from the `## Deferred items` section. Each item becomes an inventory entry.
- **Review artifacts**: extract unresolved T (TODO) and R (Recommendation) findings from review artifacts that were not addressed in subsequent coder responses.

**Conversation scanning** (heuristic — may produce false positives):

Structured sources take precedence. When scanning conversation, skip items already captured from structured sources (run-summary, review artifacts) to avoid duplicates. In Phase 6 context (invoked by the orchestrator after an orchestrated run), the conversation contains the full orchestration log — focus heuristic scanning on items not already present in the run-summary's deferred items section.

Scan the conversation for items that were explicitly deferred. Look for phrases indicating deferral:

- "out of scope", "not in scope", "beyond scope"
- "deferred", "defer this", "defer that"
- "TODO", "to-do" (when referring to future work, not task lists)
- "follow-up", "follow up on"
- "separate ticket", "separate issue", "separate PR"
- "not now", "later", "next time", "future work"
- "punting", "parking", "tabling"
- "not part of this PR", "left for a future PR", "tracked separately"

For each match, extract a short description of what was deferred and why (if stated). Discard matches that are clearly not actionable (e.g., general discussion about priorities).

#### 1b-ii. Classify deferred items

For each deferred item found, assign a prefix from the item vocabulary based on the nature of the work:

- Items from **review artifacts** retain their original classification (F/W/T/R/S). If the source used severity-tagged legacy IDs (e.g., `F3-L`), map to the corresponding prefix but assign a fresh number.
- Items from **run-summary** `## Deferred items` section: read the item description and classify based on severity. Work explicitly deferred by the architect/planner is typically `todo`. Bugs or failures are `fixme`. Improvements are `recommendation` or `suggestion`.
- Items from **conversation scanning**: classify based on the context in which they were deferred. "We should fix X" → `fixme` or `todo`. "It would be nice to Y" → `suggestion`. "Consider Z approach" → `recommendation`.
- **Legacy items** (pre-existing issues not authored in this branch) get the `legacy` prefix and are collected into a separate section. These come from review artifacts with `-L` suffix IDs, or from conversation observations about old code.

Record the source attribution for each item (e.g., "run-summary", "holistic review", "conversation").

#### 1b-iii. Assess complexity

For each finding (not legacy items or insights), assess its complexity using the [complexity classification](../_data/complexity-classification.md) rubric. Assign a level (1–4) based on the characteristics described in the rubric.

Items at levels 1–2 (trivial or mechanical) are **drive-by candidates** — simple enough for the agent to apply immediately on the current branch without review. Tag these items for the drive-by pass in Phase 2a, where branch-state and code-overlap guardrails determine whether they actually ship as drive-bys.

Items at levels 3–4 remain in the standard findings pool for the housekeeping menu in Phase 2b.

The complexity assessment feeds into the cost-aware disposition flow described in [`_data/ticket-creation-cost.md`](../_data/ticket-creation-cost.md): trivial items prefer **do now** (Phase 2a drive-bys); items that can't ship as drive-bys but share scope or source prefer **batch later** (Phase 2b batch action); substantive items get a **separate ticket** (Phase 2b per-item ticketing).

#### 1c. Scan for insights

Insights are notable observations worth preserving — patterns learned, surprising findings, or knowledge that would benefit future work.

Scan the conversation for:

- Architectural patterns discovered or validated
- Surprising behavior or bugs encountered
- Conventions or project-specific patterns learned
- Technical debt or risks identified
- Difficult bugs and their root causes

Look for language like: "interesting", "discovered", "realized", "turns out", "surprisingly", "TIL", "worth noting", "insight", "lesson", "gotcha", "caveat".

For each insight found, assign an `I{n}` ID (sequentially: I1, I2, ...) and suggest a destination:

- `ticket comment` — if the insight relates to the current ticket's work
- `devlog` — if the insight is general knowledge not specific to one ticket

If no ticket is available (from `get-session-context`), default all destinations to `devlog`.

#### 1d. Check code state

Run `git status` and `git log --oneline {default_branch}..HEAD` to understand:

- Are there uncommitted changes?
- How many commits are on the branch?
- Has a change summary already been generated? (Check for `*_change-summary.md` artifacts.)

### Phase 2a: Drive-by fixes

If any findings were tagged as drive-by candidates (complexity levels 1–2) in step 1b-iii, present them for immediate action before the housekeeping menu. This is the **do now** lane from the cost-aware disposition model — see [`_data/ticket-creation-cost.md`](../_data/ticket-creation-cost.md) for the principle. Skip this phase entirely if no items qualify — do not show an empty section.

#### Suitability check

Before presenting candidates, evaluate the branch state. The drive-by lane is preferred when the branch can absorb a small additional change without obscuring its main work; it is not preferred when the branch is already large or when the candidate touches the same code as the branch's main work.

Consult these signals (starting points, not rigid gates):

- **Branch size** — `git diff --stat {default_branch}..HEAD`. Above ~10 files or ~500 lines of diff, treat the branch as already large; new drive-bys clear a higher bar. When the threshold is exceeded, prefer demoting candidates to Phase 2b's batch action rather than offering them as drive-bys.
- **Code overlap** — for each candidate, check whether its target file appears in `git diff --name-only {default_branch}..HEAD`.
  - **Same-file overlap** — caution: the reviewer must disentangle concerns within one diff. Prefer demoting unless the change is genuinely related to the branch's main work.
  - **Different-file** — fine: changes in unrelated files are good drive-by candidates because the reviewer can skim past them.

When the agent's judgment disagrees with a signal (e.g., the "large" branch is just a generated-file refresh), make the call and note the reasoning briefly to the user when presenting candidates.

#### Output format

```
### Drive-by fixes

These findings are simple enough to apply now on the current branch:

  {prefix} {ID}    {description}

  {prefix} {ID}    {description}

Apply drive-by fixes? Reply "all", numbers, or "skip"
```

#### Response handling

- **Applied items**: make the changes and commit them with a message summarizing the fixes. Stage only the drive-by changes — if uncommitted work from earlier in the session exists, keep it separate. Remove applied items from the findings pool. They do not appear in Phase 2b.
- **Skipped items**: demote back into the Findings section. They become eligible for the batch-ticket and per-item ticket actions in Phase 2b.
- **Partial selection** (e.g., `"1, 3"`): apply selected items, demote the rest.

**Wait for the user to respond before proceeding.**

### Phase 2b: Inventory and action menu

Present the user with an inventory of remaining addressable items and a numbered action menu. Only include sections that have at least one item. Items applied as drive-by fixes in Phase 2a do not appear here.

The action menu offers two distinct ticket-creation actions ("Batch tickets for findings" and "Create tickets for findings"); their conditions and recommendation rules — drawn from the cost-aware disposition model in [`_data/ticket-creation-cost.md`](../_data/ticket-creation-cost.md) — are documented under [standard actions](#standard-actions) below.

#### Output format

```
## Session wrap-up

{Summary of what was built or changed — the outcome, not the process.

Derive from session type:
- **Orchestrated**: paraphrase the "What was built" section of the run-summary
- **Interactive dev**: summarize the actual code changes (`git diff` against the default branch)
- **Review**: summarize what was reviewed and the key outcomes (approved, changes requested, etc.)
- **Research/exploration**: summarize what was explored and key findings

Do NOT narrate routine orchestration mechanics as the summary (e.g., "All 6 phases executed, review cycle converged after 3 rounds"). Lead with the code change itself. If a workflow event materially affected the outcome or carries a lesson for future runs — e.g., holistic review caught a late-stage regression, or strict mode prevented a flawed merge — mention it briefly after the outcome summary.}

### Findings

  {prefix} {ID}    {description}
                    *source: {origin}*

### Legacy

  legacy {ID}      {description}
                    *source: {origin}*

### Insights

  insight {ID}     {description}
                    *destination: {target}*

### Actions

  1. {action} ({item references})
  2. {action} ({item references})
  ...

What would you like to do? Reply with numbers, or adjust: "all", "1, 3". To close a finding without a ticket, choose the "Drop findings" action — there is no bare "skip"; every finding listed must be routed by an explicit action.
```

#### Formatting rules

- Each item's description may wrap across multiple lines, indented to align with the first line of the description (not the prefix).
- The `*source:*` and `*destination:*` lines are italicized — this visual separation makes items easier to parse.
- Items within a section are separated by a blank line for readability.

#### Standard actions

The actions menu is built dynamically based on which sections are populated:

| Action                          | Offered when                               | Skill/tool invoked |
| ------------------------------- | ------------------------------------------ | ------------------ |
| Batch tickets for findings      | Findings section has ≥2 items              | `/create-ticket`   |
| Create tickets for findings     | Findings section non-empty                 | `/create-ticket`   |
| Drop findings                   | Findings section non-empty                 | (no-op)            |
| Create tickets for legacy items | Legacy section non-empty                   | `/create-ticket`   |
| Post insights to ticket #{n}    | Insights with `ticket comment` destination | `gh issue comment` |
| Save session devlog             | Always (unless trivial)                    | `/create-devlog`   |

**Batching versus per-item ticketing.** The "Batch tickets for findings" action creates a single ticket whose body is a checklist with one entry per finding (description plus source attribution); per-item complexity levels are not repeated since they were already used to reach this phase. The "Create tickets for findings" action creates one ticket per item. These are alternatives — only one is executed for the findings pool, based on the user's selection. Recommend the batch action by default when ≥2 trivial items remain or when items share a `scope:` label or source artifact; recommend per-item ticketing when items are thematically unrelated. The "Batch tickets for findings" action implements the **batch later** lane; "Create tickets for findings" implements the **separate ticket** lane from [`_data/ticket-creation-cost.md`](../_data/ticket-creation-cost.md).

**Dropping findings.** The "Drop findings" action is the explicit close-without-tracking lane. Use it when a finding has been considered and the user has decided it does not need a ticket. The action is a no-op (no ticket is created, no artifact entry is written) but it converts the user's intent into a deliberate, recorded choice rather than a menu omission. Every finding listed in the inventory must be routed by an explicit action — either ticketed (batched or per-item) or dropped. If the user's response leaves any finding unrouted, surface the orphans and ask before proceeding to Phase 3 (see [response parsing](#response-parsing)).

**Insight routing.** Each insight's destination determines where it appears in the action menu. Insights destined for `ticket comment` become part of the "Post insights to ticket" action — this action is independent and posts directly via `gh issue comment`. Insights destined for `devlog` are folded into the "Save session devlog" action and included automatically in the devlog content. This means devlog-bound insights only appear if the devlog action is selected, which is the correct dependency.

**Rendering the action menu.** Actions are numbered sequentially starting from 1. Only include actions that apply. The numbered list rendered to the user must include every applicable row from the Standard actions table — in particular, "Drop findings" when the Findings section is non-empty. When both "Batch tickets for findings" and "Create tickets for findings" appear, annotate them as mutually exclusive alternatives so the user cannot accidentally select both. Use the convention `1a` / `1b` for the batch and per-item entries (sharing the same primary number) and continue numbering subsequent actions from `2`. Any other action keeps a plain integer.

#### Defaults by session type

| Session type         | Findings                  | Legacy | Ticket insights | Devlog   |
| -------------------- | ------------------------- | ------ | --------------- | -------- |
| Orchestrated         | Yes (from run-summary)    | Yes    | If applicable   | Yes      |
| Interactive dev      | Yes (from conversation)   | Yes    | If applicable   | Yes      |
| Research/exploration | Rarely                    | Rarely | If applicable   | Optional |
| Review               | Yes (unresolved findings) | Yes    | If applicable   | No       |

These are defaults. Always include any section where items were actually found, regardless of session type.

**Wait for the user to respond before proceeding.** Do not execute any actions until the user confirms.

### Phase 3: Execution

Parse the user's response to the Phase 2b action menu and execute confirmed actions.

#### Response parsing

The user may respond with:

- **Numbers only:** `"1, 3"` or `"all"` — execute the referenced actions as-is
- **Per-item adjustments:** `"1 but combine F1+F2"` — execute the action with modifications
- **Mixed disposition:** `"2 with F1+F2; drop S1"` — batch findings F1 and F2 via action 2, and route S1 through the "Drop findings" action
- **Exclusions:** `"all except I2"` — execute everything, omitting specific items
- **Custom instructions:** free-form text — interpret and confirm before executing

There is no bare `"skip"` keyword for the findings pool: a finding is closed without a ticket only by selecting the "Drop findings" action, never by menu omission.

If the response is ambiguous, ask for clarification before executing.

**Routing every finding.** Before invoking Phase 3, verify that every finding listed in the inventory is covered by an action the user selected — either a ticket-creation action (batch or per-item) or "Drop findings". If any finding is unrouted, surface the orphans by ID and ask the user to confirm whether to ticket or drop them. Do not silently close findings on menu omission.

#### Execution order

Process confirmed actions in this order:

1. **Batch tickets for findings** — invoke `/create-ticket` once. The ticket title summarizes the bundle (e.g., "Address minor follow-ups from {session topic}"). The body is a markdown checklist with one entry per finding (description plus source attribution); per-item complexity levels are not repeated. Apply a label that fits the bundle (typically the shared `scope:` label or `task`). The batch and per-item actions are alternatives — execute whichever the user selected, not both.
2. **Tickets for findings** — invoke `/create-ticket` once per ticket (or once for combined items). Use the item description as the ticket body seed. Apply the label from the issue's context (feature, bug, refactoring, dependencies, ci, tests). Classify items using the prefix: `fixme` → bug, `todo` → task, `warning` → bug, `recommendation` → improvement, `suggestion` → improvement.
3. **Drop findings** — no tool is invoked. Record the dropped item IDs so they appear in the Phase 4 results report under "Dropped" and so the deferred-findings artifact (if written for other reasons) excludes them. Dropping is a deliberate, user-initiated close — the agent never drops findings on its own.
4. **Tickets for legacy items** — invoke `/create-ticket` once per item. Label as technical debt or the appropriate category.
5. **Post insights to ticket** — for each `ticket comment` insight, write the insight body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern, then post via `gh issue comment {number} --body-file "$body_path"` (ticket number from `get-session-context`). When posting multiple insights, use a loop-unique path (e.g., `gh-body-{timestamp}-{index}.md`) to avoid collisions. Do not inline insight content into the shell command. If no ticket is available, re-route to devlog.
6. **Save session devlog** — invoke `/create-devlog`. When the session was detected as orchestrated in Phase 1a, pass the captured run ID through as `/create-devlog --run-id={run_id}` so the devlog frontmatter links back to the run. Insights with `devlog` destination are automatically included in the devlog content; no separate action is needed for them.

**Between each action**, briefly report the result (ticket URL, artifact path) before proceeding to the next.

#### Idempotent safety

Before creating a ticket, check if an issue with a similar title already exists: `gh issue list --search "{keywords}"`. If a match is found, report it and skip creation.

### Phase 4: Results

After all actions are processed, persist a record of deferred work and present a concise conversation report.

#### Step 1: Persist deferred record

Write a `deferred-findings` artifact capturing items that remain to be done. The artifact is the single record a developer can return to that answers "what was deferred from this session?"

##### When to write

Write the artifact if and only if at least one finding became a created ticket in Phase 3.

Drive-by fixes that were applied in Phase 2a do not count — they were completed in the ordinary course of coding. Insights that were posted or folded into the devlog do not count — they have already been recorded. Findings that the user routed to "Drop findings" do not count — dropping is an explicit user act that closes the finding rather than deferring it. The agent never treats menu omission as closure; every finding is routed by an explicit action (see [response parsing](#response-parsing)).

If no ticket was created in Phase 3, skip writing entirely. Do not produce an empty artifact.

##### Where to write

Resolve the artifact path:

- **Ticket-scoped** (when `ticket_id` from session context is non-null):

  ```
  {artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/{filename}
  ```

- **Project-scoped fallback** (when `ticket_id` is null):

  ```
  {artifact_base_dir}/projects/{project_slug}/deferred-findings/{filename}
  ```

The `deferred-findings/` directory name is hardcoded; do not consult `artifact_paths` for it.

Filename: `{YYYYMMDD-HHMMSSZ}_{slug}_deferred-findings.md` (standard ticket-level shape; see [save-artifact](../save-artifact/SKILL.md#filename-formats)). Derive the slug per [save-artifact's slug generation rules](../save-artifact/SKILL.md#slug-generation). For non-ticket sessions where the branch description is empty, use the literal `deferred-findings` as the slug.

`mkdir -p` the target directory before writing.

##### What to write

Prepend YAML frontmatter, then the markdown body.

**Frontmatter** — see [Deferred-findings frontmatter](../_data/artifact-conventions.md#deferred-findings-frontmatter) for the field reference. Generation rules:

- `provenance.skill`: always `wrap-up`
- `provenance.timestamp`: current UTC time in ISO 8601 format
- `provenance.baseSha`: run `git rev-parse --short origin/main`. Omit the field if the command fails.
- `provenance.isInteractive`: always `true`
- `ticket_id`: emit only when non-null in session context
- `run_id`: emit only when wrap-up was invoked from an orchestrated session — reuse the value Phase 1a captured (also passed to `/create-devlog --run-id` in Phase 3)
- `branch`: from session context
- `session_type`: the classification produced by Phase 1a's session-type detection (`orchestrated`, `interactive-dev`, `review`, or `research`)
- `tickets_created`: list of `{id, items}` entries cross-referencing each created ticket to the wrap-up item IDs it addresses. `items` is always a list (e.g., `[F1]` for a single-finding ticket, `[F1, T2, R1]` for a batch ticket). Omit when empty.

**Body** — emit the tickets-created cross-reference:

```markdown
# Deferred findings: {Concise session description}

## Tickets created

- #{number}: addresses {prefix} {item-ID} — {ticket title}
- #{number}: addresses {prefix} {item-ID} — {ticket title}
```

Render the "Tickets created" section from the same in-memory inventory the conversation report uses (Step 2 below) — do not re-derive from conversation, so the artifact and the report cannot drift.

Insights, applied drive-by fixes, devlog references, and findings the user dropped do not appear in the body.

#### Step 2: Present report

```
## Wrap-up complete

### Tickets created
- {ticket-id}: {prefix} {item-ID} "{title}" — {URL or file path}

### Insights recorded
- {item-ID}: posted to #{number}
- {item-ID}: included in devlog

### Devlog
- {artifact path}

### Deferred findings
- {path}

### Dropped
- {item-ID}: {reason}
```

Omit empty sections (including "Deferred findings" when Step 1 produced no artifact). Use the item's original ID (F1, L1, I2) so the developer can cross-reference with the inventory.

### Phase 5: PR prompt

After the results report, check whether the branch has commits ahead of the default branch (`git log --oneline {default_branch}..HEAD`). If there are commits — whether from the session's earlier work, drive-by fixes applied in Phase 2a, or both — prompt the user to create a PR:

```
Ready to create a PR? If yes, I'll use `/create-pr` to open the pull request. 👍🏼👎🏼
```

Skip this prompt if there are no commits on the branch (e.g., a research/exploration session with no code changes).

This is advisory — not an action in a numbered menu. Consistent with the "never auto-execute" constraint.

## Ticket title conventions

When creating tickets for deferred items, follow the conventions from the issue description:

- Use the imperative mood: "Enable playback at different speeds", not "Different playback speeds"
- Be concise but informative: "Disambiguate phase name mismatch between agents and factory layers", not "Phase name disambiguation"
- For bugs, describe the bug, not the fix: "Playback stutters at speeds higher than 32x", not "Fix playback speed at 32x and higher"

## Constraints

- **Never auto-execute** — always present the inventory and action menu, wait for user confirmation
- **Delegate, don't duplicate** — every action goes through an existing skill or a direct `gh` CLI call
- **Idempotent-safe** — before creating a ticket, check if an issue with a similar title already exists
- **Conversation is primary source** — deferred items and insights live in the dialogue, not just in git state
- **Graceful when empty** — if the assessment finds nothing actionable, say so and end: "No wrap-up items identified for this session."
- **Fresh numbering** — always assign new sequential IDs within the wrap-up; never carry forward IDs from source artifacts
