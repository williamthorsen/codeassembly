---
name: curate-feedback
description: Cull the open feedback events that no longer need attention. Clusters the events by the lesson that they teach, has subagents without session context read the current guidance and sort every event into covered, duplicate, obsolete, or kept, and then, once the developer approves or under --apply, marks the culled events addressed-by or obsolete, recording the run in a curation artifact. Use when the feedback pool has grown with lessons that guidance has since absorbed, or before a triage-feedback run.
user-invocable: true
---

# Curate feedback

Cull the feedback events that no longer need attention, and do nothing else: This skill does not surface lessons, file tickets, or edit guidance. You inventory and cluster the open `feedback` events, pin every guidance repository at a commit, have one {subagent:feedback-coverage-judge} per group of clusters sort each event into a bin, and then, once the developer approves, mark the culled events. Two bundled helpers do the mechanical work: `lesson-clusters` inventories and clusters the events, and `curate-feedback` prepares the judges' assignments, checks their bins, and writes the record and the artifact.

**Announce at start:** "Using curate-feedback to cull the feedback events that no longer need attention."

<HARD-GATE>
Never edit a guidance artifact: a skill, a subagent, a rulebook, a partial, a guidance file, or a helper. This skill marks events and nothing else.
</HARD-GATE>

## Arguments

| Argument           | Effect                                                                  | Default     |
| ------------------ | ----------------------------------------------------------------------- | ----------- |
| `--store <name>`   | The event store: a registry name, `@default`, or `@feedback`.           | `@feedback` |
| `--apply`          | Apply the marks without the approval checkpoint, for an unattended run. | Off         |
| `--group-size <n>` | The most events in one judge's assignment.                              | 60          |
| `--list`           | Show the per-event listing at the checkpoint and in the report.         | Off         |

## Bins and marks

Each judge sorts each event into one bin, and step 7 marks it accordingly:

- `covered`: Guidance at its pinned commit states the lesson, in a sentence that the judge quotes and that `validate` finds in the file. The event is marked `addressed-by` a GitHub permalink to the file at that commit.
- `duplicate`: An already-addressed event teaches the same lesson. The event is marked `addressed-by` that event's references, other than triage artifacts and covered permalinks.
- `obsolete`: The target was removed without a successor, a later deliberate decision overruled the lesson, or it concerns a harness or model no longer in use. The event is tagged `obsolete`.
- `kept`: The event stays in the pool, and nothing is written.

An event that is marked or tagged drops out of every later inventory, so a rerun continues where a run stopped.

## Process

`<store>` below is the `--store` argument, `@feedback` when it is omitted. Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `error` and `message`, except when a step below says otherwise. Invoke the helpers as:

```bash
node {harness_home_dir}/skills/lesson-clusters/lesson-clusters.mjs {command} {flags}
node {harness_home_dir}/skills/curate-feedback/curate-feedback.mjs {command} {flags}
```

### 1. Preflight

1. Run `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` and read `artifact_base_dir`, `project_slug`, and `ticket_id`.
2. Fix the artifact's path. The directory is `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` when `ticket_id` is set, and `{artifact_base_dir}/projects/{project_slug}/feedback-curation/` otherwise; the `feedback-curation/` name is hardcoded. The filename is `{YYYYMMDD-HHMMSSZ}_{slug}_feedback-curation.md`, with the current UTC time and a slug per {skill:save-artifact}, or `curation` when nothing else suits.
3. Create the work directory `{timestamp}_work/` beside the artifact, where `{timestamp}` is the filename's prefix. Every working file goes there.

### 2. Pin the guidance

1. Run `codeassembly library list --json` and `codeassembly library list --global --json`, and collect the `dir` of every source in either listing. A listing that fails because its domain does not declare a source contributes nothing.
2. Run `curate-feedback pin --out {work}/pins.json`, with one `--source` for each collected directory and one for the current repository's root.
3. Report each `skipped` source with its reason: A judge cannot mark an event covered by guidance in a skipped source. Stop when `pins` is empty.

### 3. Cluster

<!-- include: ../_partials/cluster-feedback-events.md / -->

### 4. Assign

1. Run `curate-feedback references --store <store> --out {work}/references.json`.
2. Run `curate-feedback assign --inventory {work}/inventory.json --map {work}/map.json --references {work}/references.json --pins {work}/pins.json --out {work}/assignments`, adding `--group-size {n}` when it was given. Its `assignments` list gives each assignment's `path` and the `bins` path to which its judge writes.

### 5. Judge

1. Send one {tool:Task} call per assignment, all in one message, `subagent_type: feedback-coverage-judge`, each with this block and nothing else composed into it:

   ```dispatch
   assignment: {assignment path}
   output: {bins path}
   ```

2. **A reply that lacks the `Phase: feedback-coverage` line is a judge stopped by its turn limit.** Resume that judge once, asking only for its bins file and its report; on Claude Code, send it a message with `SendMessage`, addressed by the agent ID that its dispatch returned.
3. Run `curate-feedback validate --assignments {work}/assignments --out {work}/record.json`. On `invalid-bins`, resume the judge of each bins file that the `violations` name once, sending it that file's violations and asking it to correct its bins file. Run `validate` again, and on a second failure, stop and report the violations.

### 6. Checkpoint: The marks

Under `--apply`, skip this step.

Present the `counts` lines that `validate` reports, one per bin, then the marks from `record.json`: one line per `marks.addressedBy` group, with its reference and event count, and one line for `marks.obsolete`. Under `--list`, add a table of every event in `record.json` with its summary, bin, reference, reason, and quote. Ask in the action-items block for one approval of every mark.

The developer may move events between bins by id in the reply. For each move, edit the entry in the bins file that the event's `file` in `record.json` names. A move into `covered` needs the guidance file, and a move into `duplicate` needs the addressed event; ask for either when the reply does not name it. For a move into `covered`, read the file at its pin with `git -C {root} show {sha}:{path}` and copy the sentence that states the lesson into the entry's `quote`. Then run `validate` again, and present only the changed counts and marks before writing. The approval covers every mark that step 7 applies.

<!-- include: ../_partials/action-items.md / -->

### 7. Apply

Nothing before this step writes to the store. For each group in `marks.addressedBy`, then for `marks.obsolete` when its `eventIds` is not empty, run {skill:kb-update-events} and write the result into the group's `result` in `record.json` as soon as it returns:

- **An `addressedBy` group**: `node {harness_home_dir}/skills/kb-update-events/kb-update-events.mjs --store <store> --add-addressed-by={the group's references, comma-joined} {event ids}`.
- **`obsolete`**: `node {harness_home_dir}/skills/kb-update-events/kb-update-events.mjs --store <store> --add-tag obsolete {event ids}`.

A result is `{ "ok": true, "failed": [] }` when every event's result has `ok: true`, and `{ "ok": false, "failed": [ids] }` otherwise. On a failed write or an `ok: false` result, stop applying, report which group failed, and continue to step 8, so that the artifact records what was applied.

### 8. Record and report

Run `curate-feedback render --file {work}/record.json --out {work}/artifact.md`. Save the rendered body, with frontmatter, at the artifact path fixed in step 1, per {skill:save-artifact}.

Report the `counts` lines, the marks applied, any failure, the skipped sources, and the artifact's path. Under `--list`, add the per-event table; otherwise leave the listing in the artifact. The report is the same under `--apply`.
