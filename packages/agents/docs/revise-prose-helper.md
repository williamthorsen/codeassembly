# Prose sweep helper

`src/revise-prose/` contains the sweep that the `revise-prose` skill runs, bundled to `content/skills/revise-prose/revise-prose.mjs`. It reports and records, and it revises nothing: The skill applies repairs through the agent's own editing tool.

One run covers one repository, resolved from the working directory through `git ls-files`.

## Commands

```bash
revise-prose.mjs [detect] [<path>...] [--rule <name>=<unit>] [--unit <name>=<version>] [--batch-budget <bytes>]
revise-prose.mjs record < fold.json
```

`detect` is the default and may be omitted. A leading `detect` or `record` is read as the command, so a repository path that collides with either is written `./record`. Positional paths narrow the sweep, and with none it covers the repository.

`--rule` names a rule to detect and the unit that owns it. `--unit` names a unit in force and its version. Both repeat, every rule's unit must be declared by a `--unit`, and a rule may be named once, since a rule has one unit. Declaring no unit detects `reduced-object-relative` alone and neither reads nor writes the record, which keeps the pre-rules invocation stable. A rule cannot be named without its unit, so an invocation that names no rule declares no unit unless it declares one on its own.

A rule has a detector; a unit is a versioned document whose coverage the record tracks, and a unit may have no detector at all. The helper reads no rule document: The skill states what a rule says, and the detector registry in `rules.ts` defines what a rule finds.

`--batch-budget` is the ceiling on a batch's combined file bytes, defaulting to 98304 (96 KiB), roughly 24k tokens of file content.

## Detectors

| Rule                      | Reports                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `em-dash`                 | Each sentence that contains an em-dash                                                                                                                                                                                                                             |
| `reduced-object-relative` | Each head noun followed directly by a new noun phrase with no relativizer between them, its phrase running from the head noun through the verb                                                                                                                     |
| `second-person`           | Each sentence that contains `you`, `your`, `yours`, `yourself`, or `yourselves`, except in a `SKILL.md`, a Markdown file directly inside a `subagents/` or `.claude/agents/` directory, or a partial directly inside `skills/_partials/` or `subagents/_partials/` |
| `so`                      | Each sentence that contains the word `so`, other than in "so that", in "so-called", after "if" or a form of "do" or "say", or before "far", "few", "little", "many", "much", or "on" when it does not follow a comma, a semicolon, or a sentence boundary          |
| `where`                   | Each sentence that contains the word `where`                                                                                                                                                                                                                       |

No detector reports a match inside an inline code span. The four sentence detectors use the sentence as the candidate's phrase, because a rejection recorded against one character or one word would match every other occurrence in its file. Every candidate is a site for the sweeping subagent to judge: `where` and `second-person` report every use, including the ones that their rules allow, and `so` reports every use that no neighboring word places outside its rule.

## Batches

A batch is whole files, because a subagent reads a file whole, and the batches cover the whole scanned set rather than the candidate-bearing subset, because a unit may have no detector and its violations can be in files that no detector nominates.

The recurring batches lead. Files linked by a shared sentence form a component that no batch boundary crosses, so every copy of one sentence is adjudicated together and no file reaches two writers. A component that outgrows the budget on its own becomes one oversized batch. The rest pack whole directories, so a batch boundary falls on a directory boundary except when one directory alone exceeds the budget.

## The record

`.agents/revise-prose.yaml` records what a repository has been swept for. Only the `record` command writes it, which keeps its YAML deterministic rather than edited by hand into drift.

```yaml
units:
  williamthorsen-writing-preferences:
    version: '4'
    swept-at: 2026-09-12
    rules:
      - em-dash
      - reduced-object-relative
      - second-person
      - where
    roots:
      - .
rejections:
  - rule: reduced-object-relative
    unit: williamthorsen-writing-preferences
    unit-version: '4'
    file: packages/agents/README.md
    phrase: source it names
    ground: a quoted exhibit of the construction
```

A unit's `rules` lists the detector rules that its sweeps ran, and is empty for a unit swept without a detector, such as `plain-speech`. A unit written without `rules` reads as having run no detector. Its `roots` are the path roots that sweeps at this version and with these rules have covered, `.` meaning the repository, and `swept-at` dates the most recent of those sweeps.

A rejection resolves to a candidate by its rule, its file, and its phrase. Both phrases are normalized before they are compared (inline code spans masked, NFC applied, whitespace collapsed), and they match when either contains the other. The recorded phrase is the text as it reads after the run's edits, so a repair under another rule in the same run does not invalidate it.

A `rule` is any lowercase kebab-case name that a bound rulebook declares, detected or not. `plain-speech` has no detector and is recorded like any other rule, so a unit can record judgments without owning a detector.

On read, with units named:

- A batch is skipped when the record covers every file in it for every named unit: at that unit's current version, under one of its roots, and with every rule that the run names for that unit among its recorded `rules`.
- A candidate matching a rejection at its unit's current version is dropped.
- A candidate matching a rejection recorded at an _older_ version is kept and marked `stale: true`, so a rule's revision re-opens the judgment for review rather than discarding it.
- Every rejection that the record lists over a file that the sweep read, under a named unit at that unit's current version, is reported under `rejections` as `rule`, `file`, and `phrase`. A caller gives these to the sweeper, which leaves each site as it stands under the rule that its entry names rather than judging it again. This is the one way in which a rule with no detector saves a later run any work. A rejection recorded at an older version, or under a unit that the run does not name, is withheld, so the sweeper receives its site with no prior verdict.

## The fold

`record` reads one run's fold as JSON on standard input:

```json
{
  "sweptAt": "2026-09-12",
  "units": {
    "williamthorsen-writing-preferences": {
      "version": "4",
      "rules": ["em-dash", "reduced-object-relative", "second-person", "where"],
      "roots": ["."]
    }
  },
  "rejections": [
    {
      "rule": "reduced-object-relative",
      "unit": "williamthorsen-writing-preferences",
      "file": "packages/agents/README.md",
      "phrase": "source it names",
      "ground": "a quoted exhibit of the construction"
    }
  ]
}
```

Every unit states `rules`, an empty list included. A fold that omits it is refused as `invalid-record`, and nothing is written. A fold rejection has no version: The helper takes it from the fold's entry for the rejection's unit.

Merging is by unit. A unit that the fold does not name keeps its coverage and its rejections, so a narrowed run never retracts what a wider one recorded.

For a unit that the fold does name, its roots join the recorded ones when both the version and the rule set match, and replace them otherwise, and a root that another one already contains is dropped. A full sweep followed by a narrowed one therefore still records the repository as covered, while a version bump or a change in the rule set starts the coverage over. That unit's rejections at the current version are replaced by the fold's own within the roots named for it, since a site not rejected again has been withdrawn. A rejection outside those roots was never revisited, so it is carried forward, and so is one recorded at an older version.
