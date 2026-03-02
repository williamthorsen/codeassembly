---
name: wrap-up
description: Post-session housekeeping — create tickets for deferred items, document discoveries, generate devlogs, and summarize conversations
user-invocable: true
---

# Wrap up

Post-session housekeeping. Assess what happened during the session, present a checklist of recommended actions, and delegate to existing skills after user confirmation.

This skill is context-adaptive: it detects the session type and adjusts its recommendations, but the user always confirms before anything executes.

## Process

### Phase 1: Session assessment

Gather signals to classify the session and identify actionable items.

#### 1a. Detect session type

Check these signals in order to classify the session:

| Signal                           | How to check                                                                                                                                                                                    | Session type             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Orchestrated run artifacts       | Look for `run-index.json` in the artifact directory for the current ticket (resolve via `get-branch-context` → ticket ID, then check `{base_dir}/projects/{project-slug}/tickets/{ticket-id}/`) | **Orchestrated**         |
| Code changes on branch           | `git diff --name-only {default-branch}...HEAD` produces output                                                                                                                                  | **Interactive dev**      |
| Review artifacts in conversation | Conversation contains review findings or `/review-change` output                                                                                                                                | **Review**               |
| None of the above                | No code changes, no run artifacts, no review artifacts                                                                                                                                          | **Research/exploration** |

Check from top to bottom. Use the first match. If an orchestrated run also has interactive changes after the run, treat it as orchestrated (the run-summary already captured the orchestrated portion).

#### 1b. Scan for deferred items

Deferred items are things that were identified during the session but intentionally not addressed.

**Structured sources** (high confidence):

- **Run-summary artifact**: if an orchestrated run was detected, read the most recent `*_orchestrator_run-summary.md` in the run directory. Extract items from the `## Deferred items` section. Each item becomes a checklist entry.
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

#### 1c. Scan for discoveries

Discoveries are notable observations worth preserving — patterns learned, surprising findings, or insights that would benefit future work.

Scan the conversation for:

- Architectural patterns discovered or validated
- Surprising behavior or bugs encountered
- Conventions or project-specific patterns learned
- Technical debt or risks identified
- Difficult bugs and their root causes

Look for language like: "interesting", "discovered", "realized", "turns out", "surprisingly", "TIL", "worth noting", "insight", "lesson", "gotcha", "caveat".

#### 1d. Check code state

Run `git status` and `git log --oneline {default-branch}..HEAD` to understand:

- Are there uncommitted changes?
- How many commits are on the branch?
- Has a change summary already been generated? (Check for `*_change-summary.md` artifacts.)

### Phase 2: Checklist presentation

Present the user with a tailored checklist grouped by category. Only include categories where at least one item was found.

```
## Session wrap-up

{Session type detected}: {brief description of what was done}

### Deferred items → tickets
- [ ] "{item description}" — {source: run-summary / conversation / review finding}
- [ ] "{item description}" — {source}

### Discoveries → documentation
- [ ] {discovery description} — record as {ticket comment / devlog entry}

### Session artifacts
- [ ] Create devlog for this session's work
- [ ] Summarize conversation

### Code hygiene
- [ ] Summarize changes (for PR preparation)

Adjust this list and confirm when ready. 🤔
```

**Defaults by session type:**

| Session type         | Deferred items            | Discoveries | Devlog   | Chat summary | Change summary                |
| -------------------- | ------------------------- | ----------- | -------- | ------------ | ----------------------------- |
| Orchestrated         | Yes (from run-summary)    | Yes         | Yes      | No           | Only if not already generated |
| Interactive dev      | Yes (from conversation)   | Yes         | Yes      | No           | Yes                           |
| Research/exploration | Rarely                    | Yes         | Optional | Yes          | No                            |
| Review               | Yes (unresolved findings) | Yes         | No       | No           | No                            |

These are defaults. Always include any category where items were actually found, regardless of session type.

**Wait for the user to confirm, adjust, or skip.** Do not proceed until the user responds.

### Phase 3: Execution

Execute each confirmed item by delegating to the appropriate skill. Process items in this order:

| Category                   | Skill to invoke                                | Notes                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deferred item → ticket     | `/create-ticket`                               | One invocation per ticket. Use the deferred item description as the ticket body seed. Apply the label from the issue's context (feature, bug, refactoring, dependencies, ci, tests).                                |
| Discovery → ticket comment | `gh issue comment {number} --body "{comment}"` | Post to the current ticket (from `get-branch-context`). Format: brief context + the discovery. If no ticket is available (`ticket_id` is null), skip this action and route the discovery to a devlog entry instead. |
| Discovery → devlog         | `/create-devlog`                               | `/create-devlog` accepts: no arguments (last commit), `<n>` (last N commits), or `working-tree` (uncommitted changes). Use `working-tree` if uncommitted changes exist, otherwise pass the branch's commit count.   |
| Devlog                     | `/create-devlog`                               | Same as above.                                                                                                                                                                                                      |
| Chat summary               | `/summarize-chat`                              | No arguments needed.                                                                                                                                                                                                |
| Change summary             | `/summarize-change`                            | No arguments needed.                                                                                                                                                                                                |

**Between each delegation**, briefly report the result (ticket URL, artifact path) before proceeding to the next item.

### Phase 4: Summary

After all items are processed, present a concise report:

```
## Wrap-up complete

### Tickets created
- {ticket-id}: "{title}" — {URL}

### Artifacts saved
- {artifact type}: {file path}

### Skipped
- {item} — {reason}
```

Omit empty sections.

## Ticket title conventions

When creating tickets for deferred items, follow the conventions from the issue description:

- Use the imperative mood: "Enable playback at different speeds", not "Different playback speeds"
- Be concise but informative: "Disambiguate phase name mismatch between agents and factory layers", not "Phase name disambiguation"
- For bugs, describe the bug, not the fix: "Playback stutters at speeds higher than 32x", not "Fix playback speed at 32x and higher"

## Constraints

- **Never auto-execute** — always present the checklist and wait for user confirmation
- **Delegate, don't duplicate** — every action goes through an existing skill or a direct `gh` CLI call
- **Idempotent-safe** — before creating a ticket, check if an issue with a similar title already exists (`gh issue list --search "{keywords}"`)
- **Conversation is primary source** — deferred items and discoveries live in the dialogue, not just in git state
- **Graceful when empty** — if the assessment finds nothing actionable, say so and end: "No wrap-up items identified for this session."
