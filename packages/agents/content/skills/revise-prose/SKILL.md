---
name: revise-prose
description: Sweep a repository's prose against the writing rule set, repair it through dispatched subagents, and record what was swept
user-invocable: true
---

# Revise prose

Sweep a repository's prose against the rules below, repair every clear site, and record what the repository has now been swept for. A bundled helper does the mechanical half: it resolves which files may be swept, extracts their prose, reports over-inclusive candidates, and packs the files into batches. You do the dispatching half: one `{subagent:prose-reviser}` subagent per batch, one commit per batch, and one closing pass over what the subagents would not decide alone.

Apply is the default. `--dry-run` produces the report alone.

**Announce at start:** "Using revise-prose to {report on | revise} prose in {the repository | the given paths}."

## Arguments

| Argument                 | Description                                                               | Required |
| ------------------------ | ------------------------------------------------------------------------- | -------- |
| `<path>`                 | One or more files or directories narrowing the sweep. Repeatable.         | No       |
| `--batch-budget <bytes>` | Ceiling on a batch's combined file bytes. Passed to the helper unchanged. | No       |
| `--dry-run`              | Report and stop: no subagent, no edit, no record write.                   | No       |

With no path, the sweep covers the whole repository. That is this skill's default, because the eradication case is a full sweep. It is where this skill differs from `{skill:revise-comments}`, whose default is the current branch's diff.

## Ordering with `revise-comments`

`{skill:revise-comments}` decides whether a comment exists and what it may say. This skill decides how a span of prose reads, and it never adds, deletes, or shortens a comment. Where both are wanted on the same files, run `{skill:revise-comments}` first: It may delete the very comment that this sweep would otherwise polish.

## Process

### 1. Read the units and the rules from this document

Both come from this document, never from a list held elsewhere. A rule document opts into a detector by naming the rule, so a heading change cannot silently drop a rule, and a project bound to a different rulebook gets candidates only for the rules that it declares.

- **The `plain-speech` unit** is at the version that the `<!-- unit-version: plain-speech <version> -->` marker below names.
- **Each `<!-- rulebook:<slug> -->` block** in the writing-preferences fill at the end of this document is a unit, at the version that its `<!-- rulebook-version: <version> -->` line names. A block naming no version is not a unit, since nothing can key a record on it: Name that slug in the closing summary, and sweep it without recording coverage for it.
- **A detector rule is named to the helper** only where a bound rulebook's body carries a `<!-- rule: <id> -->` marker for it. The rule's unit is the block carrying the marker.

Where the fill is empty, nothing is bound here: The run sweeps `plain-speech` alone and names no rule.

### 2. Run the sweep

```bash
node {harness_home_dir}/skills/revise-prose/revise-prose.mjs detect {paths} \
  --unit plain-speech={version} \
  --unit {slug}={version} \
  --rule {rule-id}={slug}
```

Pass one `--unit` per unit from step 1 and one `--rule` per marker. Add `--batch-budget {bytes}` where the invocation carried one. Omit the paths for a whole-repository sweep.

The helper prints one JSON object to stdout. On success it carries `ok: true`, the `root` that it swept, a `candidates` array, a `batches` array, and a `summary`. On failure it carries `ok: false` with `invalid-args`, `invalid-record`, or `not-a-repository`, the last because the sweep reads what git tracks and has nothing to read outside a working tree. Report a failure and stop.

Read `summary` before anything else. `filesSkipped` counts the prose-bearing files that the sweep held out, keyed by the reason for each; `batchesSkipped` counts the batches that the record already covers; `stale` counts the candidates whose recorded rejection was taken at an older version of its unit.

An empty `batches` array ends the run: Report the summary in one line and stop. The repository is already swept at every unit's current version.

