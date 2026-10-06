---
name: groom-backlog
description: Sweep a GitHub backlog for obsolete tickets, assess each open ticket through dispatched subagents, apply one disposition policy, and record each outcome as a ticket comment
user-invocable: true
---

# Groom backlog

Sweep a repository's open GitHub issues for tickets whose motivation other work has met, whose premise the codebase has outgrown, or whose fate hinges on another ticket. A bundled helper does the mechanical half: It fetches and selects the tickets, detects which are in progress, finds candidate cross-references, keeps the ledger, classifies each assessment under the policy, proposes an action for each escalation, and renders the digests, the drafted edits, and the comments. You do the rest: one `{subagent:ticket-assessor}` subagent per ticket, one confirmation per digest page, and every write to GitHub.

The sweep decides by default. Every selected ticket is assessed, and each digest page asks one question: whether to apply the actions that it proposes.

**Announce at start:** "Using groom-backlog to sweep the open tickets of {repository} (run {run id}{, dry run})."

## Arguments

| Argument                       | Description                                                                                                                          | Default        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `--close-not-planned <reason>` | Close the selected tickets as not planned, for `<reason>`, without assessing them. Requires `--scope` or `--older-than`. See step 3. | Off            |
| `--dry-run`                    | Assess and render the digests without any write to GitHub and without any decision.                                                  | Off            |
| `--exclude-label <label>`      | Leave out the tickets that have this label, matched exactly. Repeatable.                                                             | None           |
| `--limit <N>`                  | Assess at most `N` tickets, counted after the tickets that this run already assessed.                                                | All            |
| `--model <alias>`              | The model of each assessor: `opus`, `sonnet`, or `haiku`.                                                                            | `opus`         |
| `--older-than <age>`           | Keep the tickets last updated more than `<N>d` days or `<N>w` weeks ago.                                                             | All            |
| `--page-size <N>`              | Escalations per digest page, from 20 to 30.                                                                                          | 25             |
| `--run <id>`                   | The run id that the ledger records and the markers contain. A run resumes under its own id.                                          | `{YYYY-MM-DD}` |
| `--scope <name>`               | Keep the tickets that have the label `scope:<name>`; `scope:<name>` also works. Repeatable.                                          | All            |

`--run` defaults to today's date in UTC. `--dry-run` appends `-dry-run` to the run id, whether it is the default or given explicitly: A later real run then does not skip the tickets that the dry run assessed.

GitHub alone is supported, through `gh`. On any other platform, stop at step 1 and report that the skill does not support it.

## Decision policy

The helper's `ingest` command classifies each assessment into one class, and you apply that class's action. The classes are tested in this order, and the first match wins.

| Class                  | Action                                                                                                                                | Comment                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `silent-keep`          | A `keep` whose verdicts are all baseline, whether or not the ticket is in progress. Keep it open.                                     | Never                                                 |
| `escalate-in-progress` | Any other assessment of a ticket that a detected signal shows to be under way. Present it in a digest, and apply the user's decision. | As for `escalate`, once the user decides              |
| `auto-close-complete`  | A high-confidence `close-complete` with a verified reference, or with `complete` progress and evidence. Close as complete.            | Always                                                |
| `auto-close-half-met`  | A high-confidence reply under the half-met rule. Close as superseded.                                                                 | Always, with the `Remainder` section                  |
| `escalate`             | Every other assessment. Present it in a digest, and apply the user's decision.                                                        | On a close, and on a keep with a non-baseline verdict |

**The half-met rule.** A ticket whose motivation other work has met, and whose remainder does not have acceptance criteria of its own, closes as superseded with a comment whose `Remainder` section lists each unmet part, so that a reader can reopen it from the comment alone.

**Cross-references.** The helper's pass finds candidates by text, and only the assessor's verification makes one evidence: `auto-close-complete` counts a reference only when the assessor marked it verified.

**An in-progress ticket is never closed, edited, or commented on unless the user names its digest entry**, whatever its assessment: Its entry always proposes `leave`, and a bulk close leaves it out. The sweep never rewrites the Problem, Context, or Proposed solution of an in-progress ticket, because those sections record what was known when its work began; the helper refuses such a draft. A silent keep neither closes nor comments, so it applies to an in-progress ticket as to any other.

**Baseline verdicts.** The silent keep and the comment rule both read the baseline:

