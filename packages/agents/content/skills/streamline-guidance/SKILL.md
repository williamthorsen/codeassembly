---
name: streamline-guidance
description: Reduce bloat in guidance files (skills, subagents, rulebooks, partials, AGENTS.md) in gradual steps, proposing cuts at a chosen level, applying the approved ones, and recording the declined ones
user-invocable: true
---

# Streamline guidance

Cut the bloat from guidance files without weakening what they direct. A bundled helper does the mechanical work: It resolves the files that a run may cut, reports the evidence against each candidate cut, and records the cuts that the user declines. You make the judgment calls: what is a candidate, whether the evidence rules it out, and which candidates to propose.

The effect of a cut on agent behavior cannot be measured directly, so the level decides how much evidence a cut needs, and the lowest levels exist to take one small step at a time. Every cut is proposed before any file changes.

**Announce at start:** "Using streamline-guidance to propose {level} cuts to {the named paths}."

## Arguments

| Argument          | Description                                                                  | Required |
| ----------------- | ---------------------------------------------------------------------------- | -------- |
| `<path>`          | A guidance file, or a directory of them. Repeatable.                         | Yes      |
| `--level <level>` | `cautious`, `conservative`, `moderate`, or `aggressive`. Default `moderate`. | No       |

There is no `--dry-run`: A reply that names no rows changes nothing.

## Ordering with `revise-prose`

This skill decides how much the guidance says. {skill?:revise-prose} decides how its prose reads, and it never shortens text. Where both are wanted on the same files, run this skill first: A cut can delete text that the sweep would otherwise polish.

## Levels

A cut is one contiguous removal, rewording, or merge. Each level may cut everything that the level before it may. A cut's class is the lowest level that allows it.

- **`cautious`**: At most two cuts per run, from the `conservative` class, chosen as the two least likely to impair what the guidance does. Removing text that directs nothing ranks safer than rewording text that directs something.
- **`conservative`**: Text that directs nothing. Filler, hedges, intros, restated context, narration of how a rule was reached, a repeat within one body that is not reinforcement, and a rewording that directs the same thing in fewer words.
- **`moderate`** (default): The agent still receives every instruction, stated once or reported by a check that fails on violation. Overlapping rules merged, all but the strongest of several examples that teach one point, rationale that does not calibrate a judgment call, and prose restating a constraint that a validator reports with a readable error.
- **`aggressive`**: Nothing shows the text to be load-bearing. Rules that the agent follows without being told, examples where the directive works alone and shows no output shape, remaining rationale, and reference-only content moved behind a link.

A transitive file, one that a target includes or links to, is also read by consumers that nobody targeted. Cut it at `cautious` whatever the run's level.

## Never cut

At any level, in any file:

- An output shape that the agent must reproduce, such as a rendered block or menu, or its skill-local reinforcement: the pointer or the inlined example placed at the step that produces the output.
- Text that a test asserts.
- Text that git history shows was added or restored to correct a failure.
- The part of a frontmatter `description` that says when to invoke the skill. The rest of a description is worth cutting, since every description loads into the skill index of every session.
- Text inside a generated region, which the next deployment rewrites.

Edit no file outside the targets and their transitive files, except a version pin or content hash that step 7 updates.

## Process

### 1. Resolve the files

Run from the repository root:

```bash
node {harness_home_dir}/skills/streamline-guidance/streamline-guidance.mjs resolve {paths}
```

The helper prints one JSON object. On failure it contains `ok: false`, an `error`, and a `message`: Report them and stop.

On success it contains:

- `targets` and `transitive`: Each file's repository-relative `file`, its `bytes`, whether it is `dirty`, and its `generatedRegions` as line ranges. A target named as a deployed copy contains `redirectedFrom`, and its `file` is the source. A transitive file contains `via`, the edges by which a target reaches it: `include` or `link`.
- `declined`: The cuts that the user declined on earlier runs whose text is still present, each with its `file`, `phrase`, and `class`.
- `rejected`: Each named path that cannot be a target, with its `reason`.

Report every rejected path and every redirect. Stop where `targets` is empty. Stop where any target or transitive file is `dirty`, and name those files: The run's commit must contain only the run's edits.

Keep the `bytes` of each file for the summary.

### 2. Compose the candidates

Read every target and transitive file whole. Compose candidates in the target files at the run's level, and in the transitive files from the `conservative` class. For each candidate, note its file, its line, its class, its `phrase` (the exact text that it removes or rewords, copied from the file), its replacement where it rewords or merges, and why it is safe at its class.

Compose no candidate that removes or rewords a `declined` phrase in its file, and none inside a file's `generatedRegions`.

A rewording follows the plain-speech rule and the writing preferences in your guidance. A shorter sentence that breaks either is lengthened again by the next prose sweep.

