# Scope and deferral decisions

## The default: Fold in

By default, fold into the current change the work that the ticket didn't name (a discovered defect, an adjacent cleanup, a companion change) when the problem requires it, or when it is cheap and serves the ticket's goal. A ticket is a signal of intent, not a boundary; it belongs to us and can be refined. Spinning off a separate ticket needs an affirmative, stated reason:

- a genuinely separable concern,
- a materially different risk surface,
- size that would overwhelm the current change, or
- independent prioritization (the work can wait and competes with other backlog priorities on its own merits).

"The ticket didn't mention it" is never such a reason. When the discovered work addresses the same underlying problem, closing only the ticket-named part leaves the problem partially solved, so the discovered work is required, not optional.

**Authority.** Scope is the user's decision, not the agent's. Report discovered work, recommend a disposition with its tradeoffs, and let the user choose; never declare work "out of scope" as settled fact.

**Feature responsibility.** When the current change introduces a feature, an avoidable user-visible defect caused by that feature is in-scope-by-default, a likely bug to fix here, not an automatic follow-up. Meeting the ticket's written acceptance criteria does not license merging a defect that the change itself introduced.

## Why a separate ticket is expensive

A new ticket is not free. Beyond the work itself, it requires the whole pipeline (creation, reading, evaluation, design, planning, implementation, review, checks, push, PR, approval, merge, and cleanup) and has an opportunity cost against everything else in the backlog. Small, clean tickets yield small, clean PRs that are easy to approve; that value is real, but it must outweigh the pipeline and opportunity costs, judged against the whole flow rather than any single step. For a one-line vocabulary fix or a two-line cleanup, the overhead can exceed the underlying work by an order of magnitude; putting it in a separate ticket is not risk-management but unnecessary cost.

Once work is judged genuinely separable, ticket it immediately rather than leaving it in the conversation; a tracker records that state so that the user does not have to remember it.

## Three-lane disposition model

The agent assigns every finding that it reports to one of three lanes. The agent never silently drops or withholds findings on threshold grounds; the user retains full discretion to drop any finding, but the agent does not pre-filter on cost.

### Do now

Apply the change on the current branch in the current session.

- **Preferred default for trivial items** ([complexity levels 1–2](complexity-classification.md)) when branch state and code overlap permit (see [drive-by suitability](#drive-by-suitability) below).
- The agent commits the change as a drive-by: a small adjacent commit that is merged with the branch's main work.
- Zero ticket overhead.

### Batch later

Bundle related small items into a single follow-up ticket.

- Preferred when several drive-by-ineligible items have accumulated and their cumulative weight justifies one ticket.
- **Recommended over per-item ticketing when ≥2 trivial items remain** or when items share a `scope:` label or source artifact.
- Ticket body is a checklist with one entry per finding (description plus source attribution) and no per-item complexity level.
- Cost: One ticket's overhead amortized across N items.

### Separate ticket

A standalone ticket for a single finding.

- Reserved for **substantive items** ([complexity levels 3+](complexity-classification.md)) and small items that don't fit any batch.
- Use when the work needs its own design, its own discussion, or its own scope label.
- Cost: Full per-ticket overhead.

## Drive-by suitability

A trivial item is a good drive-by candidate when all of these hold:

- **Branch is not already large or complicated.** Asking a reviewer to review one extra small change is fine; asking a reviewer to review one more change on top of a sprawling diff is not.
- **The drive-by doesn't mix concerns within a single file.** The standard "drive-by changes are bad" heuristic triggers too often: The reviewer's real difficulty arises when concerns mix in one file. **Changes in completely unrelated files are good drive-by candidates**: The reviewer can skim past them.
- **The drive-bys remain few.** Two or three drive-bys on a focused branch is fine; ten of them turns the branch into a collection of unrelated changes. Once a drive-by candidate would push the branch past the agent's judgment of "still readable as one change", assign subsequent items to **batch later**.

### Agent-consultable signals

- **Branch size**: `git diff --stat {default_branch}..HEAD`. Above ~10 files or ~500 lines of diff, treat the branch as already large; hold new drive-bys to a stricter standard.
- **Code overlap**: Is the target file present in `git diff --name-only {default_branch}..HEAD`?
  - **Same-file overlap.** Caution: The reviewer must disentangle concerns within one diff. Prefer batch or separate ticket unless the change is genuinely related to the branch's main work.
  - **Different-file.** Fine: The reviewer can skim past unrelated additions.

When a heuristic flags caution but the agent's judgment disagrees (e.g., the "large" branch is just a generated-file refresh), the agent should make the call and note the reasoning briefly.

## Worked example: Ticket #466 wrap-up

The wrap-up of ticket #466 raised six items. Under a reflexive "one ticket per finding" model, this would have produced six tickets. Under the cost-aware model, the same items produce zero or one ticket:

| Item | Nature                             | Lines | Lane under cost-aware model                                             |
| ---- | ---------------------------------- | ----- | ----------------------------------------------------------------------- |
| T1   | vocabulary fix in SKILL.md pointer | 1     | **Do now** (drive-by, unrelated file)                                   |
| T2   | `echo ""` cleanup                  | 2     | **Do now** (drive-by, unrelated file)                                   |
| T3   | YAML quoting note                  | ~5    | **Do now** (drive-by, unrelated file)                                   |
| R1   | minor recommendation               | <10   | **Batch later** with R2 and S1 if the branch is too large for drive-bys |
| R2   | minor recommendation               | <10   | **Batch later** with R1 and S1 if the branch is too large for drive-bys |
| S1   | minor suggestion                   | <10   | **Batch later** with R1 and R2 if the branch is too large for drive-bys |

Walk back through the list and apply the rule: Move any item that fails drive-by suitability to batch later; make any item that doesn't fit a batch a separate ticket.