**Under `--dry-run`, the run ends here.** Emit the summary and one candidate table per file, per [Summary format](#summary-format), and stop. Dispatch no subagent, write no record, and edit nothing. One helper run is the whole cost, where a report-then-apply pair would pay for the sweep twice.

**An apply run needs a clean tree.** Where `git status --porcelain` reports anything, stop and report it. Step 4's gate reads `git diff --name-only` as the wave's own work, so an edit already in the tree either trips that gate or, where it sits inside a batch's file list, rides into that batch's commit under the sweep's message. `--dry-run` returns above and edits nothing, so this stop holds only for an apply run.

### 3. Pilot the first batch

Run the pilot where `.agents/revise-prose.yaml` is absent, or where its `units:` block names none of this run's units. A rerun skips this step and goes to step 4.

Dispatch batch 0 alone, per step 4's dispatch shape, and run step 4's checks over it as a wave of one. Accumulate its `rejected` and `questionable` entries for step 5, as step 4 does for every later wave, so the pilot's questionables reach the closing table. Then show the user its report and `git diff --stat`, and ask for a go-ahead before committing that batch and before dispatching anything else.

On a no-go, ask the user before reverting, then revert that batch's files and stop. A miscalibrated subagent is worth catching once per repository, which is the whole reason the first batch runs alone.

### 4. Dispatch the remaining batches in waves

Send up to four `{tool:Task}` calls with `subagent_type: prose-reviser` in one message. A harness that returns each before the next is the series case; attempt no detection of which one you are on.

Before each dispatch, write that batch's candidate objects, exactly as the helper reported them and `stale` flags included, to `${TMPDIR:-/tmp}/revise-prose/batch-{index}.json`.

Dispatch each batch with this block:

```dispatch
root: {root}
files: {the batch's files, comma-separated}
candidates: ${TMPDIR:-/tmp}/revise-prose/batch-{index}.json
rules: {rule-id}, {rule-id}
```

**The block carries scalars only, and only these keys.** Compose no prose into it: The subagent holds the rule set and reads the files itself, and a sentence written here would seed its judgment with yours. A content test fails the build on a line that is not a `key: value` scalar and on a key outside this set.

**On each return, parse the report.** It is one fenced JSON block carrying `applied`, `rejected`, and `questionable`. A return that carries no such block, or one that is truncated, is a redispatch of that batch rather than an edit.

**Once the whole wave has returned:**

1. **Check the diff against the wave.** Run `git diff --name-only`. Every batch in the wave has already edited by now, so the gate is the union of their file lists rather than any one batch's. Where the diff names a file outside that union, stop the run and report which file changed; commit nothing.
2. **Check each report against its own batch.** Where a batch's `applied` entries name a file outside that batch's `files` list, stop the run and report which batch strayed; commit nothing. The union check above cannot see this, the stray landing inside the wave.
3. **Commit each batch in index order.** Stage that batch's files alone and commit them per `{skill:create-commit}`, with type `docs` and the scope that `create-commit` derives from those files. Where the files span workspaces, `describe-change.sh` renders the prefix as `*|docs:`; correct it to a bare `docs:`.
4. **Accumulate** the wave's `rejected` and `questionable` entries for step 5.

### 5. Close the run

1. **Present the questionables** in one table grouped by ground, per [Summary format](#summary-format). The user accepts or rejects each.
2. **Apply the accepted repairs** with the {tool:Edit} tool, phrase to phrase from each entry's `phrase` and `repair`. Stop at the first edit that does not match, so the user sees what diverged.
3. **Compose the fold** and pipe it to the helper's `record` command, which is the record's only write path:

   ```bash
   cat <<'EOF' | node {harness_home_dir}/skills/revise-prose/revise-prose.mjs record
   {"sweptAt":"{today}","units":{"{name}":{"version":"{version}","roots":["{root}"]}},"rejections":[]}
   EOF
   ```

   `sweptAt` is today's ISO calendar date. `units` names every unit from step 1 with the version it is at and its `roots`: the invocation's narrowing paths, or `["."]` for a whole-repository sweep.

   `rejections` holds every subagent rejection plus every questionable that the user rejected, each carrying `rule`, `unit`, `file`, `phrase` as the text reads after this run's edits, and `ground`. Take `unit` from step 1's rule-to-unit mapping rather than from the report, which names no unit.

   **Fold only a rejection whose `rule` is one of the detector rules from step 1.** The helper records a rejection so a later run's detector can match it, so a rejection under a rule with no detector would key nothing and the `record` command refuses it. A `plain-speech` rejection is therefore reported to the user and re-adjudicated the next time its batch is swept. Give the count in the summary.

4. **Commit the closing repairs and the record together**, per `{skill:create-commit}`.
5. **Run the project's quality gate** as `{skill:development-workflows}` resolves it. A repaired string that a test asserts on fails there; repair the test expectation and commit that separately.
6. **Emit the summary** per [Summary format](#summary-format).

<!-- include: ../../_partials/plain-speech.md / -->

<!-- include: ../../_partials/plain-speech-calibration.md / -->

<!-- include: ../../_partials/target-file-set-resolution.md / -->

## Summary format

One table per batch, then the closing lines:

```
revise-prose summary

| Batch | Files | Applied | Rejected | Questionable |
| ----- | ----- | ------- | -------- | ------------ |
| 0     | 12    | 31      | 4        | 2            |
| 1     | 9     | 18      | 1        | 0            |

Recorded in `.agents/revise-prose.yaml`: plain-speech 1, williamthorsen-writing-preferences 2.
3 plain-speech rejections were not recorded; the next sweep of their batches re-adjudicates them.
2 files held out: 1 generated, 1 machine-generated.
```

Give the held-out clause only where `filesSkipped` reports a non-zero count, naming each reason and its count, so a file that the sweep never opened cannot read as a clean result. Give the unrecorded-rejection line only where the fold dropped one.

Present the questionables as one table grouped by ground, before the per-batch tables:

```
| # | Ground             | File                | Line | Phrase                             | Repair                                  |
| - | ------------------ | ------------------- | ---- | ---------------------------------- | --------------------------------------- |
| 1 | plausible exhibit  | docs/rules.md       | 61   | the source it names                | the source that it names                |
| 2 | changes meaning    | src/parse.ts        | 22   | the findings arrive as warnings    | the function reports warnings           |
```

Ask for the numbers to apply, and treat every unnamed row as rejected.

Under `--dry-run` there is nothing yet to adjudicate, so the run reports the candidates instead: one table per file, ordered as the candidates arrived, with the rule, the line, and the phrase. Where the total is large, `byFile` and `byShape` are what the user reads to narrow the next run.

```
| Rule                    | Line | Phrase                              |
| ----------------------- | ---- | ----------------------------------- |
| reduced-object-relative | 14   | the ticket the branch name encodes  |
| em-dash                 | 22   | Findings arrive as warnings -- ...  |
```

<!-- include: ../_partials/action-items.md / -->

<!-- guidance-hook: writing-preferences -->
