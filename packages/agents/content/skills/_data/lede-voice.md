# The lede

This file defines how to write a lede: the `## What` section of a change summary and pull request, the changelog or release-notes entry rendered from it, and the opening of a commit or merge-commit body.

## The readers

Two readers, and the change's work type decides which one is reading. A change whose work type is in the public tier of [work-types.json](./work-types.json) reaches release notes and the changelog; a change in any other tier reaches the changelog alone.

**The user**, at public tier.

- Uses the package and does not work on it.
- Meets the text in release notes, scanning a list of entries and giving each a few seconds.
- Is deciding whether to upgrade, and what changes for them.
- Already assumes that inputs are validated, that the code is tested, and that the documentation matches.
- Reaches in one click: the documentation, the API, the tool itself.
- Has no page to click through to for the edits their own code needs. Only the lede states them, which is why the migration paragraph survives every cut.

**The contributor**, at internal and process tiers.

- Works in this codebase.
- Meets the text in the changelog, scanning to place a change.
- Is deciding where a change landed and whether it touches the code in front of them.
- Assumes the same baseline as the user.
- Reaches in one click: the diff, and the change summary's `## Details`.

Public-tier text serves both. Write it for the user, the more external of the two.

A rule below names its reader wherever the two disagree, and holds for both where it names none. Two rules disagree, and both are in "The stance": what counts as mechanism, and which identifiers a lede may name.

## What the reader wants

Two facts govern both readers, and most of this file follows from them.

**Interest tracks what the reader can act on.** What a new function lets the reader do is news; the number of files a sweep touched is not, since nothing the reader does turns on the count. Neither the size of the change nor the effort that a fact cost to establish bears on this, and neither does how specific the fact is. The test is this reader, in the seconds they give the entry. An exhaustive list of options with their usage, and the shape of a command's output, are what the reader finds after clicking through. A clause that the reader derives from the clause before it gives them nothing: "a single run reports every defect it finds rather than stopping at the first" and "...so temporary files are no longer left behind" are the shape. A lede that explains the team's conventions or tutors the reader in a language feature has stopped reporting.

**What is done as a matter of course is not news.** Inputs get validated, code gets tested, documentation gets updated. Reporting one tells the reader that you found it remarkable, and the answer is "of course". Such a fact is reportable only where it is the pull request's subject: A tests-only change reports tests and a docs-only change reports documentation; everywhere else they route to `## Details`. The same fact governs assurances. An invariant asserted against a harm that the reader had not suspected plants the doubt that it means to remove, so state one only where the change gives real grounds to fear it broke: "Published output is unchanged" earns its place after a compiler-target bump and nowhere else.

## Worked exemplars

Two changes whose ledes the author rewrote. Each records what was drafted, what shipped, and what the author said about the distance between them.

### The user reading: a rename and five correctness fixes

Drafted:

> Renames `unindent` to `dedent` in `@williamthorsen/toolbelt.strings/candidate` and corrects five defects in how it measures indentation. The most damaging: an interpolated value carrying an unindented newline silently disabled dedenting for the entire template, because values were concatenated before the common indent was computed. Values are now spliced after the literals are dedented, so nothing a value contains can alter the measurement.
>
> The common indent is the longest whitespace prefix matching exactly across content lines, counting only tabs and spaces. That makes mixed tabs and spaces well-defined without a tab width, and stops a byte-order mark from zeroing the calculation or a non-breaking space from being deleted as though it were layout. Two templates that used to dedent nothing silently now throw: one carrying an escaped line terminator or a line continuation, and one whose lines are all indented but share no common prefix.
>
> Adds `stripCommonIndent`, a plain-function counterpart for text that arrives at runtime rather than being written in source. It removes the common indent and empties whitespace-only lines, discarding no lines and re-emitting each line's own terminator, so CRLF text does not come back with mixed endings.
>
> Migration: `unindent` no longer exists. `${null}` and `${undefined}` rendered as the empty string and object values as `[object Object]`; all three are now compile errors, with `DedentValue` admitting strings, numbers, bigints, and booleans. Both exports stay at candidate tier.

Shipped:

> Renames `unindent` to `dedent` in `@williamthorsen/toolbelt.strings/candidate` and corrects five defects in how it removes indentation. Adds `stripCommonIndent`, the same rules as a plain function, for text that arrives at runtime rather than being written in source.
>
> Migration: `unindent` no longer exists, and nullish and object values are now compile errors.

**That migration line is a counter-example.** It recaps the removal without naming an edit, so it fails the reader test under "The migration paragraph" below. Do not model one on it.

