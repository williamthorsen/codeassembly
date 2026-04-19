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

When the orchestrated path matches, identify the specific run directory whose basename will be captured as `run_id` for later use. Run directory basenames begin with a `YYYYMMDD-HHMMSSZ` timestamp prefix and therefore sort chronologically; if multiple run directories exist under the ticket (restarts or separate review cycles), pick the one with the lexicographically greatest basename — that is the latest run. Phase 3 passes this `run_id` through to `/create-devlog` as `--run-id`, so the devlog frontmatter can link back to the run that produced the work.

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

Items at levels 1–2 (trivial or mechanical) are **quick-fix candidates** — simple enough for the agent to apply immediately without review. Tag these items for the quick-fix pass in Phase 2a.

Items at levels 3–4 remain in the standard findings pool for the housekeeping menu in Phase 2b.

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

### Phase 2a: Quick fixes

If any findings were tagged as quick-fix candidates (complexity levels 1–2) in step 1b-iii, present them for immediate action before the housekeeping menu. Skip this phase entirely if no items qualify — do not show an empty section.

#### Output format

```
### Quick fixes

These findings are simple enough to apply now:

  {prefix} {ID}    {description}

  {prefix} {ID}    {description}

Apply quick fixes? Reply "all", numbers, or "skip"
```

#### Response handling

- **Applied items**: make the changes and commit them with a message summarizing the fixes. Stage only the quick-fix changes — if uncommitted work from earlier in the session exists, keep it separate. Remove applied items from the findings pool. They do not appear in Phase 2b.
- **Skipped items**: demote back into the Findings section. They become eligible for the "Create tickets for findings" action in Phase 2b.
- **Partial selection** (e.g., `"1, 3"`): apply selected items, demote the rest.

**Wait for the user to respond before proceeding.**

### Phase 2b: Inventory and action menu

Present the user with an inventory of remaining addressable items and a numbered action menu. Only include sections that have at least one item. Items applied as quick fixes in Phase 2a do not appear here.

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

What would you like to do? Reply with numbers, or adjust: "all", "1, 3", "skip"
```

#### Formatting rules

- Each item's description may wrap across multiple lines, indented to align with the first line of the description (not the prefix).
- The `*source:*` and `*destination:*` lines are italicized — this visual separation makes items easier to parse.
- Items within a section are separated by a blank line for readability.

#### Standard actions

The actions menu is built dynamically based on which sections are populated:

| Action                          | Offered when                               | Skill/tool invoked |
| ------------------------------- | ------------------------------------------ | ------------------ |
| Create tickets for findings     | Findings section non-empty                 | `/create-ticket`   |
| Create tickets for legacy items | Legacy section non-empty                   | `/create-ticket`   |
| Post insights to ticket #{n}    | Insights with `ticket comment` destination | `gh issue comment` |
| Save session devlog             | Always (unless trivial)                    | `/create-devlog`   |

**Insight routing.** Each insight's destination determines where it appears in the action menu. Insights destined for `ticket comment` become part of the "Post insights to ticket" action — this action is independent and posts directly via `gh issue comment`. Insights destined for `devlog` are folded into the "Save session devlog" action and included automatically in the devlog content. This means devlog-bound insights only appear if the devlog action is selected, which is the correct dependency.

Actions are numbered sequentially starting from 1. Only include actions that apply.

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

- **Numbers only:** `"1, 3"` or `"all"` or `"skip"` — execute the referenced actions as-is
- **Per-item adjustments:** `"1 but combine F1+F2"` — execute the action with modifications
- **Exclusions:** `"all except I2"` — execute everything, omitting specific items
- **Custom instructions:** free-form text — interpret and confirm before executing

If the response is ambiguous, ask for clarification before executing.

#### Execution order

Process confirmed actions in this order:

1. **Tickets for findings** — invoke `/create-ticket` once per ticket (or once for combined items). Use the item description as the ticket body seed. Apply the label from the issue's context (feature, bug, refactoring, dependencies, ci, tests). Classify items using the prefix: `fixme` → bug, `todo` → task, `warning` → bug, `recommendation` → improvement, `suggestion` → improvement.
2. **Tickets for legacy items** — invoke `/create-ticket` once per item. Label as technical debt or the appropriate category.
3. **Post insights to ticket** — post each `ticket comment` insight via `gh issue comment {number} --body "{insight}"` (ticket number from `get-session-context`). If no ticket is available, re-route to devlog.
4. **Save session devlog** — invoke `/create-devlog`. When the session was detected as orchestrated in Phase 1a, pass the captured run ID through as `/create-devlog --run-id={run_id}` so the devlog frontmatter links back to the run. Insights with `devlog` destination are automatically included in the devlog content; no separate action is needed for them.

**Between each action**, briefly report the result (ticket URL, artifact path) before proceeding to the next.

#### Idempotent safety

Before creating a ticket, check if an issue with a similar title already exists: `gh issue list --search "{keywords}"`. If a match is found, report it and skip creation.

### Phase 4: Results

After all actions are processed, present a concise report:

```
## Wrap-up complete

### Tickets created
- {ticket-id}: {prefix} {item-ID} "{title}" — {URL or file path}

### Insights recorded
- {item-ID}: posted to #{number}
- {item-ID}: included in devlog

### Devlog
- {artifact path}

### Skipped
- {item-ID}: {reason}
```

Omit empty sections. Use the item's original ID (F1, L1, I2) so the developer can cross-reference with the inventory.

### Phase 5: PR prompt

After the results report, check whether the branch has commits ahead of the default branch (`git log --oneline {default_branch}..HEAD`). If there are commits — whether from the session's earlier work, quick fixes applied in Phase 2a, or both — prompt the user to create a PR:

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
