---
name: revise-object-relatives
description: Sweep a repository's prose for the reduced object relative and repair each instance, reporting by default and writing only under --apply
user-invocable: true
---

# Revise object relatives

Sweep a repository's prose for the construction the writing rule below forbids, and repair each instance. A bundled helper does the mechanical half: it resolves which files may be swept, extracts their prose, and emits over-inclusive candidates carrying the whole sentence. You do the judgment half: decide which candidates are the construction, choose each repair, and report before anything is written.

The default is a report. `--apply` is the only thing that writes.

**Announce at start:** "Using revise-object-relatives to {report on | repair} object relatives in {the repository | the given paths}."

## Arguments

| Argument  | Description                                                       | Required |
| --------- | ----------------------------------------------------------------- | -------- |
| `<path>`  | One or more files or directories narrowing the sweep. Repeatable. | No       |
| `--apply` | Write the repairs. Default off, which produces the report alone.  | No       |

With no path, the sweep covers the whole repository. That is this skill's default because the eradication case is a full sweep, which is where it differs from `{skill:revise-comments}`, whose default is the current branch's diff.

`--apply` is yours to honor, not the helper's: the helper recognizes no flag and refuses one, so pass it the paths alone.

## Process

### 1. Run the sweep

```bash
node "$(dirname "$SKILL_PATH")/revise-object-relatives.mjs"
node "$(dirname "$SKILL_PATH")/revise-object-relatives.mjs" docs src/lib
```

The helper prints one JSON object to stdout. On success it carries `ok: true`, the `root` it swept, a `candidates` array, and a `summary` holding `total`, `filesScanned`, `filesSkipped`, `byFile`, and `byShape`. On failure it carries `ok: false` with `invalid-args` or `not-a-repository`, the latter because the sweep reads what git tracks and has nothing to read outside a working tree.

Each candidate names its `file` and `line`, the `shape` of the embedded subject, the `head`, `subject`, and `verb` the reading turns on, the `phrase` rewritten by a repair, and the whole `sentence` around it. Adjudicate from the candidate; a file read buys nothing the sentence does not already carry.

### 2. Read the summary before the candidates

A whole-repository sweep can return more candidates than one pass affords to adjudicate. `byFile` and `byShape` are what you read first: where the total is large, tell the user the count and narrow the next run with paths rather than adjudicating the whole set at once. `byShape` ranks the cost, so the quantified and definite shapes are where a narrowed pass pays best.

### 3. Adjudicate each candidate

Detection is over-inclusive by design. Reject a candidate on any of these grounds, and record the ground in the report:

- **Not a relative clause.** The verb is the sentence's own, or the head is a participle: "a package holding one drops it" and "an unset shell variable expands" each look like the construction and are neither.
- **An exhibit.** Prose that _displays_ the construction is not a violation. A rule's own examples, a review finding quoting a site, and a test fixture asserting on the construction each carry it deliberately, and repairing one destroys what it was written to show. The rule inlined below carries four, one per shape, and the report example further down carries three more.
- **Not prose.** A data literal, a fixture, a vendored third-party string, or an identifier that happened to fall inside an extracted span.
- **Outside the rule.** The gap is not an object gap. The helper rejects the fused head and the adjunct relative by head type, so what reaches you is a residue: a gap in a prepositional phrase, or a head the mechanical test read wrongly.

### 4. Choose the repair

Repair a surviving candidate under the preference order stated by the inlined rule, choosing per site rather than applying one repair throughout. Where a passage would end up with restored relativizers in consecutive sentences, reach for the participle or the recast in some of them.

### 5. Report

Emit the report format below. Under `--apply`, apply the surviving repairs through the {tool:Edit} tool after emitting the report, one file at a time, and stop at the first edit that does not match so the user sees what diverged.

<!-- include: ../../_partials/reduced-object-relative.md / -->

<!-- include: ../../_partials/target-file-set-resolution.md / -->

## Report format

Emit one table per file, ordered as the candidates arrived. Skip a file whose candidates were all rejected, and give the rejected total in the closing line instead.

```
revise-object-relatives summary

docs/architecture.md
| Line | Shape      | Original                                | Repair                                     |
| ---- | ---------- | --------------------------------------- | ------------------------------------------ |
| 14   | definite   | the ticket the branch name encodes      | the ticket that the branch name encodes    |
| 52   | quantified | a dependency no exported tier module imports | a dependency imported by no exported tier module |
| 61   | pronoun    | the source it names                     | rejected: exhibit                          |

3 candidates, 2 repaired, 1 rejected. 41 candidates in 12 other files were not read; narrow with a path to reach them. 2 files held out: 1 generated, 1 machine-generated.
```

The `Original` and `Repair` columns hold the phrase rather than the whole sentence, so a row stays readable; the sentence is what you adjudicated from, not what you print. A rejected candidate keeps its row with the ground in the `Repair` column, so the user can see a rejection they disagree with.

`filesSkipped` counts the prose-bearing files held out by the sweep, keyed by the reason each was held out. Where any count is non-zero, close with a `{n} files held out: ` clause naming each reason and its count, so a file never opened by the sweep cannot read as a clean result; omit the clause where every count is zero.

Under `--apply`, append `(applied)` to the heading and check each row against `git diff` before printing it: the table reports what the diff shows, not what was intended.

## When to pause and ask

The default is to act. Pause and ask the user when one of these holds:

- A candidate is plausibly an exhibit, but the surrounding prose does not say so outright.
- A repair would change the meaning rather than the syntax, which happens where the head noun is ambiguous and the participle picks one reading.
- More than half the candidates in one file are rejected, which usually means the file is a rule, a fixture, or a corpus rather than ordinary prose.