On the gap:

> A change of altitude, not a better ranking. The author's framing -- "a lede is an overview, an introduction, it hits the highlights" -- moved the question from "which of these facts matter most?" to "what kind of change is this?". Answered at that altitude the lede writes itself: a rename, a correctness fix, a new sibling function, a breaking migration. No specific finding appears, however important, because findings sit one level below the altitude the lede occupies.

### The contributor reading: an import source moved

Drafted:

> Sources `expectTypeOf` from `vitest` in the eight test files that imported it from `expect-type`, and removes `expect-type` from the root `devDependencies`. Vitest re-exports the symbol bare, so the direct dependency only made a second import path resolvable; without it, `import { expectTypeOf } from 'expect-type'` no longer resolves and the split cannot reopen.
>
> `@vitest/eslint-plugin`'s `valid-expect` rule recognizes `expectTypeOf` only when it comes from `vitest`, so the move brought fourteen previously-unchecked assertions under it. Each was written as `expectTypeOf<T>(value)`, an assignability check that never reaches a matcher and passes for any subtype of the intended type; all fourteen now read `expectTypeOf(value).toEqualTypeOf<T>()`.

Shipped:

> Replaces all imports of `expectTypeOf` from `expect-type` with the same import from `vitest`. Previously there had been imports from both libraries. `expect-type` is removed as a dependency.

On the gap:

> The technical nuances have no place in the lede. The lede says, "This is what the change accomplished", not "Here is how a particular lint rule failed to detect a problem with the previous configuration, here's how many instances were changed, here's the exact syntax of the replacement."

## The stance

**The change is the subject.** A lede reports what the pull request did, not a portrait of the system afterwards and not the deliberation that led to the change. The opening names the artifact or subsystem changed, the package, command, file, or rule, before the reader has to absorb what the change did to it. "Modifies the `release-kit` and `nmr` ReadyUp kits [...]" orients the reader in four words; a scenario clause that delays the name makes the reader read on to find out what is under discussion.

**Every sentence reports an effect of the diff.** The symptom ended by a fix, the purpose served by a change, and the invariant preserved by a risky change are effects, even when no hunk states them. The deliberation that produced the diff, the options weighed, the review history, and what the ticket asked for are not. The pull request is written on its own merits, not the ticket's.

**Mechanism is the accomplishment for the contributor.** The operation performed, the rename, the upgrade, the extraction, the new check, is usually what a change at internal or process tier accomplished, so naming it is the news rather than implementation detail. For the user it is rare, and belongs only where it explains the visible change. Mechanism describing how the accomplishment works internally sits below the line for both readers.

**Name what the reader consumes.** The identifier is often the most informative word in the sentence, backticked. Which identifiers qualify is the thing the two readers disagree about. For the user, an internal function, the lint rule that fired, or a config key that the change happens to read is mechanism with a name attached, and backticking it does not admit it. For the contributor those same names are the subject: A refactor is reported by the modules that it moved. The subject is the artifact acted on, never an enumeration of the instances touched, so a change that enabled twenty lint rules names the configuration and not the rules one by one. Prefer the category only where identity does not matter ("the maintainer's personal rulebooks", not the two filenames), and never talk around a name the reader is owed: "An assertion dependency that nothing imported" withholds `@sindresorhus/is`. If the reader would have to open the diff to learn what is meant, name it. At public tier, define any term that the audience may not share.

**Claims match the diff.** A mitigation is not a fix. Give the true actor the agency: Violations fail the build; rules only classify. A promise that holds only on some version or configuration states that condition. A first increment is framed as initial, since unframed placeholder behavior reads as a bug, and a roadmap sentence ("Substitution of actual content for the hook will come later.") is welcome where it prevents that misreading.

## Openers

Opener discipline is positional. Each form has a place, and the places are not interchangeable.

- **The opening sentence reports the change, verb-first.** The implied subject is the pull request: "Adds", "Fixes", "Upgrades", "Reorganizes", "Removes".
- **A state description's place is the follow-up sentence.** It elaborates what the opening reported rather than standing in for it.
- **The temporal-marker opener is reserved for a sentence that is itself the whole delta**, one that the reader recovers by negating it: "`nmr prepush` now runs the audit first."
- **A fix opens with what was fixed**: "Fixes an issue where doing X failed to Y." Opening with the repaired state leaves the reader unable to tell what was wrong.

## Form

