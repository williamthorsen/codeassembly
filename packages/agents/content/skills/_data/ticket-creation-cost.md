# Ticket creation cost

Source of truth for cost-aware disposition of findings and follow-up items. Skills that propose ticket creation reference this document to avoid over-ticketing trivial work.

The principle: every ticket carries fixed overhead beyond the work itself. The agent must weigh that overhead before recommending a separate ticket, and route findings into the lane that best matches their weight.

## Per-ticket overhead

A new ticket is not free. Even before any code is written, each ticket incurs:

- **Backlog maintenance** — the ticket must be triaged, labeled, prioritized, and kept current alongside everything else in the backlog.
- **Familiarization** — whoever picks the ticket up later (often after context has drained) must rebuild the mental model of what was deferred and why.
- **Design and planning** — even small tickets get a plan, a branch, and an approach.
- **Implementation** — the actual code change.
- **Review** — review cycles run regardless of change size; small changes still consume reviewer attention.
- **PR creation, approval, and merge** — every change goes through the same PR-and-merge protocol.

For a one-line vocabulary fix or a two-line cleanup, the overhead can dwarf the underlying work by an order of magnitude. Routing such items into a separate ticket is not free risk-management — it is unnecessary cost.

## Three-lane disposition model

Every finding the agent surfaces gets dispositioned into one of three lanes. The agent never silently drops or buries findings on threshold grounds; the user retains full discretion to drop any finding, but the agent does not pre-filter on cost.

### Do now

Apply the change on the current branch in the current session.

- **Preferred default for trivial items** ([complexity levels 1–2](complexity-classification.md)) when branch state and code overlap permit (see [drive-by suitability](#drive-by-suitability) below).
- The change goes in as a drive-by — a small adjacent commit that ships with the branch's main work.
- Zero ticket overhead. The fix exists in code by the end of the session.

### Batch later

Bundle related small items into a single follow-up ticket.

- Preferred when several drive-by-ineligible items have accumulated and their cumulative weight justifies one ticket.
- **Recommended over per-item ticketing when ≥2 trivial items remain** or when items share a `scope:` label or source artifact.
- Ticket body is a checklist with one entry per finding (description plus source attribution); per-item complexity levels are not repeated since they were already used to reach this lane.
- Cost: one ticket's overhead amortized across N items.

### Separate ticket

A standalone ticket for a single finding.

- Reserved for **substantive items** ([complexity levels 3+](complexity-classification.md)) and small items that don't fit any batch.
- Use when the work needs its own design, its own discussion, or its own scope label.
- Cost: full per-ticket overhead.

## Drive-by suitability

A trivial item is a good drive-by candidate when all of these hold:

- **Branch is not already large or complicated.** A reviewer absorbing one extra small change is fine; a reviewer asked to absorb one more change on top of a sprawling diff is not.
- **The drive-by doesn't blur concerns within a single file.** The standard "drive-by changes are bad" heuristic over-fires: the real cost is when concerns mix in one file. Counterintuitively, **changes in completely unrelated files are good drive-by candidates** — the reviewer can skim past them.
- **The drive-bys aren't accumulating into a swarm.** Two or three drive-bys on a focused branch is fine; ten of them turns the branch into a junk drawer. Once a drive-by candidate would push the branch past the agent's judgment of "still readable as one change", route subsequent items to **batch later**.

### Agent-consultable signals

These are starting points for agent judgment, not rigid gates. Agents should override them when context warrants.

- **Branch size** — `git diff --stat {default_branch}..HEAD`. Above ~10 files or ~500 lines of diff, treat the branch as already large; new drive-bys should clear a higher bar.
- **Code overlap** — is the target file present in `git diff --name-only {default_branch}..HEAD`?
  - **Same-file overlap** — caution: the reviewer must disentangle concerns within one diff. Prefer batch or separate ticket unless the change is genuinely related to the branch's main work.
  - **Different-file** — fine: the reviewer can skim past unrelated additions.

When a heuristic flags caution but the agent's judgment disagrees (e.g., the "large" branch is just a generated-file refresh), the agent should make the call and note the reasoning briefly.

## Worked example: ticket #466 wrap-up

The wrap-up of ticket #466 surfaced six items. Under a reflexive "one ticket per finding" model, this would have produced six tickets. Under cost-aware routing, the same items resolve to zero or one ticket:

| Item | Nature                             | Lines | Lane under cost-aware model                                             |
| ---- | ---------------------------------- | ----- | ----------------------------------------------------------------------- |
| T1   | vocabulary fix in SKILL.md pointer | 1     | **Do now** (drive-by, unrelated file)                                   |
| T2   | `echo ""` cleanup                  | 2     | **Do now** (drive-by, unrelated file)                                   |
| T3   | YAML quoting note                  | ~5    | **Do now** (drive-by, unrelated file)                                   |
| R1   | minor recommendation               | <10   | **Batch later** with R2 and S1 if the branch is too large for drive-bys |
| R2   | minor recommendation               | <10   | **Batch later** with R1 and S1 if the branch is too large for drive-bys |
| S1   | minor suggestion                   | <10   | **Batch later** with R1 and R2 if the branch is too large for drive-bys |

Net under the model: zero to one ticket instead of six. The trivial items ship as drive-bys; the recommendations and suggestion bundle into a single batch ticket if drive-bys are unavailable.

Walk back through the list and apply the rule: any item that fails drive-by suitability moves to batch; any item that doesn't fit a batch becomes a separate ticket. The agent never short-circuits the disposition by burying an item on cost grounds.