<!-- include: ../../_partials/ticket-assessment-baseline.md / -->

The helper applies the umbrella case in `ingest` and in `comment`.

**What each escalation proposes.** The helper's `digest` command proposes one action per entry, and a confirmed page applies it:

| Assessment                                                | Proposed action              |
| --------------------------------------------------------- | ---------------------------- |
| A ticket in progress, whatever its recommendation         | `leave`                      |
| `update`, `revise`, or `split`                            | The same, applying the draft |
| `close-complete` or `close-superseded` at high confidence | The same close               |
| A `keep`                                                  | `keep`                       |
| Anything else, including a close below high confidence    | `leave`                      |

`leave` writes nothing; the entry still shows the recommendation, so that the user can name it. The assessor drafts the edit behind every `update`, `revise`, and `split`: the replacement sections of the body and, for a split, the child tickets. The digest shows each draft under its entry.

**What the digest groups.** A hub is an open ticket on whose outcome two or more escalations of one digest page depend; the page shows it once, above its dependents, so that the user decides it first. Overlapping open tickets are merged into one group with the assessors' recommended survivor. Merging tickets stays the user's action, through the ticket skills.

## Dry-run boundary

`--dry-run` runs steps 1 to 4 and renders the digests of step 6 with their proposals, then stops. It records the policy and every assessment in the ledger under its own run id. It does not record any decision, post any comment, edit, create, or close any ticket, and it reports what each auto class and each bulk close would have done.

## Process

Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `error` and `message`, except where a step below says otherwise. Invoke the helper as:

```bash
node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs {command} --run {run} {flags}
```

Create a scratch directory once for the run with `mktemp -d "${TMPDIR:-/tmp}/groom-backlog.XXXXXX"`, and write its absolute path in each place below where `{scratch}` appears: The {tool:Write} tool does not expand shell syntax.

The ledger is `local/ticket-triage/ledger.jsonl` in the primary worktree, which a run from a linked worktree shares; the helper reports its path. If the sandbox denies a write there, stop, and ask the user to allow that path. Do not move the ledger.

### 1. Preflight

