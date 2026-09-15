---
name: revise-prose
description: Sweep a repository's prose against the writing rule set, repair it through dispatched subagents, and record what was swept
user-invocable: true
---

# Revise prose

Sweep a repository's prose against the rules below, repair every clear site, and record what the repository has now been swept for. A bundled helper does the mechanical half: It resolves which files may be swept, extracts their prose, reports over-inclusive candidates, and packs the files into batches. You do the dispatching half: one `{subagent:prose-reviser}` subagent per batch, one commit per batch, and one closing pass over what the subagents would not decide alone.

Apply is the default. `--dry-run` produces the report alone.

**Announce at start:** "Using revise-prose to {report on | revise} prose in {the repository | the given paths}."

## Arguments

| Argument                 | Description                                                               | Required |
| ------------------------ | ------------------------------------------------------------------------- | -------- |
| `<path>`                 | One or more files or directories narrowing the sweep. Repeatable.         | No       |
| `--batch-budget <bytes>` | Ceiling on a batch's combined file bytes. Passed to the helper unchanged. | No       |
| `--dry-run`              | Report and stop: no subagent, no edit, no record write.                   | No       |

With no path, the sweep covers the whole repository. That is this skill's default, because removing every violation from a repository requires a full sweep. It is how this skill differs from `{skill:revise-comments}`, whose default is the current branch's diff.

## Ordering with `revise-comments`

`{skill:revise-comments}` decides whether a comment exists and what it may say. This skill decides how a span of prose reads, and it never adds, deletes, or shortens a comment. If both are wanted on the same files, run `{skill:revise-comments}` first: It may delete the very comment that this sweep would otherwise polish.

## Process

### 1. Read the units and the rules from this document

Both come from this document, never from a list kept elsewhere. Because a rule document declares each rule by a marker beside it rather than by its heading, a heading change cannot silently drop a rule, and a project bound to a different rulebook is swept for the rules that it declares.

- **The `plain-speech` unit** is at the version that the `<!-- unit-version: plain-speech <version> -->` marker below names. It contains one rule, `plain-speech`, whose sweep version is the same.
- **Each `<!-- rulebook:<slug> -->` block** in the comment-preferences and writing-preferences fills at the end of this document is a unit, at the version that its `<!-- rulebook-version: <version> -->` line names. A block that does not specify a version is not a unit: Do not name its rules to the helper, sweep it without recording anything for it, and name that slug in the closing summary.
- **Each `<!-- rule: <id> <version> -->` marker** in a unit's body declares a rule at that sweep version, whether or not the helper has a detector for it. The rule's unit is the block containing the marker.
- **A marker that reads `<!-- rule: <id> -->`** declares a rule without a sweep version. It is swept, but nothing records it: Name it to the helper without a version, and name it in the closing summary.
- **A rule heading with no marker beneath it** declares no id and no sweep version. Its id is the heading's text lowercased, with backticks dropped, each run of characters other than letters and digits replaced by one hyphen, and hyphens trimmed from both ends; its unit is the block containing the heading. Do not name it to the helper, and name it in the closing summary.

The record keys coverage and rejections on each rule's sweep version. A unit's version is passed only to convert a record written before rules had versions.

If the fills are empty, nothing is bound here: The run sweeps `plain-speech` alone.

### 2. Run the sweep

```bash
node {harness_home_dir}/skills/revise-prose/revise-prose.mjs detect {paths} \
  --unit plain-speech={version} \
  --rule plain-speech@{version}=plain-speech \
  --unit {slug}={version} \
  --rule {rule-id}@{rule-version}={slug} \
  --rule {unversioned-rule-id}={slug}
```

Pass one `--unit` per unit from step 1, `--rule plain-speech@{version}=plain-speech` for the `plain-speech` unit, and one `--rule` per marker in a unit: with `@{rule-version}` if the marker declares a version, and without it if not. Add `--batch-budget {bytes}` if the invocation included one. Omit the paths for a whole-repository sweep.

The helper prints one JSON object to stdout. On success it contains `ok: true`, the `root` that it swept, a `candidates` array, a `rejections` array containing the sites already adjudicated by an earlier sweep, a `batches` array, a `rules` object listing the named rules that it `detected` and those for which it has no detector as `undetected`, and a `summary`. On failure it contains `ok: false` with `invalid-args`, `invalid-record`, or `not-a-repository`, the last because the sweep reads what git tracks and has nothing to read outside a working tree. Report a failure and stop.

