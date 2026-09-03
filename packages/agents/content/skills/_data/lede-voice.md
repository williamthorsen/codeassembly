# The lede

This file defines how to write a lede: the `## What` section of a change summary and pull request, the changelog or release-notes entry rendered from it, and the opening of a commit or merge-commit body.

The reader is glancing through entries asking "what did this change do?" and deciding in a few seconds whether to keep reading.

## Altitude and focus

A lede has two axes. One never varies; the other is set by the change's work type.

**Altitude is constant, at the accomplishment level.** The lede says what the change accomplished, not how it works internally. A finding established during the work, a count of instances touched, an internal causal chain, and the before-and-after syntax of an edit belong in `## Details` or the diff. Test each clause: Would the reader's next move -- such as clicking into the details or using the product -- change if it were absent? A clause that the decision does not turn on is padding.

**Focus is keyed to tier.** A change appears in release notes when its work type is in the public tier of [work-types.json](./work-types.json); a change in any other tier goes no further than the changelog.

- **Public tier** -- the reader is a user of the package, and the lede answers what the product now does.
- **Internal and process tiers** -- the reader is a developer, and the lede answers what was done to the code.

Where one text serves both, write at the register of the most external realistic reader.

## Worked exemplars

Two changes whose ledes the author rewrote. Each records what was drafted, what shipped, and what the author said about the distance between them.

### Public focus: a rename and five correctness fixes

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

**That migration line is a counter-example.** It predates the instruct rule, and it recaps the removal without naming an edit, so it fails the reader test under "The migration paragraph" below. Do not model one on it. What this exemplar teaches is altitude, and that lesson stands.

On the gap:

> A change of altitude, not a better ranking. The author's framing -- "a lede is an overview, an introduction, it hits the highlights" -- moved the question from "which of these facts matter most?" to "what kind of change is this?". Answered at that altitude the lede writes itself: a rename, a correctness fix, a new sibling function, a breaking migration. No specific finding appears, however important, because findings sit one level below the altitude the lede occupies.

> The two clauses the author struck by name, byte-order mark and CRLF, were precisely the ones most recently probed against the built output.

### Internal focus: an import source moved

Drafted:

> Sources `expectTypeOf` from `vitest` in the eight test files that imported it from `expect-type`, and removes `expect-type` from the root `devDependencies`. Vitest re-exports the symbol bare, so the direct dependency only made a second import path resolvable; without it, `import { expectTypeOf } from 'expect-type'` no longer resolves and the split cannot reopen.
>
> `@vitest/eslint-plugin`'s `valid-expect` rule recognizes `expectTypeOf` only when it comes from `vitest`, so the move brought fourteen previously-unchecked assertions under it. Each was written as `expectTypeOf<T>(value)`, an assignability check that never reaches a matcher and passes for any subtype of the intended type; all fourteen now read `expectTypeOf(value).toEqualTypeOf<T>()`.

Shipped:

> Replaces all imports of `expectTypeOf` from `expect-type` with the same import from `vitest`. Previously there had been imports from both libraries. `expect-type` is removed as a dependency.

On the gap:

> The technical nuances have no place in the lede. The lede says, "This is what the change accomplished", not "Here is how a particular lint rule failed to detect a problem with the previous configuration, here's how many instances were changed, here's the exact syntax of the replacement."

## The stance

**The change is the subject.** A lede reports what the pull request did -- not a portrait of the system afterwards, and not the deliberation that led to the change. The opening names the artifact or subsystem changed -- the package, command, file, or rule -- before the reader has to absorb what the change did to it. "Modifies the `release-kit` and `nmr` ReadyUp kits [...]" orients the reader in four words; a scenario clause that delays the name makes the reader read on to find out what is under discussion.

**Every sentence reports an effect of the diff.** The symptom ended by a fix, the purpose served by a change, and the invariant preserved by a risky change are effects, even when no hunk states them. The deliberation that produced the diff -- options weighed, review history, what the ticket asked for -- is not. The PR is written on its own merits, not the ticket's.

**Mechanism is substance where it is the accomplishment.** The operation performed -- the rename, the upgrade, the extraction, the new check -- is usually what a change at developer focus accomplished, so naming it is the news rather than implementation detail. At public focus it is rare, and belongs only where it explains the visible change. Mechanism describing how the accomplishment works internally is below the altitude at either focus.

**Name things, up to the altitude.** The identifier is often the most informative word in the sentence: the package, command, flag, file, or rule acted on by the change, backticked. An identifier never consumed by the reader -- an internal function, the lint rule that fired, a config key that the change happens to read -- is mechanism with a name attached, and backticking it does not raise it to the altitude. Prefer the category only when identity does not matter ("the maintainer's personal rulebooks", not the two filenames). At public focus, define any term that the audience may not share.

