---
name: triage-feedback
description: Surface the few feedback lessons worth acting on. Clusters the open feedback events by the lesson that they teach, shows each cluster's recurrence, impact, and recency, has a subagent without session context challenge every priority, and then, once the developer approves, files tickets, defers clusters, or changes impact ratings, recording every disposition in a triage artifact. Use when captured feedback has accumulated and the developer wants to know which lessons deserve a guidance change.
user-invocable: true
---

# Triage feedback

Surface the feedback lessons worth acting on. You inventory the open `feedback` events, have a {subagent:lesson-clusterer} group them by lesson, assign each cluster a priority, have a {subagent:feedback-triage-challenger} argue against every priority, and then, once the developer approves, apply the dispositions and record them. Two bundled helpers do the mechanical work: `lesson-clusters` inventories the events and computes each cluster's signals, and `triage-feedback` validates the triage record and renders the artifact.

**Announce at start:** "Using triage-feedback to surface the feedback lessons worth acting on."

<HARD-GATE>
Never edit a guidance artifact: a skill, a subagent, a rulebook, a partial, a guidance file, or a helper. A lesson reaches guidance through the ticket that this skill files, and a later change acts on it.
</HARD-GATE>

## Arguments

| Argument            | Effect                                                                                   | Default     |
| ------------------- | ---------------------------------------------------------------------------------------- | ----------- |
| `--limit <n>`       | The number of clusters to surface.                                                       | 5           |
| `--store <name>`    | The event store: a registry name, `@default`, or `@feedback`.                            | `@feedback` |
| `--defer-days <n>`  | The days for which a deferred cluster stays out; overrides `triage_feedback.defer_days`. | 30          |
| `--resume <record>` | Resume a run that stopped during step 7, from its `record.json`.                         |             |

With `--resume`, read the record, run `validate` on it, and go to step 7: `validate` reports as `pending` the clusters whose writes are not finished.

## Signals, priorities, and dispositions

The `clusters` command computes three signals for each cluster, and the skill shows them separately, never as one score: **recurrence** (the number of events), **impact** (the count of events at each rating, unrated included), and **recency** (the latest capture).

A priority states whether the lesson is worth acting on now: `high` (act now), `medium` (worth acting on, but arguable), or `low` (not yet). A borderline cluster takes the lower priority. Each priority has a one-sentence reason that cites the signals.

Each surfaced cluster takes one disposition:

- `ticket-existing`: a ticket to change the guidance artifact that should have taught the lesson.
- `ticket-new`: a ticket to create a guidance artifact for a lesson that no artifact covers.
- `ticket-undecided`: a ticket whose target a later refinement pass places.
- `impact`: a new impact rating on the cluster's events, for a cluster whose ratings misstate it.
- `defer`: set aside until the deferral interval passes or the cluster gains a new event.

A ticket disposition names the repository that owns its target:

- An artifact with a `<!-- codeassembly-` marker, or one in the CodeAssembly guidance library, belongs to the CodeAssembly repository, whose name the marker's provenance or the library's `Source:` line states.
- A project's `.agents/content` artifact belongs to that project's repository: Take it from the events' `repo` field, and confirm it with `gh repo view {repo} --json nameWithOwner`.
- A new or undecided target belongs to the current repository.

## Process

`<store>` below is the `--store` argument, `@feedback` when it is omitted. Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `error` and `message`, except when a step below says otherwise. Invoke the helpers as:

```bash
node {harness_home_dir}/skills/lesson-clusters/lesson-clusters.mjs {command} {flags}
node {harness_home_dir}/skills/triage-feedback/triage-feedback.mjs {command} {flags}
```

### 1. Preflight

1. Run `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` and read `artifact_base_dir`, `project_slug`, and `ticket_id`.
2. Fix the artifact's path now, because a deferral references it. The directory is `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` when `ticket_id` is set, and `{artifact_base_dir}/projects/{project_slug}/feedback-triage/` otherwise; the `feedback-triage/` name is hardcoded. The filename is `{YYYYMMDD-HHMMSSZ}_{slug}_feedback-triage.md`, with the current UTC time and a slug per {skill:save-artifact}, or `triage` when nothing else suits.
3. Create the work directory `{timestamp}_work/` beside the artifact, where `{timestamp}` is the filename's prefix. Every working file goes there.
4. Run `gh auth status`. When it fails, report that tickets cannot be filed, and continue only when the developer accepts a run that defers or rates.

### 2. Cluster

An inventory is clustered in batches, because one clusterer cannot place every event of a large store. Each batch is clustered on its own, and when there is more than one, a merge pass groups the batch clusters that teach the same lesson.

1. Run `lesson-clusters inventory --store <store> --out {work}/inventory.json`. Report each `skipped` file, and stop when `pool` and `deferred` are both zero: Nothing awaits triage.
2. Run `lesson-clusters batch --inventory {work}/inventory.json --out {work}/batches`. Its `batches` list gives each batch's `path` and the `map` path to which its clusterer writes.
3. Send one {tool:Task} call per batch, all in one message, `subagent_type: lesson-clusterer`, each with this block and nothing else composed into it:

   ```dispatch
   inventory: {batch path}
   output: {batch map path}
   ```

4. When there is one batch, its map is the event map: Go to the last sub-step with `--map {work}/batches/map-01.json`.
5. Run `lesson-clusters lessons --batches {work}/batches --out {work}/lessons.json`. On `invalid-map`, resume the clusterer of each batch that the `violations` name once, sending it that batch's violations and asking it to correct its map; on Claude Code, send it a message with `SendMessage`, addressed by the agent ID that its dispatch returned. Run `lessons` again, and on a second failure, stop and report the violations.
6. Send one more {tool:Task} call, `subagent_type: lesson-clusterer`, for the merge pass:

   ```dispatch
   inventory: {work}/lessons.json
   output: {work}/merge.json
   ```

