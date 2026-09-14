# Prose sweep helper

`src/revise-prose/` contains the sweep that the `revise-prose` skill runs, bundled to `content/skills/revise-prose/revise-prose.mjs`. It reports and records, and it revises nothing: The agent that runs the skill applies repairs with its own editing tool.

One run covers one repository, resolved from the working directory through `git ls-files`.

## Commands

```bash
revise-prose.mjs [detect] [<path>...] [--rule <name>=<unit>] [--unit <name>=<version>] [--batch-budget <bytes>]
revise-prose.mjs record < fold.json
```

`detect` is the default and may be omitted. A leading `detect` or `record` is read as the command, so a repository path that collides with either is written `./record`. Positional paths narrow the sweep, and with none it covers the repository.

`--rule` names a rule and the unit that owns it, whether or not the helper has a detector for the rule. A rule name is lowercase kebab-case. `--unit` names a unit in force and its version. Both repeat, every rule's unit must be declared by a `--unit`, and a rule may be named once, since a rule has one unit. With no unit declared, `detect` runs the `reduced-object-relative` detector alone and neither reads nor writes the record, which keeps the pre-rules invocation stable. A rule cannot be named without its unit; therefore, an invocation that names no rule declares no unit unless it declares one on its own.

A detector rule is one that the registry in `rules.ts` holds; a unit is a versioned document whose coverage the record tracks, and a unit may have no detector at all. The helper reads no rule document: The skill states which rules exist and what each says, and the registry defines what a rule finds. `detect` runs the detectors of the named rules that the registry holds, and its output lists the rules under `rules`, as `detected` and `undetected`. A name under `undetected` that was meant as a detector rule is misspelt.

`--batch-budget` is the ceiling on a batch's combined file bytes, defaulting to 98304 (96 KiB), roughly 24k tokens of file content.

## Detectors

| Rule                      | Reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `em-dash`                 | Each sentence that contains an em-dash                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `reduced-object-relative` | Each head noun followed directly by a new noun phrase with no relativizer between them, its phrase running from the head noun through the verb                                                                                                                                                                                                                                                                                                                                 |
| `second-person`           | Each sentence that contains `you`, `your`, `yours`, `yourself`, or `yourselves`, except in a `SKILL.md`, a Markdown file directly inside a `subagents/` or `.claude/agents/` directory, or a partial directly inside `skills/_partials/` or `subagents/_partials/`                                                                                                                                                                                                             |
| `so`                      | Each sentence that contains a bare `so`, which has a word before it in its sentence and no comma, semicolon, dash, or "and" directly before it, or a `so` in the same sentence as another or in one of the three sentences after one in the same file. Neither counts "so that", "so-called", a `so` after "if" or a form of "do" or "say", or a `so` before "far", "few", "little", "many", "much", or "on" that does not follow a comma, a semicolon, or a sentence boundary |
| `where`                   | Each sentence that contains the word `where`                                                                                                                                                                                                                                                                                                                                                                                                                                   |

No detector reports a match inside an inline code span. The four sentence detectors use the sentence as the candidate's phrase, because a rejection recorded against one character or one word would match every other occurrence in its file. Every candidate is a site for the sweeping subagent to judge: `where` and `second-person` report every use, including the ones that their rules allow, and `so` reports a bare use or a repeat, naming which in the candidate's `trigger`, and passes over a lone `so` that is not bare, which its rule usually allows.

## Batches

A batch is whole files, because a subagent reads a file whole, and the batches cover the whole scanned set rather than the candidate-bearing subset, because a unit may have no detector and its violations can be in files that no detector nominates.

`detect` puts the recurring batches first. It groups files linked by a shared sentence into a component that no batch boundary crosses, so one subagent adjudicates every copy of a sentence and no two subagents edit the same file. It makes a component that outgrows the budget on its own into one oversized batch. It packs the remaining files by whole directory. A batch boundary falls on a directory boundary except when one directory alone exceeds the budget.

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

A unit's `rules` lists the detector rules that its sweeps ran, and is empty for a unit swept without a detector, such as `plain-speech`. `record` does not list a rule named to a run without a detector: If it did, `detect` would treat the files already covered as covered for that rule, and a detector added for the rule later would never run over them. Both commands read a unit written without `rules` as having run no detector. Its `roots` are the path roots that sweeps at this version and with these rules have covered, `.` meaning the repository, and `swept-at` is the date of the most recent of those sweeps.

A rejection resolves to a candidate by its rule, its file, and its phrase. Both phrases are normalized before they are compared (inline code spans masked, NFC applied, whitespace collapsed), and they match when either contains the other. The recorded phrase is the text as it reads after the run's edits, so a repair under another rule in the same run does not invalidate it.

A `rule` is any lowercase kebab-case name that a bound rulebook declares, detected or not. `plain-speech` has no detector and is recorded like any other rule, so a unit can record judgments without owning a detector.

When `detect` reads the record, with units named:

- It skips a batch when the record covers every file in it for every named unit: at that unit's current version, under one of its roots, and with every detector rule that the run names for that unit among its recorded `rules`.
- It drops a candidate that matches a rejection at its unit's current version.
- It keeps a candidate that matches a rejection recorded at an _older_ version and marks it `stale: true`, so the sweeper reviews the earlier judgment after a rule's revision rather than losing it.
- It reports under `rejections`, as `rule`, `file`, and `phrase`, every rejection that the record lists over a file that the sweep read, under a named unit at that unit's current version. A caller gives these to the sweeper, which leaves each site as it stands under the rule that its entry names rather than judging it again. This is the one way in which a rule with no detector saves a later run any work. `detect` withholds a rejection recorded at an older version, or under a unit that the run does not name, so the sweeper receives its site with no prior verdict.

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

Every unit states `rules`, an empty list included, and `record` keeps only the detector rules among them. `record` refuses a fold that omits it as `invalid-record` and writes nothing. A fold rejection has no version: The helper takes it from the fold's entry for the rejection's unit.

`record` merges by unit. It leaves the coverage and the rejections of a unit that the fold does not name as they are, so a narrowed run never retracts what a wider one recorded.

For a unit that the fold does name, `record` adds the fold's roots to the recorded ones when both the version and the rule set match, and replaces the recorded roots with them otherwise. It then drops a root that another one already contains. After a full sweep and a narrowed one, the record therefore still shows the repository as covered, while after a version bump or a change in the rule set, `record` starts the coverage over.

`record` decides each of that unit's recorded rejections under the fold's roots by its site, because a sweeper reports nothing for an inherited rejection and the agent that runs the skill dispatches no batch that the record already covers. It keeps a rejection at the current version while the rejection's site still exists: It looks for the phrase in the file as the run's edits left it, either in the file's extracted prose, normalized as it is for matching a candidate, or in the file's content. It finds no site in a file that it cannot read. Because `record` reads each file as it stands when the command runs, it sees every edit of the run. It retires a rejection at an older version, because the sweep at the new version reviewed it and the fold contains each site that the sweep rejected again. It replaces a recorded rejection with a fold rejection that has the same rule, file, and normalized phrase. It carries forward a rejection outside those roots, whatever its version, because no sweep revisited it.
