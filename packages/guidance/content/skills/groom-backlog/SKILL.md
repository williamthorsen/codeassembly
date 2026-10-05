---
name: groom-backlog
description: Sweep a GitHub backlog for obsolete tickets, assess each open ticket through dispatched subagents, apply one disposition policy, and record each outcome as a ticket comment
user-invocable: true
---

# Groom backlog

Sweep a repository's open GitHub issues for tickets whose motivation other work has met, whose premise the codebase has outgrown, or whose fate hinges on another ticket. A bundled helper does the mechanical half: It fetches and selects the tickets, detects which are in progress, finds candidate cross-references, keeps the ledger, classifies each assessment under the policy, and renders the digests and the comments. You do the interactive half: the bulk decisions, one `{subagent:ticket-assessor}` subagent per ticket, the escalation digests, and every write to GitHub.

With `--related-to <#>`, the sweep is a ripple: It assesses the open tickets related to one closed ticket rather than the backlog, so that a merge's effect on them is weighed while it is fresh.

**Announce at start:** "Using groom-backlog to sweep the open tickets of {repository} (run {run id}{, dry run})." For a ripple, say "the open tickets related to #{N}" in place of "the open tickets".

## Arguments

| Argument                  | Description                                                                                 | Default        |
| ------------------------- | ------------------------------------------------------------------------------------------- | -------------- |
| `--dry-run`               | Assess and render the digests without any write to GitHub and without any decision.         | Off            |
| `--exclude-label <label>` | Leave out the tickets that have this label, matched exactly. Repeatable.                    | None           |
| `--limit <N>`             | Assess at most `N` tickets, counted after the tickets that this run already assessed.       | All            |
| `--model <alias>`         | The model of each assessor: `opus`, `sonnet`, or `haiku`.                                   | `opus`         |
| `--older-than <age>`      | Keep the tickets last updated more than `<N>d` days or `<N>w` weeks ago.                    | All            |
| `--page-size <N>`         | Escalations per digest page, from 20 to 30.                                                 | 25             |
| `--related-to <#>`        | Assess the open tickets related to this closed ticket, in place of the backlog.             | Off            |
| `--run <id>`              | The run id that the ledger records and the markers contain. A run resumes under its own id. | `{YYYY-MM-DD}` |
| `--scope <name>`          | Keep the tickets that have the label `scope:<name>`; `scope:<name>` also works. Repeatable. | All            |

`--run` defaults to today's date in UTC. `--dry-run` appends `-dry-run` to the run id, whether it is the default or given explicitly: A later real run then does not skip the tickets that the dry run assessed.

`--related-to <#>` sets the run id to `ripple-{#}`, so that each merge is assessed afresh, and it refuses `--run`, `--scope`, `--exclude-label`, `--older-than`, and `--limit`: Stop and report the conflict. The related set has four tiers, in this order: a ticket that mentions the closed ticket or its closing pull request, a ticket that the closed ticket blocked, the closed ticket's parent and the parent's other open children, and a ticket whose text names a file that the closing pull request touched. A ripple skips step 3 and assesses the whole set.

GitHub alone is supported, through `gh`. On any other platform, stop at step 1 and report that the skill does not support it.

## Decision policy

The helper's `ingest` command classifies each assessment into one class, and you apply that class's action. The classes are tested in this order, and the first match wins.

| Class                  | Action                                                                                                                     | Comment                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `escalate-in-progress` | A detected signal shows work under way. Present it in a digest, and apply the user's decision.                             | As for `escalate`, once the user decides              |
| `auto-close-complete`  | A high-confidence `close-complete` with a verified reference, or with `complete` progress and evidence. Close as complete. | Always                                                |
| `auto-close-half-met`  | A high-confidence reply under the half-met rule. Close as superseded.                                                      | Always, with the `Remainder` section                  |
| `silent-keep`          | A `keep` whose verdicts are all baseline. Keep it open.                                                                    | Never                                                 |
| `escalate`             | Every other assessment. Present it in a digest, and apply the user's decision.                                             | On a close, and on a keep with a non-baseline verdict |

**The half-met rule.** A ticket whose motivation other work has met, and whose remainder does not have acceptance criteria of its own, closes as superseded with a comment whose `Remainder` section lists each unmet part, so that a reader can reopen it from the comment alone.

**Cross-references.** The helper's pass finds candidates by text, and only the assessor's verification makes one evidence: `auto-close-complete` counts a reference only when the assessor marked it verified.