7. Run `lesson-clusters combine --batches {work}/batches --lessons {work}/lessons.json --map {work}/merge.json --out {work}/map.json`. On `invalid-map`, resume the merge clusterer once with the violations, run `combine` again, and on a second failure, stop and report them.
8. Run `lesson-clusters clusters --inventory {work}/inventory.json --map {work}/map.json --limit {limit} --out {work}/clusters.json`, adding `--defer-days {n}` when it was given. `clusters.json` lists the candidates, the clusters that the triage ranks: each signal nominates its own top clusters, four times `--limit` of them, so that a single critical event or a recent spike is considered beside the clusters that recur most. `unranked` counts the clusters that no signal nominated.

### 3. Recommend

Read `clusters.json`. Assign every candidate a priority and a reason, then order the clusters by priority, recurrence, and latest capture; the first `--limit` clusters are surfaced. For each surfaced cluster, suggest a disposition, and for a ticket disposition, find the target: Search the guidance for the artifact that states or should state the lesson, and decide its repository by the rules above.

Write `{work}/recommendations.md`: one line per cluster, with its id, priority, disposition, target, target repository, and a one-sentence reason. Write a line for every candidate, not only the surfaced ones, because the challenger argues against every priority. Nothing else goes in the file, because the challenger reads it and a sentence of your reasoning there would bias its judgment toward yours.

### 4. Challenge

Send one {tool:Task} call, `subagent_type: feedback-triage-challenger`, with this block and nothing else composed into it:

```dispatch
clusters: {work}/clusters.json
recommendations: {work}/recommendations.md
root: {repository root}
```

**A reply that lacks the `Phase: feedback-triage-challenge` line is a challenger stopped by its turn limit.** Resume it once, asking only for its report. When the resumed challenger still does not return a report, do not dispatch again: Record every challenge with the outcome `not-returned`.

Save the reply as `{work}/challenge.md`. Then take each cluster in turn: Defend the priority and the disposition when the argument fails on the evidence, modify them when the argument stands in part, and abandon the priority, by lowering it, when the argument stands. A changed priority can change which clusters are surfaced; re-apply the order and the limit.

Write `{work}/record.json` in the helper's record shape: `store` (the store name that the inventory reports), `limit`, `artifactPath` (the artifact's path with the home directory written as `~`), `clusters` (the candidates), `unranked` (as `clusters.json` reports it), and `remainder` (`clusters` and `events`, the count of clusters not surfaced, unranked ones included, and of their events, and `excluded`, the number of clusters in the `excluded` list of `clusters.json`). Each cluster carries the fields of `clusters.json` plus `priority`, `reason`, `challenge` (`argument`, `outcome`, `originalPriority` when the outcome changed the priority, and `note`), and `surfaced`. A surfaced cluster also carries `suggested` (`kind`, then `target` and `repo` for a ticket kind, with `target: null` for `ticket-undecided`, or `level` for `impact`) and `result: null`. Run `triage-feedback validate --file {work}/record.json`, which reports every violation at once, and fix the record until it passes.

### 5. Checkpoint: The dispositions

Present the surfaced clusters as one table: cluster, lesson, recurrence, impact, latest capture, priority, reason, challenge outcome, and disposition. Below it, state the remainder in one line: "{clusters} more clusters, {events} events, remain in the pool; {excluded} deferred clusters are excluded." Ask in the action-items block for one approval of every disposition.

The developer may change a row in the reply. Record the change in the record, setting `decision: modified` and keeping the suggestion that it replaced in `originalSuggested`; re-run `validate`, and present only the changed rows again before writing. On approval, set `decision` on every surfaced cluster: `approved`, `modified`, or `declined`. This approval covers every ticket that step 7 files, so {skill:create-ticket} does not confirm again.

<!-- include: ../_partials/action-items.md / -->

### 6. Compose

For each ticket disposition, compose the body in the ticket skeleton that {skill:create-ticket} step 2 states. The problem states the lesson; the context lists the event ids under the store name, with the signals; the proposed solution names the target, or states "Target: undecided; a refinement pass places it."; the acceptance criteria state the behavior that the lesson asks for.

### 7. Write

Nothing before this step writes to a tracker or a store. Process each approved or modified cluster in surfacing order, and write its `result` into the record as soon as each write returns, so that a `--resume` run repeats only what is missing. On a failed write, stop and report which cluster failed.

- **A ticket disposition**: When `result.ticket` is not yet set, create the ticket with {skill:create-ticket}, adding `--repo {repo}` when the target's repository differs from the current one, and record its URL as `result.ticket`, with `marked: false`. Then mark the events with {skill:kb-update-events}: `--store <store> --add-addressed-by={ticket URL}` and the event ids. Set `marked: true`.
- **`defer`**: Run {skill:kb-update-events} with `--store <store> --add-tag deferred` and the event ids, then with `--add-addressed-by={artifactPath}`. Set `result` to `{ "marked": true }`.
- **`impact`**: Run {skill:kb-update-events} with `--store <store> --set-impact {level}` and the event ids. Set `result` to `{ "marked": true }`.

Each {skill:kb-update-events} result reports each event; treat any event whose result has `ok: false` as a failed write. A declined cluster does not write anything.

### 8. Record and report

Run `triage-feedback validate` on the final record, then `triage-feedback render --file {work}/record.json --out {work}/artifact.md`. Save the rendered body, with frontmatter, at the artifact path fixed in step 1, per {skill:save-artifact}.

Report each filed ticket with its repository, each deferred or rated cluster, each declined cluster, the remainder line, and the artifact's path.
