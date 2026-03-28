# Next steps after assessment

Prompt for follow-up actions when any assessment verdict is non-baseline. The prompt applies in both `all` mode and single-mode assessments.

## Baseline definition

A verdict is **baseline** when it indicates no concern or action needed:

| Dimension | Baseline verdict |
| --------- | ---------------- |
| Drift     | `none`           |
| Relevance | `relevant`       |
| Progress  | `none`           |

Complexity verdicts are purely informational and never trigger a prompt.

When all assessed verdicts are baseline, do not show a next-steps prompt.

## Verdict-to-actions mapping

Each non-baseline verdict maps to one or more follow-up actions. Actions describe intent — the agent decides how to execute them based on the ticket platform and available tools.

### ♻️ Update actions

| Verdict             | Action                                        |
| ------------------- | --------------------------------------------- |
| Drift: `partial`    | Update ticket to match current codebase state |
| Drift: `severe`     | Update ticket to match current codebase state |
| Progress: `partial` | Update ticket to match current codebase state |

These collapse into a single "Update ticket" action regardless of how many dimensions trigger it.

### 🏁 Close actions

| Verdict                 | Action                                                 |
| ----------------------- | ------------------------------------------------------ |
| Drift: `severe`         | Close as outdated                                      |
| Relevance: `superseded` | Close with comment explaining what superseded it       |
| Progress: `partial`     | Close and create a new ticket scoped to remaining work |
| Progress: `complete`    | Close with comment summarizing completed work          |

When multiple close actions apply, present each as a separate option — they differ in intent and outcome.

### 💬 Comment actions

| Verdict                | Action                                                  |
| ---------------------- | ------------------------------------------------------- |
| Relevance: `uncertain` | Add comment noting ambiguous relevance for human triage |

## Combination protocol

When multiple dimensions produce non-baseline verdicts, their actions are combined into a single numbered list:

1. **Collect** actions grouped by type: ♻️ update → 🏁 close → 💬 comment.
2. **Deduplicate** — the update action appears at most once regardless of how many verdicts trigger it.
3. Number sequentially.

## Interaction protocol

1. Present the numbered action list immediately after the assessment output.
2. Wait for the user to select an option by number.
3. Execute the selected action.

## Output format

```
Next steps:
  1. ♻️ {Update action}
  2. 🏁 {Close action}
  3. 💬 {Comment action}
```

## Example: combined output

Assessment produces drift: `partial`, relevance: `relevant` (baseline), progress: `partial`:

```
Next steps:
  1. ♻️ Update ticket to match current codebase state
  2. 🏁 Close and create a new ticket scoped to remaining work
```

Action 1 combines drift and progress update triggers into a single option. Action 2 comes from progress. Relevance is baseline and contributes nothing.
