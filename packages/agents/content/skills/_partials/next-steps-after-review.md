## Next-steps options

The next-steps block has three independent sub-blocks. Each is shown only when its condition is met. If no condition is met, no next-steps block appears. Whatever combination of sub-blocks is shown, always wrap the output in a `Next steps:` header. When two or more sub-blocks appear, label each with its `A` identifier as a bold prefix (`**A1 — Deviations from ticket:**`, and so on) and keep each sub-block's own 1-based numbering, so the user answers `A1: 1, A2: 2`; a lone sub-block carries no identifier.

Use `~/`-relative paths where possible and absolute paths otherwise. Every line subordinate to an option — invocation guidance as much as a pro or con — is a nested list item, never a whitespace-indented continuation; see [option format](#option-format).

**Naming a skill in the render.** Name a skill in the rendered option only when the user must carry the invocation across a session boundary — clearing context, handing off to another session, or waiting for someone else to act. When the agent runs the skill in the current session, the skill name lives in the sub-block's Options table and the rendered line is a bare action. This keeps each rendered line to the step the user performs.

**Reviewer and author roles.** A review surfaces findings; the author disposes of them. The options below route the reviewer's output to the author or record what the review found — they never ask the reviewer to re-design, re-plan, or orchestrate a workflow, none of which is the reviewer's job.

### Proposed-edit preview

Two of the sub-blocks below offer options that rewrite an artifact: the ticket's acceptance criteria, the PR description, or both. The user consents to that rewrite by picking a number, so every such option renders a preview of the edit it would make. Which criteria are genuinely in conflict with the implementation is a judgment the reviewer makes, and the preview is where that judgment becomes reviewable instead of silent.

**Placement.** The preview renders above the numbered options, inside its sub-block, under a `Proposed edit to the {target}:` label naming what it would change. Option lines stay bare actions: the preview is never a pro, a con, or a line nested beneath an option. An option that mutates nothing, such as "Leave as-is", carries no preview.

**Notation.** The preview is a delta. It never restates the ticket or the PR description whole, and it renders one line per change:

- **Ticket targets** derive their delta from `## Specification compliance`'s in-conflict criteria rows and, for `Rewrite:` lines, from the divergent `D{n}` rows the ratification carries into the ticket's narrative sections. Unplanned work is never a source: implementation that goes beyond the criteria is not a deviation, so it yields no line.
  - `Reword: {old} → {new}` for a criterion the implementation satisfied by deliberately taking a different direction
  - `Drop: {criterion}` for a criterion the implementation deliberately abandoned, never for one it has not yet reached
  - `Rewrite: {## Section} — {gist of the new content}` for a narrative section the edit regenerates, which arises only where the option ratifies the whole ticket rather than its criteria alone
- **PR-description targets** render the concrete claim changes, each keyed to the divergent `D{n}` row it came from: `D2: {claim as written} → {claim as built}`.
- **Both targets** render both groups, each under its own label.

Render no exclusions line. A criterion genuinely arguable as in conflict belongs in the delta, where the user can strike it. Listing what was left out over-triggers into noise and buries the proposal it was meant to qualify.

**Open findings.** When a delta line would settle or obviate an open finding, follow it with a sibling `⚠️` list item naming that finding, so the user can see that accepting the edit pre-empts the finding's disposition. The preview list stays flat; nothing nests beneath a delta line.

**The preview is the contract.** The edit executed is the edit previewed. When carrying it out surfaces a change the preview did not contain, stop and re-confirm with the new line shown; never widen the edit under consent already given.

**Empty delta.** When no line survives the judgment, the Deviations sub-block has nothing to propose and does not render at all; see its [trigger](#deviations-sub-block). A source divergence always leaves a claim to reconcile, so its delta is never empty.

### Deviations sub-block

Shown when at least one criterion in `## Specification compliance` is in conflict with the implementation, equivalently when the criteria delta carries at least one line. Compute the delta first: an empty delta renders no sub-block.

A criterion that is merely unbuilt contributes no line. The work is unfinished, not redirected, and a contract is not revised to match a moving target. Implementation that exceeds the criteria contributes none either.

#### Options

| #   | Emoji | Option                         | Description                                                                                                                        |
| --- | ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 📝    | Update the acceptance criteria | Revise the ticket's acceptance criteria via `align-ticket-with-implementation` in criteria-only mode, bound to the previewed delta |
| 2   | ⏭️    | Leave as-is                    | Accept the deviation without updating the ticket                                                                                   |

#### Output format

Render the list per [option format](#option-format). Each option carries a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which markers apply. Option 1 renders the criteria delta above the list per [proposed-edit preview](#proposed-edit-preview). Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific deviation presents a context-specific tradeoff (e.g., "the abandoned criterion was load-bearing for downstream tests"). Generic restatements ("ships faster," "ticket drifts from reality") are noise and must be omitted. That default governs pros and cons alone: it never suppresses the proposed-edit preview, which is required content.

Example (rendered for the recommendation case):

```
Next steps:

Deviations from ticket:

Proposed edit to the acceptance criteria:
- Reword: "Warns on an unknown directive" → "Fails on an unknown directive"
- Drop: A `--strict` flag gates the new validation

1. 📝 ■■□ Update the acceptance criteria
2. ⏭️ ■□□ Leave as-is
```

When the recommendation rules indicate no preference, omit markers from both options per the gradient's pure-taste-call form.

#### Recommendation rules

1. **Recommend "Update the acceptance criteria"** (■■□ on it, ■□□ on Leave as-is): the implementation's direction is deliberate and sound, so the criteria as written would lead a later reader to judge correct code wrong.
2. **Recommend "Leave as-is"** (■■□ on it, ■□□ on Update the acceptance criteria): the review raised a finding on the conflicting behavior. The code is what is in question, and revising the contract to match it would bury the finding.
3. **No recommendation** (omit markers from both options): the reviewer cannot tell whether the criteria or the implementation is the wrong one. The user decides.

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

Each case renders two of these options; the specific options and their ordering are shown in the Output format section.

#### Output format

Render the list per [option format](#option-format). Each option carries a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option earns the strongest marker per case. Option 1 renders the delta for every target it would rewrite, above the list, per [proposed-edit preview](#proposed-edit-preview); "Leave as-is" carries none. Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific divergence presents a context-specific tradeoff (e.g., "the diverging AC was load-bearing for adjacent work that has already shipped"). Generic restatements are noise and must be omitted. That default governs pros and cons alone: it never suppresses the proposed-edit preview, which is required content.

Case 2 (implementation matches ticket; PR description is the stale source) mirrors case 3 with the PR description as the target: its delta uses the `D{n}:` notation and option 1 reads "Update PR description".

Case 3 — implementation matches PR description; ticket is the stale source:

```
Source divergence:

Proposed edit to the ticket:
- Reword: "Retries are capped at 3" → "Retries are capped at 5, with exponential backoff"
- ⚠️ W2 asks whether the cap belongs in configuration; accepting this reword settles it as a fixed value
- Rewrite: ## Proposed solution — records the backoff schedule the branch implements

1. 📝 ■■□ Update the stale ticket
2. ⏭️ ■□□ Leave as-is
```

Case 4 — implementation matches neither source (severe):

```
Source divergence:

Proposed edit to the ticket:
- Reword: "Retries are capped at 3" → "Retries are capped at 5, with exponential backoff"
- Rewrite: ## Proposed solution — records the backoff schedule the branch implements

Proposed edit to the PR description:
- D2: "Retries use a fixed 200ms delay" → "Retries use exponential backoff from 200ms"

1. 📝 Update ticket and PR description
2. ⏭️ Leave as-is
```

Case 4 renders marker-free: the reviewer cannot tell whether the code or the specs are the wrong one, so it recommends neither. The "code is wrong" path is not offered here — the review's findings already surface a divergence when the code is at fault, and disposing of those findings is the author's job (see the Findings sub-block).

Source-divergence options preserve conversation context, and the preview each renders binds the reconciliation that follows, per [proposed-edit preview](#proposed-edit-preview).

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

| #   | Emoji | Option                  | Description                                                                                                                                                                                     |
| --- | ----- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 📋    | Post findings on the PR | Post the findings as comments anchored to file and line. On Bitbucket, use whatever Bitbucket tooling is available (MCP server, REST API, CLI); GitHub has no posting mechanism yet (see #1018) |
| 2   | 🚀    | Implement directly      | Fix the findings in this session                                                                                                                                                                |

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

Per the session-boundary rule, two options name a skill in the render:

- **Ask the author to address the findings** — the author's disposition happens in another session. The hoisted line names `respond-to-review` for the case where that author is an agent.
- **Wait for the author to address the findings, then re-review** — names `review-branch` in the render, because the re-review runs after a wait only the user can end. It carries no "Clear context" prefix: the reviewer's memory of what it found is what lets it check the fixes.

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

When multiple sub-blocks are shown, present them as separate sections within a single next-steps block. Ordering is Deviations → Source divergence → Actionable findings. When both sub-blocks offer a ticket edit and the user selects both, run `align-ticket-with-implementation` once in whole-ticket mode, taking the union of the two previews as the contract. Source divergence appears only in PR reviews, so a block that includes it renders the Findings PR variant. The example below illustrates one such arrangement; the recommendation rules in each sub-block determine which marker applies to each option:

```
Next steps:

**A1 — Deviations from ticket:**

Proposed edit to the acceptance criteria:
- Reword: "Warns on an unknown directive" → "Fails on an unknown directive"

1. 📝 ■■□ Update the acceptance criteria
2. ⏭️ ■□□ Leave as-is

**A2 — Source divergence:**

Proposed edit to the ticket:
- Reword: "Warns on an unknown directive" → "Fails on an unknown directive"
- Rewrite: ## Proposed solution — records the fail-fast validation the branch implements

1. 📝 ■■□ Update the stale ticket
2. ⏭️ ■□□ Leave as-is

**A3 — Actionable findings:**
1. 📋 ■■□ Post findings on the PR
2. 🚀 ■□□ Implement directly
```
