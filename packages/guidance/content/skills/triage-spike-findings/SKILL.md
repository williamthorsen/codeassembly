---
name: triage-spike-findings
description: Dispose of the findings that a spike, a usability assessment, or a code-health assessment left without a ticket. Inventories every undisposed item, grades each one's confidence and value, has a subagent without session context challenge every grade, and then creates the labelled tickets under an umbrella and records every disposition on the triage ticket. Use when a findings artifact has proposals or ideas that the existing tickets have not absorbed.
user-invocable: true
---

# Triage spike findings

Dispose of every item that a findings artifact leaves undisposed: the proposals, groupings, findings, and ideas that the filed tickets and comments did not absorb. You inventory them, recommend a disposition and two grades for each, have a {subagent:disposition-challenger} argue against every recommendation, and then, once the developer approves, create the tickets and post the record. A bundled helper checks the repository's labels, validates the dispositions record, and renders the comments.

**Announce at start:** "Using triage-spike-findings to dispose of the findings of {source} on {ticket_ref}."

## Inputs

- **The findings artifact**: A spike's findings, a `usability-findings` artifact, or a `code-health-findings` artifact, by local path or by artifact URL. Read a URL with the Artifact tool and save the content to `{ticket_dir}/triage/findings.md`, so that the challenger can read it from a path; on a harness without that tool, the input is a local path.
- **The triage ticket**: The ticket on which the dispositions are posted and under which the working files are kept, resolved per [ticket source resolution](../_data/ticket-source-resolution.md); when none is given, the session's ticket. The umbrella is created as a separate ticket, so the triage ticket may be the spike's own ticket.

GitHub alone is supported, through `gh`. When the session-context manifest's `scm` is not `github`, stop at preflight and report that the skill does not support the platform.

## Grades and dispositions

Each item takes a disposition and two grades:

- **Disposition**: `ticket` (a child of the umbrella), `comment` (a note on an existing issue, which must be open and must own the file or the behavior), `merge` (folded into another item's ticket; the target is a `ticket` item), or `drop`.
- **Confidence** states advisability: `high` is clearly worth doing, `medium` is worth doing but arguable, `low` is not worth a ticket now. A borderline item takes the lower grade. Only an item graded `high` or `medium` gets a ticket; the helper refuses a record that gives a `low` item one.
- **Value** states how much the item matters: `must-have`, `should-have`, `nice-to-have`, `questionable`. Value never decides whether an item gets a ticket; it is recorded on every item and labels every child.

The labels come from the common preset of `release-kit sync-labels`: the `value:` family, and the `confidence:` family that williamthorsen/node-monorepo-tools#1017 added. A repository whose labels lack either family cannot take the children, because `gh issue create` fails on a label that the repository does not have.

## Process

Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `error` and `message`, except when a step below says otherwise. Invoke the helper as:

```bash
node {harness_home_dir}/skills/triage-spike-findings/triage-spike-findings.mjs {command} {flags}
```

Resolve `{ticket_dir}` per {skill:save-artifact}, and write every working file under `{ticket_dir}/triage/`.

### 1. Preflight

1. Run `gh auth status` and `gh repo view --json nameWithOwner`. If either fails, or `scm` is not `github`, stop and report why.
2. Run the helper's `check-labels`. When `complete` is false, stop: Name each missing label, and state that the common preset of `release-kit sync-labels` supplies both families (the `confidence:` family from williamthorsen/node-monorepo-tools#1017), so the repository takes them by upgrading release-kit and regenerating its label file rather than by creating them by hand.
3. Create `{ticket_dir}/triage/`, and save the findings there when they came from a URL.

### 2. Inventory

Read the findings in full. List every item that the artifact leaves without a disposition, where a disposition is a ticket or a comment that the artifact itself names: a proposed ticket that was not filed, a grouping, a finding outside every grouping, and an idea that the filed tickets did not absorb. Verify each item's claim against the current code and against the open issues (`gh issue list --search`, `gh issue view`): The finding may describe a problem that a merge has since fixed, a decision that the repository records, or work that an open issue already covers.

Write `inventory.md` as a table: the item's id (the artifact's own id when it has one), its title, where it appears in the artifact, the verification outcome (holds, partly holds, or does not hold, with the evidence), and, when the findings give the item an evidence key and the paths that it covers, that key and those paths, copied verbatim.

### 3. Recommend

Write `recommendations.md`: one line per item, with its id, title, disposition, confidence, value, and a one-sentence reason. Nothing else goes in the file, because the challenger reads it and a sentence of your reasoning there would bias its judgment toward yours. A `merge` names a `ticket` item as its target; a `comment` names its issue number.

### 4. Challenge

Send one {tool:Task} call, `subagent_type: disposition-challenger`, with this block and nothing else composed into it. `findings` is the copy saved in step 1, or the local path that was given:

```dispatch
findings: {ticket_dir}/triage/findings.md
recommendations: {ticket_dir}/triage/recommendations.md
root: {repository root}
```

**A reply that lacks the `Phase: disposition-challenge` line is a challenger stopped by its turn limit.** Resume it once, asking only for its report; on Claude Code, send it a message with `SendMessage`, addressed by the agent ID that its dispatch returned. When the resumed challenger still does not return a report, do not dispatch again: Record the challenge as not returned, treat every item as unchallenged, and say so in the record's `challengeSummary`.