### 3. Check the candidates

Pass every candidate to `check`, at every level:

```bash
cat <<'EOF' | node {harness_home_dir}/skills/streamline-guidance/streamline-guidance.mjs check
{"cuts":[{"file":"{file}","phrase":"{phrase}"}]}
EOF
```

Each report repeats the candidate's `file` and `phrase` and adds two lists. Drop a candidate where either list rules it out:

- **`assertedBy`**: Test string literals that the phrase contains, each with its `file` and `line`. The helper errs toward reporting, so read the test line. Drop the candidate where the test checks guidance text for that literal; a literal that matches by accident, such as a common phrase in a test of unrelated code, does not rule it out.
- **`history`**: The commits that changed how often the phrase occurs in its file, newest first, each with its `sha`, `date`, `subject`, and `body`. Drop the candidate where a commit added or restored the phrase to correct a failure: Its subject or body names a fix, a regression, or a behavior that an agent got wrong. A commit that added the phrase as part of new guidance is no such evidence. Where `history` is empty for text that `git blame` attributes to a commit, read that commit before deciding, because the phrase may have been reflowed since it was added.

Drop every candidate that touches an output shape or its skill-local reinforcement.

### 4. Select the cuts to propose

- At `cautious`, propose at most two cuts across all files, target files first, ranked by how unlikely each is to impair what the guidance does.
- At any level, propose at most two cuts in transitive files, ranked the same way.
- Otherwise, propose every remaining candidate.

Where nothing remains, report that the files have no cut to propose at this level, and stop.

### 5. Present the cuts

Present one numbered table per [Cut table](#cut-table), then ask which rows to apply and which to decline, in the form `apply 1, 3; decline 2`. A row named in neither list is deferred: You do nothing with it, and a later run may propose it again.

### 6. Apply and record

1. Apply each row named to apply with {tool:Edit}, phrase to phrase. Stop at the first edit that does not match, and report which row diverged.
2. Where any row was declined, compose the fold and pipe it to `record`, the only write path of `.agents/streamline-guidance.yaml`:

   ```bash
   cat <<'EOF' | node {harness_home_dir}/skills/streamline-guidance/streamline-guidance.mjs record
   {"declinedAt":"{today}","declined":[{"file":"{file}","phrase":"{phrase}","class":"{class}"}]}
   EOF
   ```

   `declinedAt` is today's ISO calendar date. Each `phrase` is the text as it reads in the file.

Where no row was applied or declined, skip to the summary.

### 7. Run the quality gate

Where any row was applied, run the project's quality gate as {skill:development-workflows} resolves it.

- Where it fails only on a version pin or content hash that records a file edited by this run, apply the remedy that its failure message names: Bump the rulebook's `version` where a cut changed what the rulebook asks, and update the pin alone where the cut did not. A `conservative` cut directs nothing, so it changes nothing that a rulebook asks.
- Where it fails on anything else that a cut caused, restore that cut's text, report the cut, and run the gate again.

### 8. Commit

Commit per {skill:create-commit}, staging only the edited guidance files, any pin or version that step 7 updated, and the record. The body names each applied cut by file, class, and the text removed or reworded.

### 9. Emit the summary

Emit the summary per [Summary format](#summary-format). For the sizes after the run, run `resolve` again with the same paths.

## Cut table

```
| # | File                           | Line | Class        | Cut                                                    | Why it is safe                                  | Bytes |
| - | ------------------------------ | ---- | ------------ | ------------------------------------------------------ | ----------------------------------------------- | ----- |
| 1 | skills/demo/SKILL.md           | 12   | conservative | remove "This section explains how the steps work."     | an intro that the heading already states        | 44    |
| 2 | skills/demo/SKILL.md           | 31   | moderate     | reword "…" → "…"                                       | the rule at line 18 states the same instruction | 120   |
| 3 | _partials/shared.md (include)  | 4    | conservative | remove "In general, "                                  | a hedge that directs nothing                    | 12    |
```

`Cut` shows `remove "…"` or `reword "…" → "…"`, abbreviated where the phrase is long. Mark a transitive file with the kind of its edge.

## Summary format

```
streamline-guidance summary (moderate)

| File                 | Before | After | Saved |
| -------------------- | ------ | ----- | ----- |
| skills/demo/SKILL.md | 9,412  | 9,248 | 164   |
| Total                | 9,412  | 9,248 | 164   |

Applied 2, declined 1, deferred 0.
Follow-up: {skill?:revise-prose} skills/demo/SKILL.md
```

List each target and each edited transitive file, in bytes. Name the follow-up only where a cut was applied.

<!-- include: ../_partials/action-items.md / -->