**An in-progress ticket is never closed or commented on before the user decides it in a digest**, whatever its assessment, and a bulk close leaves it out.

**Baseline verdicts.** The silent keep and the comment rule both read the baseline:

<!-- include: ../../_partials/ticket-assessment-baseline.md / -->

**What the digest groups.** A hub is an open ticket on whose outcome two or more escalations of one digest page depend; the page shows it once, above its dependents, so that the user decides it first. Overlapping open tickets are merged into one group with the assessors' recommended survivor. Merging tickets stays the user's action, through the ticket skills.

## Dry-run boundary

`--dry-run` runs steps 1 to 4 and renders the digests of step 6, then stops. It records the policy and every assessment in the ledger under its own run id. It does not record any decision or `ripple` record, post any comment, or close any ticket, and it reports what each auto class and each bulk close would have done.

## Process

Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `error` and `message`, except where a step below says otherwise. Invoke the helper as:

```bash
node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs {command} --run {run} {flags}
```

Create a scratch directory once for the run with `mktemp -d "${TMPDIR:-/tmp}/groom-backlog.XXXXXX"`, and write its absolute path in each place below where `{scratch}` appears: The {tool:Write} tool does not expand shell syntax.

The ledger is `local/ticket-triage/ledger.jsonl` in the primary worktree, which a run from a linked worktree shares; the helper reports its path. If the sandbox denies a write there, stop, and ask the user to allow that path. Do not move the ledger.

### 1. Preflight

