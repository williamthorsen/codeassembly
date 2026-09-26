# Prose sweep helper

`src/revise-prose/` contains the sweep that the `revise-prose` skill runs, bundled to `content/skills/revise-prose/revise-prose.mjs`. It reports and records, and it revises nothing: The agent that runs the skill applies repairs with its own editing tool.

One run covers one repository, resolved from the working directory through `git ls-files`.

## Commands

```bash
revise-prose.mjs [detect] [<path>...] [--rule <name>[@<version>]=<unit>] [--unit <name>=<version>] [--batch-budget <bytes>]
revise-prose.mjs record < fold.json
```

`detect` is the default and may be omitted. A leading `detect` or `record` is read as the command, so a repository path that collides with either is written `./record`. Positional paths narrow the sweep, and with none it covers the repository.

`--rule` names a rule, its sweep version, and the unit that owns it, whether or not the helper has a detector for the rule. A rule name is lowercase kebab-case, and a sweep version is a positive integer. A rule named without `@<version>` is swept but not recorded, and it counts toward no coverage. `--unit` names a unit in force and its version; `detect` and `record` read a unit's version only to convert a record written before rules had versions. Both flags repeat, every rule's unit must be declared by a `--unit`, and a rule may be named once, since a rule has one unit. With no unit declared, `detect` runs the `reduced-object-relative` detector alone and does not read the record, which keeps the pre-rules invocation stable. A rule cannot be named without its unit; therefore, an invocation that names no rule declares no unit unless it declares one on its own.

A detector rule is one that the registry in `rules.ts` lists. A unit is a versioned document that contains rules: a rulebook, or `plain-speech`, which contains the rule `plain-speech` at the unit's version and each rule that a marker in its calibration declares. A rule may have no detector at all. The helper reads no rule document: The skill states which rules exist and what each says, and the registry defines what a rule finds. `detect` runs the detectors of the named rules that the registry holds, and its output lists the rules under `rules`, as `detected` and `undetected`. A name under `undetected` that was meant as a detector rule is misspelt.

`--batch-budget` is the ceiling on a batch's combined file bytes, defaulting to 98304 (96 KiB), roughly 24k tokens of file content.

## Detectors

| Rule                      | Reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `em-dash`                 | Each sentence that contains an em-dash                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `negative-quantifier`     | Each `no` that opens the subject of a relative clause, its phrase running from the head noun through the verb: a head noun marked by a determiner, or a bare plural before a relativizer, then `no`, then a finite verb (an auxiliary, a modal, or an `-s` form) within three words. Without a relativizer, a head must follow its determiner directly and must not end in `-s`, `-ing`, or `-ed`. It skips `no longer`, `no more`, `no one`, `no other`, and `no such`        |
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
rules:
  em-dash:
    version: '1'
    swept-at: 2026-09-12
    detected: true
    roots:
      - .
  plain-speech:
    version: '6'
    swept-at: 2026-09-12
    detected: false
    roots:
      - .
rejections:
  - rule: reduced-object-relative
    rule-version: '1'
    file: packages/agents/README.md
    phrase: source it names
    ground: a quoted exhibit of the construction