**Emphasize the highlights.** Decide what matters most and lead with it; everything else belongs in `## Details` or the diff. A lede is a summary with a point of view, not a catalog. The lede is not reference documentation: Options and their usage, output shape, config keys, version numbers, and the instances touched by a sweep are what the reader finds after clicking through. A migration step is the one thing they cannot click through to, so it stays, held to the size bound under "The migration paragraph" below.

**Claims match the diff.** A mitigation is not a fix. Give the true actor the agency: Violations fail the build; rules only classify. A promise that holds only on some version or configuration states that condition. A first increment is framed as initial -- unframed placeholder behavior reads as a bug -- and a roadmap sentence ("Substitution of actual content for the hook will come later.") is welcome where it prevents that misreading.

## Openers

Opener discipline is positional. Each form has a place, and the places are not interchangeable.

- **The opening sentence reports the change, verb-first.** The implied subject is the pull request: "Adds", "Fixes", "Upgrades", "Reorganizes", "Removes".
- **A state description's place is the follow-up sentence.** It elaborates what the opening reported rather than standing in for it.
- **The temporal-marker opener is reserved for a sentence that is itself the whole delta**, one that the reader recovers by negating it: "`nmr prepush` now runs the audit first." Where the state is an aggregate of operations that the reader cannot recover, the form hides the change instead.
- **A fix opens with what was fixed**: "Fixes an issue where doing X failed to Y." Opening with the repaired state leaves the reader unable to tell what was wrong.

## Form

- Third-person indicative present: "Adds", never "Add" or "Added". Passive voice is fine where natural. The third-person rule governs the sentences that report the change; a migration step is a different speech act and is imperative. Never address the reader as "you": That ban holds across the whole lede.
- A second concern gets its own short paragraph, often marked ("Separately, ..."). Migration or breaking info that needs a paragraph gets a labeled one, written per "The migration paragraph" below. Three or more parallel items may be bulleted.
- A PR that repeats a recognized routine operation -- a deferred-lint cleanup, a fleet-wide upgrade -- reuses the series' established lede rather than fresh prose; the change summary or the repo's changelog supplies it. A repo-wide change reports the repo-level operation, naming individual packages only when they are few and load-bearing.

## The migration paragraph

A `Migration:` paragraph tells the consumer what to do. It is not a labelled recap of the change; the sentences above it already reported that.

- **The reader test.** What does the reader type differently tomorrow? A sentence describing the resulting state fails it whatever its grammatical person. "So consumers quote what they declare" names a disposition, not an edit.
- **The label is literal.** The paragraph opens with `Migration:`. Only `## What` reaches the merge-commit body and the changelog, so this paragraph is the whole channel to a consumer whose build just broke.
- **The mood is imperative.** The second person stays banned, and an imperative needs no pronoun. Form's third-person rule governs the sentences that report the change: A migration clause can satisfy it and still name no edit, which is the failure this section exists to catch.
- **Any work type can carry one.** A `fix` that tightens validation imposes a migration as surely as a `drop` does. The paragraph follows the burden, not the type.
- **Name the edit, and any trap the replacement introduces.** A hazard the new path carries and the old one did not -- a filter the predecessor did not need, an exception the replacement throws where the predecessor returned -- appears nowhere in the diff, so nothing else will surface it.
- **The size bound.** The edit and the trap, not a worked example per call shape. A migration that overruns it links the package's versioned upgrade guide where the package has one, and otherwise stays at the bound. The README describes current state and is not that guide.

Drafted:

> Migration: A rulebook declaring an unquoted `version` is now rejected rather than deployed with digits lost, so consumers quote what they declare.

Shipped, after the author's correction:

> Migration: Change any unquoted version numbers in rulebooks to quoted strings.

## What each kind of change reports

A change matching two kinds opens with the higher-stakes pattern: sec, then fix, then feat, then drop, then deps, then the rest. A fix delivered by refactoring is a fix; the operation is its mechanism.

- **feat, perf** -- the capability, named, and the surface that exposes it. A performance change names the effect and its size where it was measured ("cuts cold-start time roughly in half"); "improves performance" names nothing.
  > Adds two status labels (`status:blocked` and `status:on-hold`) to the common preset and removes descriptions from other scoped labels (`priority:` and `value:`) to keep scoped groups compact in the GitHub UI.
- **fix** -- the symptom that no longer occurs, then the fix; mechanism welcome.
  > Fixes an issue where lede decisions could be saved into the wrong store. Decisions are now saved by default into the `codeassembly` store, and a call to save them to `--store @default` (which could point to any arbitrary store) is refused. [...]
- **sec** -- the class of vulnerability closed and the surface that exposed it, then the fix; the fix pattern applies, or the deps pattern when an upgrade delivers it. State enough that a reader can tell whether they were exposed, and no more -- a lede is not a reproduction.
- **refactor** -- the operation performed on the code: what was reorganized, extracted, renamed, consolidated, or deleted. The restructuring is the outcome; external behavior needs no mention unless it changed. One line is the default for a routine restructuring ("Aligns property names with in-house naming conventions."), not a floor to build up from.
  > Reorganizes the files in the `readyup` package for better usability and maintainability. Functions are now grouped by domain.
