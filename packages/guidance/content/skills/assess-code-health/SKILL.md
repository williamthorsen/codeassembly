---
name: assess-code-health
description: Survey one package or subtree of a codebase for code and tests that would be written differently today, through five lenses, one read-only subagent per lens, and merge their evidence-checked proposals into a ranked findings artifact that a triage pass can dispose of. Use when asked to find refactoring opportunities, convention drift, duplication, extraction candidates, or tests below the current bar in an existing codebase.
user-invocable: true
supported-harnesses: [claude]
---

# Assess code health

Find the code and tests in one unit of a codebase that would be written differently if they were written afresh today, and propose one change for each. Each lens is a {subagent:code-health-assessor} that reads the unit without seeing any other lens's report. You run the sensors, write the brief that every lens reads, dispatch the lenses, check every proposal's evidence against the tree, and merge the proposals into one findings artifact.

The skill does not grade anything: The findings artifact is the input of `triage-spike-findings`, which grades each proposal, has a challenger argue against every grade, and decides what becomes a ticket. Its one remote write is the [closing post](../_data/spike-conventions.md#closing-post) on the ticket, made on the developer's consent.

## Inputs

- **The unit**: a package or a subtree, as the developer names it. When the developer does not name one, propose one from the hotspot ranking at the checkpoint. Never assess the whole repository by default.
- **The window**: the number of days of history that the hotspots read, 180 by default.
- **The ticket**, optional. Without one in session, {skill:save-artifact} saves the artifacts under the ticket ID that it generates.

Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `error` and `message`. Invoke the helper as:

```bash
node {harness_home_dir}/skills/assess-code-health/assess-code-health.mjs {command} {flags}
```

The helper's commands, flags, and output shapes are documented in the guidance package's `docs/assess-code-health-helper.md`.

## Process

### 1. Prepare

Resolve the ticket directory per {skill:save-artifact}, and create `{ticket_dir}/code-health/`. Read the declared stage from `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs`.

Find the repository's own commands for lint, typecheck, and tests with coverage, in its manifest, its `AGENTS.md`, or its README. Run the tests with coverage once, with a reporter that writes an istanbul `json-summary` and a JUnit reporter, both into `{ticket_dir}/code-health/`. Run every command by the repository's own scripts, and never one that writes outside the working tree's ignored output or reaches a hosted service.

Find the repository's tracked build output: the paths that its guidance or configuration declares as generated, and the changelogs and release metadata that its release tooling writes, which `.gitattributes` does not already mark `linguist-generated`. Pass each as an `--exclude` glob. Release files otherwise lead the hotspot ranking, because every release rewrites them.

Then run `sense`:

```bash
node {harness_home_dir}/skills/assess-code-health/assess-code-health.mjs sense --unit {unit} --window {days} \
  --out {ticket_dir}/code-health/sense.json --check lint={lint command} --check typecheck={typecheck command} \
  --coverage-summary {summary path} --junit {junit path} --exclude {glob}
```

Omit `--coverage-summary` or `--junit` when the test command cannot write that report; the sensor is then recorded as not applicable. A sensor that fails is recorded with its reason and does not stop the run.

### 2. Write the brief

Compose the brief with these sections:

1. **Unit.** The unit, the window and its first commit date from the sense document, and the top ten hotspots.
2. **Reference points.** The reuse-candidate directory and the library inventory. Take the directory from the implementation guidance spliced below when it names one. The inventory is the repository's declared dependencies plus any library that the guidance names.
3. **Lenses.** Five, each with its name, its slug, its ID prefix, its subject, the rulebooks that it reads by path, and its proposal cap (10 by default):

   | Lens                                | Slug          | Prefix | Subject                                                                                                                                |
   | ----------------------------------- | ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
   | Convention conformance              | `conventions` | `C`    | What the linters miss, cited by rulebook path, section, and quoted sentence                                                            |
   | Structure                           | `structure`   | `S`    | Smells with a metric attached, and coupling from the co-change pairs                                                                   |
   | Extraction                          | `extraction`  | `X`    | Code duplicated across packages, code that belongs in the reuse-candidate directory, and code equivalent to a library in the inventory |
   | Error handling and input validation | `errors`      | `E`    | Statically evidenced patterns only; performance is out of scope                                                                        |
   | Tests                               | `tests`       | `T`    | Coverage intersected with hotspots, duration outliers, duplicated setup, and tests below the bar of the testing conventions            |

   List the deployed rulebooks and guidance skills under `{harness_home_dir}/skills/`, and the guidance spliced below, and assign each to the lenses whose subject it governs: the testing conventions to tests, layout and language preferences to conventions and extraction, and every code rulebook to conventions. Name each by its absolute path.

4. **Exclusions.** Paths out of scope, such as generated code, fixtures, and vendored code.
5. **Settled.** The decisions above, stated as final, so that a lens does not re-decide them, and the declared stage.

### 3. Checkpoint

Save the brief with {skill:save-artifact} as a ticket-level `code-health-brief` artifact, and show it to the developer. Ask in one action-items block for approval of the brief, the unit, and the caps. Do not dispatch any lens before approval.

<!-- include: ../_partials/action-items.md / -->

### 4. Dispatch the lenses

Confirm that `git status --porcelain` prints nothing before the first dispatch; when it prints anything, ask the developer to commit or set the changes aside, because the check after each lens cannot tell their changes from a lens's.

Create `{ticket_dir}/code-health/{lens slug}/` for each lens, and dispatch all five in one message, one {tool:Task} call each, `subagent_type: code-health-assessor`, with this block and nothing else composed into it:

```dispatch
brief: {path to the saved brief}
lens: {lens name}
sense: {ticket_dir}/code-health/sense.json
output: {ticket_dir}/code-health/{lens slug}/
```

Never pass one lens's report, or anything learned from it, to another lens: Each lens's value is its independent view, and the synthesis removes the duplicates.

**A reply that lacks the `Phase: code-health-assessment` line is a lens stopped by its turn limit.** Resume that lens once, asking only for its report; on Claude Code, send it a message with `SendMessage`, addressed by the agent ID that its dispatch returned. When the resumed lens still does not return a report, do not dispatch it again: Record the lens as not reported.

As each lens returns:

1. Run `git status --porcelain`. When it prints anything, stop the run and report the changed paths and the lens that returned last.
2. Save the report as `{ticket_dir}/code-health/{lens slug}-report.md`, and its JSON block as `{ticket_dir}/code-health/{lens slug}/proposals.json`.
3. Run `check-evidence --proposals {that file} --sense {ticket_dir}/code-health/sense.json`. Drop every proposal that it lists under `failed`, and record each with its reason under residual unknowns. When the block fails the schema as a whole, record the lens's proposals as unchecked and drop them all.

### 5. Synthesize

Merge the passed proposals of every lens into one list, and write it to `{ticket_dir}/code-health/proposals.json`:

- **Merge** proposals that share a key: Keep every source ID, the union of paths and evidence, the strongest strength (`sensor`, then `rule`, then `reading`), the largest size, and the largest reach.
- **Tracked.** Run `check-tracked --proposals {ticket_dir}/code-health/proposals.json` with one `--prior` for each `*_dispositions.md` under `{artifact_base_dir}/projects/{project_slug}/tickets/`. Move every proposal that it lists under `tracked` out of the ranking, into a **Tracked** section with its source and reason. When `tracker.checked` is false, record its reason under residual unknowns.
- **Rank** the rest by reach, then by the best hotspot rank among the proposal's paths (a proposal without a ranked path sorts last), then by ID.

Write the findings document:

- **Ranked proposals.** Each with its IDs, title, key, paths, change, strength, size, reach, and evidence. State the key and the paths verbatim, so that `triage-spike-findings` copies them into its record.
- **Proposed groupings.** Proposals that one change would fix, grouped, each group with a one-line title and its proposal IDs. Do not search the tracker or file anything.
- **Tracked.** The proposals that a prior disposition or an issue already covers.
- **Residual unknowns.** Every failed or inapplicable sensor, every dropped proposal with its reason, an unchecked tracker, every lens recorded as not reported, and the sample that each lens read.
- **Method.** One paragraph: the unit, the window, the sensors and their versions, and the lenses.
- **Lens reports.** Each report, appended unedited.

Write every evidence path relative to the repository root.

### 6. Save

Save the document with {skill:save-artifact} as a ticket-level `code-health-findings` artifact.

### 7. Report

Give the developer the findings artifact's path and one line of counts: proposals ranked, tracked, and dropped. Name `triage-spike-findings` as the next step, with the findings artifact's path as its input.

In the same response's action-items block, offer the closing post on the ticket, whose contents, consent, and duplicate check are stated in [Closing post](../_data/spike-conventions.md#closing-post). For an assessment, the answers that the post gives are the counts and the top ranked proposals, and its groupings are the proposed groupings of step 5.

<!-- guidance-hook: implementation-preferences -->