Read `summary` before anything else. `filesSkipped` counts the files that the sweep excluded, keyed by the reason for each: `generated` and `machine-generated` for output whose edit belongs to its source, `vendored` for a verbatim extract whose edit belongs to the project from which it was extracted, `unreadable` for a file whose prose cannot be read, and `ineligible` for one not read by any extractor. `batchesSkipped` counts the batches that the record already covers; `stale` counts the candidates whose recorded rejection was taken at an older version of its rule.

An empty `batches` array ends the run: Report the summary in one line and stop. The repository is already swept at every versioned rule's current version.

**Under `--dry-run`, the run ends here.** Emit the summary and one candidate table per file, per [Summary format](#summary-format), and stop. Do not dispatch a subagent, do not write a record, and edit nothing. A dry run takes one helper run, whereas a report-then-apply pair would run the sweep twice.

**An apply run needs a clean tree.** If `git status --porcelain` reports anything, stop and report it. Because step 4's gate reads `git diff --name-only` as the wave's own work, an edit already in the tree either trips that gate or, if it is inside a batch's file list, is committed with that batch under the sweep's message. A dry run ends before this check and edits nothing; therefore, this stop holds only for an apply run.

### 3. Pilot the first batch

Run the pilot if `.agents/revise-prose.yaml` is absent, or if it names none of this run's versioned rules under `rules:` and none of its units under `units:`. A rerun skips this step and goes to step 4.

Dispatch batch 0 alone, per step 4's dispatch shape, and run step 4's checks over it as a wave of one. Accumulate its `rejected` and `questionable` entries for step 5, as step 4 directs for every later wave, so that the pilot's questionables appear in the closing table. Then show the user its report and `git diff --stat`, and ask for a go-ahead before committing that batch and before dispatching anything else.

On a no-go, ask the user before reverting, then revert that batch's files and stop. A miscalibrated subagent is worth catching once per repository, which is the whole reason the first batch runs alone.

### 4. Dispatch the remaining batches in waves

Send up to four `{tool:Task}` calls with `subagent_type: prose-reviser` in one message. A harness that returns each before the next is the series case; do not attempt to detect which one you are on.

Before each dispatch, write two files under `{scratch}/revise-prose/`: that batch's candidate objects, exactly as the helper reported them and `stale` flags included, to `batch-{index}.json`, and the run's `rejections` entries whose `file` the batch covers, to `rejections-{index}.json`. Write the second even if it contains no entry, so that every dispatch names the same keys. `{scratch}` is a scratch directory created once for the run with `mktemp -d "${TMPDIR:-/tmp}/revise-prose.XXXXXX"`, written out as an absolute path in each place below and in each dispatch block, since these writes and the subagent's reads all go through a file tool that does not expand shell syntax.

Dispatch each batch with this block, whose `rules` value is the helper's `rules.detected`:

```dispatch
root: {root}
files: {the batch's files, comma-separated}
candidates: {scratch}/revise-prose/batch-{index}.json
rejections: {scratch}/revise-prose/rejections-{index}.json
rules: {rule-id}, {rule-id}
```

**The block contains scalars only, and only these keys.** Do not compose prose into it: The subagent has the rule set and reads the files itself, and a sentence written here would bias its judgment toward yours. A content test fails the build on a line that is not a `key: value` scalar and on a key outside this set.

**On each return, parse the report.** It is one fenced JSON block containing `applied`, `rejected`, and `questionable`. If the returned value does not contain such a block, or the block is truncated, redispatch the batch rather than editing from it.

**Once the whole wave has returned:**

1. **Check the diff against the wave.** Run `git diff --name-only`. Every subagent in the wave has already made its edits by now; therefore, the gate checks against the union of the batches' file lists rather than any one batch's. If the diff names a file outside that union, stop the run and report which file changed; commit nothing.
2. **Check each report against its own batch.** If a batch's `applied` entries name a file outside that batch's `files` list, stop the run and report which batch named it; commit nothing. The union check above cannot detect this, because that file is in another batch of the same wave.
3. **Commit each batch in index order.** Stage that batch's files alone and commit them per `{skill:create-commit}`, with the type and the scope that `create-commit` derives from those files.
4. **Accumulate** the wave's `rejected` and `questionable` entries for step 5.

### 5. Close the run

1. **Present the questionables** in one table grouped by ground, per [Summary format](#summary-format). The user accepts or rejects each.
2. **Apply the accepted repairs** with the {tool:Edit} tool, phrase to phrase from each entry's `phrase` and `repair`. Stop at the first edit that does not match, so that the user sees what diverged.
3. **Compose the fold** and pipe it to the helper's `record` command, which is the record's only write path:

   ```bash
   cat <<'EOF' | node {harness_home_dir}/skills/revise-prose/revise-prose.mjs record
   {"sweptAt":"{today}","roots":["{root}"],"units":{"{name}":"{version}"},"rules":{"{rule-id}":{"unit":"{name}","version":"{rule-version}"}},"rejections":[]}
   EOF
   ```

   `sweptAt` is today's ISO calendar date. `roots` lists the invocation's narrowing paths, or `["."]` for a whole-repository sweep. `units` names every unit from step 1 at its current version. `rules` names every rule that step 2 passed with a version, `plain-speech` included, with its unit and its sweep version; the helper records for each whether it holds the rule's detector.

   `rejections` contains every subagent rejection plus every questionable that the user rejected, each containing `rule`, `file`, `phrase` as the text reads after this run's edits, and `ground`. Leave out a rejection under a rule that `rules` does not name, which is a rule without a sweep version: Nothing records such a rule, and the helper refuses the fold.

   **Fold every rejection under a rule that `rules` names, whether or not the helper has its detector.** Because a rejection resolves to a site by its rule, its file, and its phrase, a rejection under a rule for which the helper does not have a detector is recorded and re-suppressed like any other. Report the phrase as it reads in the source and long enough to locate the site by eye: The helper masks inline code spans and matches by containment, and therefore a span wider than the one reported by the detector still resolves to it. On the next sweep, step 4 writes the recorded sites to the rejections file of each batch that covers them.

4. **Commit the closing repairs and the record together**, per `{skill:create-commit}`.
5. **Run the project's quality gate** as `{skill:development-workflows}` resolves it. A test that asserts on a repaired string fails there; repair the test expectation and commit that separately.
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

Recorded in `.agents/revise-prose.yaml`: capitalization-after-colon 1, em-dash 1, plain-speech 6, sentence-case 2.
Not recorded: other-writing-guidance, prefer-active-voice.
Swept without a detector: capitalization-after-colon, plain-speech, sentence-case.
5 files excluded: 1 generated, 1 machine-generated, 3 ineligible.
```

The recorded line names each rule from the fold's `rules` at its sweep version. Give the line naming what was not recorded only if step 1 found a rule without a sweep version or a block that is not a unit, naming each rule and each such block's slug.

Give the excluded-files clause only if `filesSkipped` reports a non-zero count, naming each reason and its count, so that a file that the sweep never opened is not mistaken for a clean result. A whole-repository sweep reports a large `ineligible` count, because every image, lockfile, and data file in the repository is one; a narrowed sweep reports the files that it was given and could not read.

Give the line naming the rules swept without a detector only if the helper's `rules.undetected` lists any, naming each. If a marker misspells a detector rule's id, the misspelled id appears only on this line: The subagent still sweeps the rule, and no detector runs for it.

Present the questionables as one table grouped by ground, before the per-batch tables:

```
| # | Ground             | File                | Line | Phrase                             | Repair                                  |
| - | ------------------ | ------------------- | ---- | ---------------------------------- | --------------------------------------- |
| 1 | plausible exhibit  | docs/rules.md       | 61   | the source it names                | the source that it names                |
| 2 | changes meaning    | src/parse.ts        | 22   | the findings arrive as warnings    | the function reports warnings           |
```

Ask for the numbers to apply, and treat every unnamed row as rejected.

Because there is nothing yet to adjudicate under `--dry-run`, the run reports the candidates instead: one table per file, ordered as the helper reported them, with the rule, the line, and the phrase. If the total is large, the user reads `byFile` and `byShape` to narrow the next run.

```
| Rule                    | Line | Phrase                              |
| ----------------------- | ---- | ----------------------------------- |
| reduced-object-relative | 14   | the ticket the branch name encodes  |
| em-dash                 | 22   | Findings arrive as warnings -- ...  |
```

<!-- include: ../_partials/action-items.md / -->

<!-- guidance-hook: comment-preferences -->

<!-- guidance-hook: writing-preferences -->