1. Run `gh auth status` and `gh repo view --json nameWithOwner`. If either fails, or the repository is not on GitHub, stop and report why.
2. Resolve the run id per [Arguments](#arguments).
3. Record the run's policy. Write the record with {tool:Write} to `{scratch}/policy.json`, then pass it on stdin:

   ```json
   {"kind":"policy","decidedBy":"user","decisions":{"skill":"groom-backlog","model":"{model}","dryRun":{true|false},"pageSize":{N},"scopes":[],"excludeLabels":[],"olderThan":null,"limit":null,"relatedTo":null}}
   ```

   For a ripple, `relatedTo` is the closed ticket's number.

   ```bash
   node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs record --run {run} < {scratch}/policy.json
   ```

### 2. Collect

```bash
node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs collect --run {run} --out {scratch}/tickets \
  --scope {name} --exclude-label {label} --older-than {age} --limit {N}
```

Pass only the selectors that the invocation names. For a ripple, pass `--related-to {#}` and no selector; the helper reports a ticket that is still open as `invalid-args`. The result contains `sha`, `counts`, `resumed` (the tickets that this run already assessed and that have not changed since), `pendingAutomatic` (the resumed tickets whose auto-close class does not have a decision yet, each with its `class`), `groups`, and `tickets`. Each group contains its `scope` (`null` for the unscoped group), its tickets oldest first with any `inProgress` signal, and its `waves`. Each ticket's input file is at `{scratch}/tickets/{number}.json`. A ripple's result also contains `ripple`, the record that step 7 appends; its one group is unscoped and lists the tickets in tier order, and each ticket file has a `ripple` field that names the merge.

If `counts.total` is 0, go to step 5 when `pendingAutomatic` is not empty, and to step 6 otherwise: A resumed run can still have pending closes and open escalations. A ripple whose set is empty goes to step 7, which records it.

### 3. Ask for the bulk decisions

A ripple skips this step, and dispatches its group in step 4.

Ask one question per group, all in one action-items block, before dispatching anything. State the group's scope, its ticket count, its oldest ticket with its date, and the count of in-progress tickets, then offer:

1. Assess the group.
2. Close every ticket in the group as not planned, for a reason that the user states.
3. Skip the group for this run.

Then apply each answer:

- **Assess**: Dispatch the group in step 4.
- **Close**: For each ticket that does not have an in-progress signal, render the bulk comment, post it, close the ticket, and record the decision, per [Writing to GitHub](#writing-to-github), with `--decision close-not-planned --decided-by bulk --reason "{reason}"`. Dispatch the group's in-progress tickets in step 4 rather than close them. Under `--dry-run`, report the tickets that would close, and write nothing.
- **Skip**: Write nothing. The next run offers the group again.

### 4. Dispatch the assessors

Dispatch the waves of every group being assessed, in group order. For each wave, send up to four `{tool:Task}` calls with `subagent_type: ticket-assessor` in one message, each with `model` set to `--model`. Dispatch each ticket with this block:

```dispatch
root: {root}
ticket: {scratch}/tickets/{number}.json
sha: {sha}
```

**The block contains scalars only, and only these keys.** Do not compose prose into it: The assessor reads the ticket file itself, and a sentence written here would bias its judgment toward yours.

**Ingest each reply.** Write the returned text with {tool:Write} to `{scratch}/replies/{number}.md`, then:

```bash
node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs ingest --run {run} --ticket {scratch}/tickets/{number}.json < {scratch}/replies/{number}.md
```

The result states the ticket's `class`. If the result is `invalid-reply`, dispatch that ticket once more; if the second reply also fails, leave the ticket unassessed, which the next run retries, and name it in the summary.

### 5. Apply the automatic classes

Apply the class of each ingested ticket, and of each ticket in `pendingAutomatic` from step 2, per [Decision policy](#decision-policy), per [Writing to GitHub](#writing-to-github), with `--decided-by policy`:

- `auto-close-complete`: `--decision close-complete`.
- `auto-close-half-met`: `--decision close-superseded`.
- `silent-keep`: Record `--decision keep` alone, without a comment.

Under `--dry-run`, report each ticket and the action that its class would take, and write nothing.

### 6. Present the digests

```bash
node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs digest --run {run} --page-size {N}
```

The result contains the run's open escalations, `total`, and `pages`: each escalation whose latest assessment escalated and that does not have a decision recorded after it. Present one page at a time, verbatim from its `markdown`, and close the turn with an action-items block that asks for a decision on each numbered entry: `keep`, `update`, `revise`, `split`, `close-complete`, `close-superseded` (optionally by `#N`), `close-not-planned`, or no decision. The user may answer several entries in one line, such as `1 keep, 2 close-superseded by #40, 3 skip`, and may give a reason.

Under `--dry-run`, present every page, take no decisions, and go to the summary.

### 7. Apply the decisions and summarize

For each decided entry, per [Writing to GitHub](#writing-to-github), with `--decided-by user`:

- **A close** posts the comment and closes the ticket.
- **`keep`, `update`, `revise`, or `split`** posts the comment when any of the ticket's verdicts is not baseline, and records the decision in either case. The ticket stays open.
- **No decision** writes nothing: neither a comment nor a decision record. The next run's digest presents the ticket again.

Present the next page once the current one is applied.

For a ripple, append the `ripple` record from step 2's result once every page is applied, whether or not the set was empty and whether or not every escalation was decided. Write it verbatim with {tool:Write} to `{scratch}/ripple.json`, then:

```bash
node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs record --run {run} < {scratch}/ripple.json
```

Then summarize the run: the counts per class, the tickets closed, kept, and commented on, the escalations left undecided, the tickets whose replies failed validation, and the ledger's path.

## Writing to GitHub

Every action on a ticket follows one order: render the comment, post it, close the ticket when the decision is a close, and record the decision last, so that the ledger never records an action that did not happen.

1. **Render the comment** to a file:

   ```bash
   node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs comment --run {run} --number {number} \
     --decision {decision} --decided-by {policy|user|bulk} --out {scratch}/comments/{number}.md \
     --reason "{reason}" --superseded-by {N}
   ```

   Pass `--reason` when the user stated one, and `--superseded-by` when the decision names the superseding ticket. `--decision` is one of `keep`, `close-complete`, `close-superseded`, `close-not-planned`, `update`, `revise`, and `split`.

2. **Post it**, per [gh body file](#gh-body-file):

   ```bash
   body_path="{scratch}/comments/{number}.md"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   gh issue comment {number} --body-file "$body_path"
   ```

3. **Close it**, for a close: `gh issue close {number} --reason completed` for `close-complete`, and `gh issue close {number} --reason "not planned"` for every other close.

4. **Record the decision.** Write the record with {tool:Write} to `{scratch}/decisions/{number}.json`, then pass it on stdin:

   ```json
   {"kind":"decision","number":{number},"decision":"{decision}","decidedBy":"{policy|user|bulk}","reason":"{reason}","supersededBy":{N}}
   ```

   ```bash
   node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs record --run {run} < {scratch}/decisions/{number}.json
   ```

   Leave out `reason` and `supersededBy` when they do not apply. A decision without a comment, such as a silent keep, takes this step alone.

If a `gh` write fails, stop and report which ticket and which write failed. Do not record a decision for it.

<!-- include: ../_partials/gh-body-file.md / -->

<!-- include: ../_partials/action-items.md / -->