- Third-person indicative present: "Adds", never "Add" or "Added". Passive voice is fine where natural. The third-person rule governs the sentences that report the change; a migration step is a different speech act and is imperative. Never address the reader as "you": That ban holds across the whole lede.
- A second concern gets its own short paragraph, often marked ("Separately, ..."). Migration or breaking info that needs a paragraph gets a labeled one, written per "The migration paragraph" below. Three or more parallel items may be bulleted.
- A pull request that repeats a recognized routine operation, a deferred-lint cleanup or a fleet-wide upgrade, reuses the series' established lede rather than fresh prose; the change summary or the repo's changelog supplies it. A repo-wide change reports the repo-level operation, naming individual packages only when they are few and load-bearing.

## The migration paragraph

A `Migration:` paragraph tells the consumer what to do. It is not a labelled recap of the change; the sentences above it already reported that.

- **The reader test.** What does the reader type differently tomorrow? A sentence describing the resulting state fails it whatever its grammatical person. "So consumers quote what they declare" names a disposition, not an edit.
- **The label is literal.** The paragraph opens with `Migration:`. Only `## What` reaches the merge-commit body and the changelog, so this paragraph is the whole channel to a consumer whose build just broke.
- **The mood is imperative.** The second person stays banned, and an imperative needs no pronoun. Form's third-person rule governs the sentences that report the change: A migration clause can satisfy it and still name no edit, which is the failure this section exists to catch.
- **Any work type can carry one.** A `fix` that tightens validation imposes a migration as surely as a `drop` does. The paragraph follows the burden, not the type.
- **Name the edit, and any trap the replacement introduces.** A hazard the new path carries and the old one did not, a filter that the predecessor did not need or an exception that the replacement throws where the predecessor returned, appears nowhere in the diff, so nothing else will surface it.
- **The size bound.** The edit and the trap, not a worked example per call shape. A migration that overruns it links the package's versioned upgrade guide where the package has one, and otherwise stays at the bound. The README describes current state and is not that guide.

Drafted:

> Migration: A rulebook declaring an unquoted `version` is now rejected rather than deployed with digits lost, so consumers quote what they declare.

Shipped, after the author's correction:

> Migration: Change any unquoted version numbers in rulebooks to quoted strings.

## What each kind of change reports

A change matching two kinds opens with the higher-stakes pattern: sec, then fix, then feat, then drop, then deps, then the rest. A fix delivered by refactoring is a fix; the operation is its mechanism.

Most types need no rule of their own, because the readers section already decides what the entry says. These carry something that it does not supply.

- **feat, perf** -- a performance change names the effect and its size where it was measured ("cuts cold-start time roughly in half"); "improves performance" names nothing.
- **sec** -- state enough that a reader can tell whether they were exposed, and no more. A lede is not a reproduction.
- **refactor** -- one line is the default for a routine restructuring ("Aligns property names with in-house naming conventions."), not a floor to build up from. External behavior needs no mention unless it changed.
- **ai** (agent guidance) -- the artifact named, plus the one substantive shift in what it says or directs. Never assert the downstream behavior of the agents who read it: Skills instruct; agents are instructed.
- **deps** -- the version delta and the consequence that matters; a routine bump with none is one sentence.
- **drop, deprecate** -- published surface is presumed used and gets the migration paragraph; unpublished or never-released surface needs none, with no headline and no breaking-change framing. When unsure, include it. A removal whose surface only moved is reported as the move ("`defineConfig` is now imported from `@williamthorsen/nmr/config` instead of the bare package."), and one with no drop-in replacement still owes the reader the path to the replacement API and any trap that it introduces. A deprecation reports the same facts in advance, with the removal horizon where it is known.
- **revert** -- the change undone and what is restored. The pull-request number may accompany the name, never substitute for it. A revert takes the work type of the change being undone; `revert` is not itself a key in `work-types.json`.

## Don't

- **The recency trap.** A fact is admitted on the effort spent establishing it rather than on its worth to the reader, and the most recently verified facts feel the most load-bearing. The correction is deleting the fact, never compressing the sentence that states it.
- **State description that hides the change.** The "X now does Y" form hides the change where the state is an aggregate of operations that the reader cannot recover: "Every lint rule in the shared configuration is now enforced in every package" conceals what was done, which was "Fixes all outstanding lint issues and removes the cap that downgraded the severity of associated rules during strict-lint runs."
- **An invented beneficiary.** "Finding a module in the `readyup` package now means asking what role it plays" dramatizes a hypothetical reader; the shipped lede reports the operation.
- **Process narration.** Review mechanics, ticket numbers, finding IDs, test and CI runs, and roads not taken are not part of the change.