1. Run `gh auth status` and `gh repo view --json nameWithOwner`. If either fails, or the repository is not on GitHub, stop and report why.
2. Resolve the run id per [Arguments](#arguments). If `--close-not-planned` is given without `--scope` or `--older-than`, stop and report that a bulk close needs one of them.
3. Record the run's policy. Write the record with {tool:Write} to `{scratch}/policy.json`, then pass it on stdin:

   ```json
   {"kind":"policy","decidedBy":"user","decisions":{"skill":"groom-backlog","model":"{model}","dryRun":{true|false},"pageSize":{N},"scopes":[],"excludeLabels":[],"olderThan":null,"limit":null,"closeNotPlanned":null}}
   ```

   `closeNotPlanned` is the reason given to `--close-not-planned`, or `null`.

   ```bash
   node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs record --run {run} < {scratch}/policy.json
   ```

### 2. Collect

```bash
node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs collect --run {run} --out {scratch}/tickets \
  --scope {name} --exclude-label {label} --older-than {age} --limit {N}
```

Pass only the selectors that the invocation names. The result contains `sha`, `counts`, `resumed` (the tickets that this run already assessed and that have not changed since), `pendingAutomatic` (the resumed tickets whose auto-close class does not have a decision yet, each with its `class`), `groups`, and `tickets`. Each group contains its `scope` (`null` for the unscoped group), its tickets oldest first with any `inProgress` signal, and its `waves`. Each ticket's input file is at `{scratch}/tickets/{number}.json`.

If `counts.total` is 0, go to step 5 when `pendingAutomatic` is not empty, and to step 6 otherwise: A resumed run can still have pending closes and open escalations.

### 3. Close in bulk, under `--close-not-planned`

Without `--close-not-planned`, go to step 4: Every selected ticket is assessed.

With it, list the selected tickets that do not have an in-progress signal, each with its number and title, and ask one confirmation in the action-items block before any write. On confirmation, for each listed ticket, render the bulk comment, post it, close the ticket, and record the decision, per [Writing to GitHub](#writing-to-github), with `--decision close-not-planned --decided-by bulk --reason "{reason}"`. The in-progress tickets stay open: Dispatch only them in step 4. On refusal, write nothing and stop.

Under `--dry-run`, list the tickets that would close, and write nothing.

### 4. Dispatch the assessors

Dispatch the waves of every group, in group order; under `--close-not-planned`, only the in-progress tickets. For each wave, send up to four `{tool:Task}` calls with `subagent_type: ticket-assessor` in one message, each with `model` set to `--model`. Dispatch each ticket with this block:

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

Run `digest` once, and walk the pages of that one result: A `leave` stays undecided, so a second `digest` call would present it again.

The result contains the run's open escalations, `total`, and `pages`: each escalation whose latest assessment escalated and that does not have a decision recorded after it. Each page's `entries` give each entry's `proposed` action, a `decision` with an optional `supersededBy`. Present one page at a time, verbatim from its `markdown`, and close the turn with an action-items block that asks one question: whether to apply the page's proposed actions. The user answers `yes` to apply them all, or names the entries to change, in the decision vocabulary (`keep`, `update`, `revise`, `split`, `close-complete`, `close-superseded` optionally by `#N`, `close-not-planned`, or `leave`), with an optional reason: `yes, except 3 keep, 5 close-superseded by #40`. Naming a `leave` entry applies what it names. A `no` without changes applies nothing on the page.

Under `--dry-run`, present every page, take no decisions, and go to the summary.

### 7. Apply the confirmed actions and summarize

For each entry whose confirmed action is not `leave`, per [Writing to GitHub](#writing-to-github), with `--decided-by user`:

- **A close** posts the comment and closes the ticket.
- **`update`, `revise`, or `split`** composes the draft, applies it, posts the comment when the `comment` result has `post: true`, and records the decision. When the entry's reply does not have a draft (the user named the edit on an entry that did not recommend it), or `draft` reports `stale: true`, `missing-draft`, or `frozen-section`, write nothing for that entry and name it in the summary.
- **`keep`** posts the comment when the `comment` result has `post: true`, and records the decision in either case. The ticket stays open.
- **`leave`** writes nothing: neither a comment nor a decision record. A resumed run's digest presents the ticket again.

Present the next page once the current one is applied.

Then summarize the run: the counts per class, the tickets closed, edited, split, kept, and commented on, the entries left, the drafts skipped and why, the tickets whose replies failed validation, and the ledger's path.

## Writing to GitHub

Every action on a ticket follows one order: apply the drafted edit when the decision is `update`, `revise`, or `split`, render the comment, post it, close the ticket when the decision is a close, and record the decision last, so that the ledger never records an action that did not happen.

1. **Apply the draft**, for `update`, `revise`, and `split`. Compose it:

   ```bash
   node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs draft --run {run} --number {number} --out {scratch}/drafts/{number}
   ```

   When the result has `stale: true`, the ticket changed after the assessor read it: Skip the ticket without any write. Otherwise, for a split, create each child in `children`, in order, and link it to the ticket, reading each child's number from the URL that `gh issue create` prints:

   ```bash
   body_path="{child path}"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   gh issue create --title "{child title}" --body-file "$body_path"
   ```

   ```bash
   gh issue edit {child number} --parent {number}
   ```

   Then replace the ticket's body:

   ```bash
   body_path="{body path}"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   gh issue edit {number} --body-file "$body_path"
   ```

2. **Render the comment** to a file:

   ```bash
   node {harness_home_dir}/skills/groom-backlog/groom-backlog.mjs comment --run {run} --number {number} \
     --decision {decision} --decided-by {policy|user|bulk} --out {scratch}/comments/{number}.md \
     --reason "{reason}" --superseded-by {N} --children {N,N}
   ```

   Pass `--reason` when the user stated one, `--superseded-by` when the decision names the superseding ticket, and `--children` with the created children's numbers for a split. `--decision` is one of `keep`, `close-complete`, `close-superseded`, `close-not-planned`, `update`, `revise`, and `split`.

   The result's `post` states whether the comment is posted. When it is `false`, the helper writes no body: Skip to step 5.

3. **Post it**, per [gh body file](#gh-body-file):

   ```bash
   body_path="{scratch}/comments/{number}.md"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   gh issue comment {number} --body-file "$body_path"
   ```

4. **Close it**, for a close: `gh issue close {number} --reason completed` for `close-complete`, and `gh issue close {number} --reason "not planned"` for every other close.

5. **Record the decision.** Write the record with {tool:Write} to `{scratch}/decisions/{number}.json`, then pass it on stdin:

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