Save the reply as `challenge.md`. Then take each item in turn: Defend the recommendation when the argument fails on the evidence, modify it when the argument stands in part, and abandon it when the argument stands.

Decide the blockers of every `ticket` item under the threshold in the ticketing preferences rulebook: An item is blocked by another ticket when there is some probability that the other ticket affects it and should be merged first, and a ticket whose design takes another ticket's outcome as an input is blocked by it. A blocker is another `ticket` item, by id, or an open issue in this repository outside the triage, by number; check each issue with `gh issue view {issue} --json state`, and omit a closed one, which does not block. Record every such dependency in `blockedBy`, never in `notes`.

Write `dispositions.json` in the helper's record shape: `source` (the findings as given), `triageTicket`, `umbrella: null`, `items`, `challengeSummary` (what the challenge refuted or narrowed and what it did not), and `notes` (the lines of the comment's "Labels and follow-ups" section, empty when there are none). Each item has `id`, `title`, `disposition`, `confidence`, `value`, `reason`, `target` (the issue number of a `comment`, the target id of a `merge`, null otherwise), `ticket: null`, `blockedBy` on a `ticket` item that has blockers (item ids and issue numbers), `evidence` with `key` and `paths` on an item whose inventory row has them (omitted otherwise), and `challenge` with `argument`, `outcome` (`defended`, `modified`, or `abandoned`), and `note`. When any item has `evidence`, write the output of `git rev-parse HEAD` into the record's `commit`. Run the helper's `validate`, which reports every schema and gate violation at once, a cycle among the blockers included, and fix the record until it passes.

### 5. Checkpoint: The dispositions

Present the dispositions as a table (item, disposition, confidence, value, blocked by, reason, challenge outcome), in the order that `validate` reports as `order`, which places every blocker before the items that it blocks, and the challenge summary, and ask in the action-items block for approval. Revise the record until the developer approves it; re-run `validate` after each change. Once the developer approves, and when any item has `evidence`, set the record's `commit` again to the output of `git rev-parse HEAD`, so that it names the commit at which the dispositions were approved and a later run can tell whether an item's paths changed after the disposition, and run `validate` once more.

<!-- include: ../_partials/action-items.md / -->

### 6. Compose and confirm

Compose the bodies:

- **The umbrella**, when at least one item is a `ticket`: its problem (the follow-up work of the findings), its context (a link to the triage ticket, and the tickets that the findings filed without adopting them, listed and not made children), and "Every child is closed" as its acceptance criterion. It does not take a graded label.
- **One child per `ticket` item**, in the ticket skeleton that {skill:create-ticket} step 2 states: problem, context, and acceptance criteria, with the title and reason of every `merge` item that targets it folded in. Its labels are `confidence:{grade}` and `value:{grade}`.

Run the helper's `render --preview` to `{ticket_dir}/triage/preview/`, which writes the dispositions comment with `(pending)` where a number is not yet known, and one comment file per issue that a `comment` disposition names.

Show everything that step 7 will create or post in one block: every body with its title and labels, the parent relationship and the blockers of each child, every per-issue comment with its issue, and the dispositions comment. Confirm once in the action-items block. This confirmation is the only one: {skill:create-ticket} does not re-confirm a relationship given as an argument.

### 7. Write

Nothing before this step writes anything remote. On a failed write, stop and report which item failed; every number already recorded stays in `dispositions.json`, so that a re-run of this step creates only what is still null and checks each issue before posting on it.

1. When at least one item is a `ticket` and `umbrella` is null, create the umbrella with {skill:create-ticket}, and write its number into `umbrella`.
2. For each `ticket` item, in the order that `validate` reports as `order` for the approved record, run {skill:create-ticket} with `--parent {umbrella}` and `--label confidence:{grade},value:{grade}`, adding `--blocked-by` with the item's blockers as `#{number}` (the recorded `ticket` of each item id, and each issue number) when it has any, and write the returned number into the item's `ticket` as soon as it is returned. Because `order` places every blocker first, each item id that `--blocked-by` names already has its number.
3. For each `ticket` item, read `gh issue view {ticket} --json parent,blockedBy`, and add what is missing in one `gh issue edit {ticket} --parent {umbrella} --add-blocked-by {numbers}` call, omitting a flag that has nothing to add. {skill:create-ticket} sets the parent and the blockers in one call, so a rejected blocker can drop the parent as well, and this read-back is how a failed link is found. On a re-run, it completes the links of the items that an earlier run created.
4. Run the helper's `render` to `{ticket_dir}/triage/rendered/`, without `--preview`.
5. Post each `comment-{issue}.md` on its issue, and then `dispositions-comment.md` on the triage ticket. Before each post, read the issue's comments with `gh issue view {issue} --json comments`, and skip the post when a comment already opens with the first line of the rendered file:

   ```bash
   body_path="{ticket_dir}/triage/rendered/comment-{issue}.md"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   gh issue comment {issue} --body-file "$body_path"
   ```

6. Save `dispositions-comment.md`, with frontmatter, as the ticket-level `dispositions` artifact per {skill:save-artifact}.

### 8. Report

Report the umbrella when one was created, each child with its grades and blockers in the order in which step 7 created them, each issue commented on, and the artifact's path. The triage ticket stays open: Closing it is the developer's call, once they have read the record.

<!-- include: ../_partials/gh-body-file.md / -->