- **internal** -- a capability or restructuring of unpublished surface; the feat or refactor pattern applies, at developer register.
- **docs** -- the edit made to the document: what was added, removed, moved, or corrected.
  > Tightens comments by removing narration of development history and focusing them on the code itself. Function descriptions are now aligned with house style.
- **ai** (agent guidance) -- the edit made to the guidance: the artifact named, plus the one substantive shift in what it says or directs. Never assert the downstream behavior of the agents who read it. Skills instruct; agents are instructed.
  > Revises the code-review guidance to limit the circumstances under which the agent should offer to revise the acceptance criteria (AC). [...]
- **deps** -- the version delta, and the consequence that matters; a routine bump with none is one sentence.
  > Upgrades several dependencies, most notably `nmr` to v0.24. That upgrade changes Vitest configuration so that test suites are selected by a tier ("unit", "tool", "localhost", and "remote") corresponding to the services they use. [...] The upgraded `nmr` includes a caching feature that skips checks that already succeeded against an identical working tree.
- **tests / tooling / ci** -- the operation performed on the pipeline or configuration. Name the tool that the change acted on; the rule enabled, the option set, and the severity raised are mechanism.
  > Fixes deferred violations of Vitest lint rules in the `readyup` package and restores the severity of the associated rules to `error` when a strict-lint check is run.
- **drop, deprecate** -- what was removed and what survives or replaces it. Published surface is presumed used and gets the migration paragraph; unpublished or never-released surface needs none -- no headline, no breaking-change framing. When unsure, include it. A removal whose surface only moved is reported as the move ("`defineConfig` is now imported from `@williamthorsen/nmr/config` instead of the bare package."), and the migration paragraph names the edit that follows from it. A removal with no drop-in replacement still owes the reader the path to the replacement API and any trap it introduces. A deprecation reports the same facts in advance: The surface still works, the replacement is named, and the removal horizon is stated when it is known.
  > Removes `@williamthorsen/eslint-config-basic`; no further versions will be published. No remaining package lints Markdown, while `@williamthorsen/eslint-config-typescript` continues to cover JavaScript, JSON, YAML, and `package.json`.
- **revert** -- the change undone and what is restored. The PR number may accompany the name, never substitute for it. A revert takes the work type of the change being undone; `revert` is not itself a key in `work-types.json`.

## Don't

- **The recency trap.** The writer admits a fact into the lede on the effort spent establishing it rather than on its worth to the reader, and the most recently verified facts are the ones that feel most load-bearing. Diagnostic symptom: The fact appears in both `## What` and `## Details`, because the section that it legitimately belongs to already has it. The correction is deleting the fact, never compressing the sentence that states it -- one lede's first correction dropped every enumeration and kept the mechanism, a term of art, and an explanatory tail, and the author rejected that draft too.
- **State description that hides the change.** The "X now does Y" form hides the change where the state is an aggregate of operations that the reader cannot recover: "Every lint rule in the shared configuration is now enforced in every package" conceals the change, which was "Fixes all outstanding lint issues and removes the cap that downgraded the severity of associated rules during strict-lint runs."
- **An invented beneficiary.** "Finding a module in the `readyup` package now means asking what role it plays" dramatizes a hypothetical reader; the shipped lede reports the operation (see the refactor exemplar).
- **The catalog.** Enumerating every delta at equal weight hides the one that matters. Status tallies ("Twelve rules remain deferred"), edge-case inventories, and doc-update mentions are body content at best; never mention that documentation was updated unless documentation is the subject of the PR.
- **Teaching instead of reporting.** A lede that explains the team's conventions, tutors the reader in a new language feature, or walks through the rule content touched by the diff has stopped reporting. Name what changed; the document itself does the teaching.
- **Empty contrast.** In "a single run reports every defect it finds rather than stopping at the first", the second clause is the negation of the first. Use "rather than" / "instead of" only when the contrast informs ("inspectable rather than flattened into text"). The same test cuts self-evident corollaries ("...so temporary files are no longer left behind").
- **Unearned assurance.** A guarantee against an unsuspected harm creates the doubt that it means to remove. State an invariant only when the change gives real grounds to fear it broke: "Published output is unchanged" belongs in the lede after a compiler-target bump. A "previously" sentence passes the same test when it does motivation or migration work, and fails it when it merely restates the change's negation.
- **Talking around the name.** "An assertion dependency that nothing imported" withholds `@sindresorhus/is`. If the reader would have to open the diff to learn what you mean, name it.
- **Process narration.** Review mechanics, ticket numbers, finding IDs, test and CI runs, and roads not taken are not part of the change.