```

The record keys coverage and rejections on each rule's sweep version, so a raised sweep version reopens that rule alone, and a unit's version can change without reopening any rule. A rule's `detected` states whether its sweeps ran the rule's detector. Coverage recorded without the detector stops counting once the helper has one for the rule, because that sweep never saw the rule's candidates. Its `roots` are the path roots that sweeps at this version and with this detector state have covered, `.` meaning the repository, and `swept-at` is the date of the most recent of those sweeps. A rule without a sweep version is not recorded.

A rejection resolves to a candidate by its rule, its file, and its phrase. Both phrases are normalized before they are compared (inline code spans masked, NFC applied, whitespace collapsed), and they match when either contains the other. The recorded phrase is the text as it reads after the run's edits, so a repair under another rule in the same run does not invalidate it.

A `rule` is any lowercase kebab-case name that a bound rulebook or the plain-speech calibration declares with a sweep version, detected or not. `plain-speech` has no detector and is recorded like any other rule.

When `detect` reads the record, with units named:

- It lists as each batch's `unswept` the rules that the run names with a version and for which the record does not cover at least one of the batch's files: at the rule's current version, under one of its roots, and with `detected` set if the helper has the rule's detector. It skips a batch whose `unswept` is empty. A run that names no rule with a version skips nothing, and each of its batches lists no rule.
- It drops a candidate that matches a rejection at its rule's current version.
- It keeps a candidate that matches a rejection recorded at an _older_ version and marks it `stale: true`, so the sweeper reviews the earlier judgment after a rule's revision rather than losing it.
- It reports only the candidates in the files of a batch that it reports, under a rule that the batch lists as `unswept` or a rule that the run names without a version. A caller applies to each batch its `unswept` rules and the rules without a version, and no other; a rule without a version is applied in every reported batch but keeps no batch from being skipped.
- It reports under `rejections`, as `rule`, `file`, and `phrase`, every rejection that the record lists over a file of a reported batch, under a rule that the batch lists as `unswept`, at that rule's current version. A caller gives these to the sweeper, which leaves each site as it stands under the rule that its entry names rather than judging it again. This is the one way in which a rule with no detector saves a later run any work. `detect` withholds a rejection recorded at an older version, or under a rule that the run does not name with a version, so the sweeper receives its site with no prior verdict.

### Records written before rules had versions

A record whose top-level key is `units` keys coverage on each unit's version, with each unit listing its detector `rules` and each rejection naming its `unit` and `unit-version`. `detect` and `record` convert such a record whenever they read one, against the versions that the run declares, and `record` writes the result in the per-rule shape:

- A unit entry at the unit's current version becomes one coverage entry for each rule of that unit that the run names with a version, at the rule's sweep version. `detected` is set if the unit's `rules` lists the rule.
- A unit entry at another version, or under a unit that the run does not name, becomes no coverage.
- A rejection under a current unit takes its rule's sweep version. One under a unit at another version, under a unit that the run does not name, or under a rule that now belongs to another unit takes `rule-version: '0'`, which no declared version equals, so it reads as stale.
- A rejection under a named unit's rule that has no sweep version is dropped.

A record that contains both `units` and `rules` is refused as `invalid-record`.

## The fold

`record` reads one run's fold as JSON on standard input:

```json
{
  "sweptAt": "2026-09-12",
  "roots": ["."],
  "units": {
    "plain-speech": "6",
    "williamthorsen-writing-preferences": "8"
  },
  "rules": {
    "em-dash": { "unit": "williamthorsen-writing-preferences", "version": "1" },
    "plain-speech": { "unit": "plain-speech", "version": "6" },
    "reduced-object-relative": { "unit": "williamthorsen-writing-preferences", "version": "1" }
  },
  "rejections": [
    {
      "rule": "reduced-object-relative",
      "file": "packages/agents/README.md",
      "phrase": "source it names",
      "ground": "a quoted exhibit of the construction"
    }
  ]
}
```

`units` names each unit that the run declared, at its version, which `record` reads to convert a record written before rules had versions. `rules` names each rule that the run named with a version, and every rule's unit must be in `units`. A fold rejection has no version: The helper takes it from the fold's entry for the rejection's rule, and it refuses a rejection under a rule that `rules` does not name. A refused fold is reported as `invalid-record`, and nothing is written.

`record` merges by rule. It leaves the coverage and the rejections of a rule that the fold does not name as they are, so a narrowed run never retracts what a wider one recorded.

For a rule that the fold does name, `record` sets `detected` from whether the helper holds the rule's detector. It adds the fold's roots to the recorded ones when both the version and `detected` match, and replaces the recorded roots with them otherwise. It then drops a root that another one already contains. After a full sweep and a narrowed one, the record therefore still shows the repository as covered, while after a raised sweep version or a detector added for the rule, `record` starts that rule's coverage over.

`record` decides each of that rule's recorded rejections under the fold's roots by its site, because a sweeper reports nothing for an inherited rejection and the agent that runs the skill dispatches no batch that the record already covers. It keeps a rejection at the current version while the rejection's site still exists: It looks for the phrase in the file as the run's edits left it, either in the file's extracted prose, normalized as it is for matching a candidate, or in the file's content. It finds no site in a file that it cannot read. Because `record` reads each file as it stands when the command runs, it sees every edit of the run. It retires a rejection at an older version, because the sweep at the new version reviewed it and the fold contains each site that the sweep rejected again. It replaces a recorded rejection with a fold rejection that has the same rule, file, and normalized phrase. It carries forward a rejection outside those roots, whatever its version, because no sweep revisited it.
