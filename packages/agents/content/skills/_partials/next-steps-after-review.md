## Next-steps options

The next-steps block has three independent sub-blocks. Each is shown only when its condition is met. If no condition is met, no next-steps block appears. Whatever combination of sub-blocks is shown, always wrap the output in a `Next steps:` header.

Use `~/`-relative paths where possible and absolute paths otherwise. Every line subordinate to an option — invocation guidance as much as a pro or con — is a nested list item, never a whitespace-indented continuation; see [option format](#option-format).

**Naming a skill in the render.** Name a skill in the rendered option only when the user must carry the invocation across a session boundary — clearing context, handing off to another session, or waiting for someone else to act. When the agent runs the skill in the current session, the skill name lives in the sub-block's Options table and the rendered line is a bare action. This keeps each rendered line to the step the user performs.

**Reviewer and author roles.** A review surfaces findings; the author disposes of them. The options below route the reviewer's output to the author or record what the review found — they never ask the reviewer to re-design, re-plan, or orchestrate a workflow, none of which is the reviewer's job.

### Deviations sub-block

Shown when the ticket compliance section reports gaps (partial or unaddressed acceptance criteria) or unplanned work.

#### Options

| #   | Emoji | Option                         | Description                                                                                                 |
| --- | ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1   | 📝    | Update the acceptance criteria | Revise the ticket's acceptance criteria to match the implementation, via `align-ticket-with-implementation` |
| 2   | ⏭️    | Leave as-is                    | Accept the deviation without updating the ticket                                                            |

#### Output format

Render the list per [option format](#option-format). Each option carries a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which markers apply. Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific deviation presents a context-specific tradeoff (e.g., "the missing AC was load-bearing for downstream tests"). Generic restatements ("ships faster," "ticket drifts from reality") are noise and must be omitted. The agent runs `align-ticket-with-implementation` in the current session, so the render is a bare action; the skill lives in the Options table above.

Example (rendered for the recommendation case):

```
Next steps:

Deviations from ticket:
1. 📝 ■■□ Update the acceptance criteria
2. ⏭️ ■□□ Leave as-is
```

When the recommendation rules indicate no preference, omit markers from both options per the gradient's pure-taste-call form.

#### Recommendation rules

1. **Recommend "Update the acceptance criteria"** (■■□ on it, ■□□ on Leave as-is): acceptance criteria are missing or substantially different from what was implemented, OR significant unplanned work was done that should be captured.
2. **No recommendation** (omit markers from both options): deviations are minor and intentional (e.g., a criterion was addressed differently than originally described but the intent is met). The user decides.

When uncertain, recommend updating the ticket.

### Source divergence sub-block

Shown when the consistency section of the review reports a `partial` or `severe` verdict. The consistency section renders only when two spec sources are present (ticket and PR description), so this sub-block appears in PR reviews. The option set varies by case (which spec source the implementation matches, drawn from the consistency-section table — see `review-branch/SKILL.md` § Specification consistency).

#### Options

The base option pool is:

| Emoji | Option                           | Action                                                                                                         |
| ----- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 📝    | Update PR description            | Edit the PR description to match the implementation                                                            |
| 📝    | Update the stale ticket          | Ratify the implementation in the ticket, via `align-ticket-with-implementation`                                |
| 📝    | Update ticket and PR description | Ratify the implementation in the ticket (via `align-ticket-with-implementation`), then edit the PR description |
| ⏭️    | Leave as-is                      | Accept the divergence                                                                                          |

Each case renders two of these options; the specific options and their ordering are shown in the Output format section. The agent performs each of these in the current session (a ticket amendment, a PR-description edit, or both), so the render is a bare action and the skill lives in the pool above.

#### Output format

Render the list per [option format](#option-format). Each option carries a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option earns the strongest marker per case. Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific divergence presents a context-specific tradeoff (e.g., "the diverging AC was load-bearing for adjacent work that has already shipped"). Generic restatements are noise and must be omitted.

Case 2 — implementation matches ticket; PR description is the stale source:

```
Source divergence:
1. 📝 ■■□ Update PR description:
   - Edit the PR description to match the implementation, which matches the ticket
2. ⏭️ ■□□ Leave as-is
```

Case 3 — implementation matches PR description; ticket is the stale source:

```
Source divergence:
1. 📝 ■■□ Update the stale ticket
2. ⏭️ ■□□ Leave as-is
```

Case 4 — implementation matches neither source (severe):

```
Source divergence:
1. 📝 Update ticket and PR description
2. ⏭️ Leave as-is
```

Case 4 renders marker-free: the reviewer cannot tell whether the code or the specs are the wrong one, so it recommends neither. The "code is wrong" path is not offered here — the review's findings already surface a divergence when the code is at fault, and disposing of those findings is the author's job (see the Findings sub-block).

Source-divergence options preserve conversation context because the divergence diagnosis from the review is the seed for whichever reconciliation action is taken.

#### Recommendation rules

In the typical flow, the ticket is written first and rarely revised, while the PR description describes the implementation as built. When the two diverge and the implementation matches one of them, the unmatched source is the stale one — update it to match reality. When the implementation matches neither (severe), the reviewer cannot attribute the fault, so the menu offers only ratification and leaves the code-is-wrong path to the findings.

Determine the case from the implementation column of the consistency-section table:

| Implementation column shows                   | Verdict      | Case | Recommended option      |
| --------------------------------------------- | ------------ | ---- | ----------------------- |
| `🟢 ticket, 🟠/🔴 PR` on every divergent row  | 🟠 `partial` | 2    | Update PR description   |
| `🟠/🔴 ticket, 🟢 PR` on every divergent row  | 🟠 `partial` | 3    | Update the stale ticket |
| `🟠/🔴 ticket, 🟠/🔴 PR` on any divergent row | 🔴 `severe`  | 4    | None (marker-free)      |

#### Marker strengths

For cases 2 and 3, the recommended option carries the ■■□ marker and the other option carries ■□□. Case 4 carries no markers. Reserve ■■■ for the recommended option only when you would actively push back against any other choice.

### Findings sub-block

Shown when the review contains actionable findings (F, W, or T categories).

The option set depends on whether the review covers a pull request. Select the variant by the review the agent just produced: a `review-pr` run carries a PR reference in the review header and a PR-description spec source, and its author is typically someone else; a `review-branch` run has neither, and its code is typically our own.

#### Options — PR variant (review-pr)

| #   | Emoji | Option                  | Description                                                                                                                                  |
| --- | ----- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 📋    | Post findings on the PR | Post the findings as comments on the pull request. On Bitbucket, via `bb-pr-inline-comment`; GitHub has no posting mechanism yet (see #1018) |
| 2   | 🚀    | Implement directly      | Fix the findings in this session                                                                                                             |

#### Options — local-branch variant (review-branch)

| #   | Emoji | Option                                                      | Description                                            |
| --- | ----- | ----------------------------------------------------------- | ------------------------------------------------------ |
| 1   | 📋    | Ask the author to address the findings                      | Hand the findings to the author for disposition        |
| 2   | 📋🔍  | Wait for the author to address the findings, then re-review | Wait for the author's fixes, then re-review the branch |
| 3   | 🚀    | Implement directly                                          | Fix the findings in this session                       |

#### Output format

Render the list per [option format](#option-format). Each option carries a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option earns the strongest marker. Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific findings present a context-specific tradeoff bearing on which option fits (e.g., "the fixes touch a shared contract used outside this package"). Generic option properties are noise and must be omitted.

PR variant (rendered for the default case):

```
Next steps:

Actionable findings:
1. 📋 ■■□ Post findings on the PR
2. 🚀 ■□□ Implement directly
```

Local-branch variant (rendered for the default case):

```
Next steps:

Actionable findings:
1. 📋 ■■□ Ask the author to address the findings
2. 📋🔍 ■□□ Wait for the author to address the findings, then `review-branch`
3. 🚀 ■□□ Implement directly

If the author is an agent, run `respond-to-review` in that session.
```

Which skill names appear in the render follows the session-boundary rule:

- **Post findings on the PR** — the agent posts in the current session, so no skill is named in the render; the posting mechanism (`bb-pr-inline-comment` on Bitbucket) lives in the Options table.
- **Ask the author to address the findings** — the author's disposition happens in another session. The hoisted line names `respond-to-review` for the case where that author is an agent.
- **Wait for the author to address the findings, then re-review** — names `review-branch` in the render, because the re-review runs after a wait only the user can end. It carries no "Clear context" prefix: the reviewer's memory of what it found is what lets it check the fixes.
- **Implement directly** — the reviewer makes the fixes in this session; no skill is invoked.

#### Recommendation rules

**PR variant:**

1. **Post findings on the PR** — the default. The author is typically someone else; comments on the PR are how the findings reach them.
2. **Implement directly** — the fixes are simple and ours to make.

**Local-branch variant:**

1. **Ask the author to address the findings** — the default. The reviewer surfaces; the author disposes.
2. **Wait for the author to address the findings, then re-review** — the fixes are substantial enough that the result needs another review pass.
3. **Implement directly** — the findings are trivial enough for the reviewer to fix in place.

#### Marker strengths

The selected option carries the ■■□ marker in the rendered output; the others carry ■□□ by default. Reserve □□□ for an alternative with a clear drawback in the current context. Reserve ■■■ for the selected option only when you would actively push back against any other choice.

Complexity levels classify individual findings, but the recommendation applies to the collection. When uncertain between two options, recommend the one that keeps a human in the loop.

See [`scope-and-deferral.md`](../_data/scope-and-deferral.md) for the cost-aware disposition that governs whether a deferred finding becomes a separate ticket, joins a batch, or ships as a drive-by. It applies to any finding that the user defers rather than addressing immediately.

### Combined output format

When multiple sub-blocks are shown, present them as separate sections within a single next-steps block. Ordering is Deviations → Source divergence → Actionable findings. Source divergence appears only in PR reviews, so a block that includes it renders the Findings PR variant. The example below illustrates one such arrangement; the recommendation rules in each sub-block determine which marker applies to each option:

```
Next steps:

Deviations from ticket:
1. 📝 ■■□ Update the acceptance criteria
2. ⏭️ ■□□ Leave as-is

Source divergence:
1. 📝 ■■□ Update the stale ticket
2. ⏭️ ■□□ Leave as-is

Actionable findings:
1. 📋 ■■□ Post findings on the PR
2. 🚀 ■□□ Implement directly
```
