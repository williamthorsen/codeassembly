# The lede

This file defines how to write a lede: the `## What` section of a change summary and pull request, the changelog or release-notes entry rendered from it, and the opening of a commit or merge-commit body.

The reader is glancing through entries asking "what did this change do?" and deciding in a few seconds whether to keep reading. A release-notes reader is a user of the package; every other reader (changelog, commit log, pull-request list) is a developer. When one text serves both, write at the register of the most external realistic reader.

## The stance

**The change is the subject.** A lede reports what the pull request did -- not a portrait of the system afterwards, and not the deliberation that led to the change. Open with a change verb whose implied subject is the PR ("Adds", "Fixes", "Upgrades", "Reorganizes", "Removes"), or with the changed artifact and a temporal marker ("`nmr prepush` now runs the audit first"). Either way, the opening names the artifact or subsystem changed -- the package, command, file, or rule -- before the reader has to absorb what the change did to it. "Modifies the `release-kit` and `nmr` ReadyUp kits [...]" places the reader in four words; a scenario clause that reaches the name later makes them travel to find out what is under discussion.

**Every sentence reports an effect of the diff.** The symptom a fix ends, the purpose a change serves, and the invariant a risky change preserves are effects, even when no hunk spells them out. The deliberation that produced the diff -- options weighed, review history, what the ticket asked for -- is not. The PR is written on its own merits, not the ticket's.

**Mechanism is substance.** For a developer reader, the operation performed -- the rename, the upgrade, the extraction, the new check -- is exactly what they want to know. Naming it is not implementation detail; it is the news. At the release-notes register, mechanism earns its place when it explains the visible change.

**Name things.** The identifier is often the most informative word in the sentence: the package, command, flag, file, or rule, backticked. Prefer the category only when identity does not matter ("the maintainer's personal rulebooks", not the two filenames). For a release-notes reader, define any term the audience may not share.

**Punch the highlights.** Decide what matters most, lead with it, and stop after the two or three facts a glancing reader needs. Everything else belongs in `## Details` or the diff. A lede is a summary with a point of view, not a catalog -- and craft is welcome: a vivid concrete detail ("earns a rocket emoji in the terminal output") informs better than an abstraction, and a correct but flat recitation is itself a failure.

**Claims match the diff.** A mitigation is not a fix. Agency lands on the true actor: violations fail the build; rules only classify. A promise that holds only on some version or configuration carries that condition. A first increment is framed as initial -- unframed placeholder behavior reads as a bug -- and a roadmap sentence ("Substitution of actual content for the hook will come later.") is welcome where it prevents that misreading.

## Form

- Most ledes are one to three sentences. Length is earned fact by fact, never by enumeration.
- Third-person indicative present: "Adds", never "Add" or "Added". Passive voice is fine where natural. Never address the reader as "you"; migration steps are third person ("Consumers import `defineConfig` from the `/config` subpath instead"), not imperatives.
- A second concern gets its own short paragraph, often marked ("Separately, ..."). Migration or breaking info that earns a paragraph gets a labeled one ("Migration: ..."). Three or more parallel items may be bulleted.
- A PR that repeats a recognized routine operation -- a deferred-lint cleanup, a fleet-wide upgrade -- reuses the series' established lede rather than fresh prose; the change summary or the repo's changelog supplies it. A repo-wide change reports the repo-level operation, naming individual packages only when they are few and load-bearing.

## What each kind of change reports

A change matching two kinds opens with the higher-stakes pattern: sec, then fix, then feat, then drop, then deps, then the rest. A fix delivered by refactoring is a fix; the operation is its mechanism.

- **feat, perf** -- the capability, named, and the surface that reaches it. A performance change names the effect and its size where it was measured ("cuts cold-start time roughly in half"); "improves performance" names nothing.
  > Adds two status labels (`status:blocked` and `status:on-hold`) to the common preset and removes descriptions from other scoped labels (`priority:` and `value:`) to keep scoped groups compact in the GitHub UI.
- **fix** -- the symptom that no longer occurs, then the fix; mechanism welcome.
  > Fixes an issue where lede decisions could be saved into the wrong store. Decisions are now saved by default into the `codeassembly` store, and a call to save them to `--store @default` (which could point to any arbitrary store) is refused. [...]
- **sec** -- the class of vulnerability closed and the surface that exposed it, then the fix; the fix pattern governs, or the deps pattern when an upgrade delivers it. State enough that a reader can tell whether they were exposed, and no more -- a lede is not a reproduction.
- **refactor** -- the operation performed on the code: what was reorganized, extracted, renamed, consolidated, or deleted. The restructuring is the outcome; external behavior needs no mention unless it changed. A routine restructuring earns one line ("Aligns property names with in-house naming conventions.").
  > Reorganizes the files in the `readyup` package for better usability and maintainability. Functions are now grouped by domain.
- **internal** -- a capability or restructuring of unpublished surface; the feat or refactor pattern applies, at developer register.
- **docs** -- the edit made to the document: what was added, removed, moved, or corrected.
  > Tightens comments by removing narration of development history and focusing them on the code itself. Function descriptions are now aligned with house style.
- **ai** (agent guidance) -- the edit made to the guidance: the artifact named, plus the one substantive shift in what it says or directs. Never assert the downstream behavior of the agents who read it. Skills instruct; agents are instructed.
  > Revises the code-review guidance to limit the circumstances under which the agent should offer to revise the acceptance criteria (AC). [...]
- **deps** -- the version delta, and the consequence that matters; a routine bump with none is one sentence.
  > Upgrades several dependencies, most notably `nmr` to v0.24. That upgrade changes Vitest configuration so that test suites are selected by a tier ("unit", "tool", "localhost", and "remote") corresponding to the services they use. [...] The upgraded `nmr` includes a caching feature that skips checks that already succeeded against an identical working tree.
- **tests / tooling / ci** -- the operation performed on the pipeline or configuration, tools named.
  > Fixes deferred violations of Vitest lint rules in the `readyup` package and restores the severity of the associated rules to `error` when a strict-lint check is run.
- **drop, deprecate** -- what was removed and what survives or replaces it. Published surface is presumed used and gets the migration sentence; unpublished or never-released surface goes quietly -- no headline, no breaking-change framing. When unsure, include the migration sentence. A removal whose surface moved is stated as the move ("`defineConfig` is now imported from `@williamthorsen/nmr/config` instead of the bare package."). A deprecation reports the same facts in advance: the surface still works, the replacement is named, and the removal horizon is stated when it is known.
  > Removes `@williamthorsen/eslint-config-basic`; no further versions will be published. No remaining package lints Markdown, while `@williamthorsen/eslint-config-typescript` continues to cover JavaScript, JSON, YAML, and `package.json`.
- **revert** -- the change undone and what is restored. The PR number may accompany the name, never substitute for it.

## Don't

- **State description that hides the change.** The "X now does Y" form is legitimate when the sentence is itself the behavioral delta -- the reader recovers the before-state by negating it ("`nmr prepush` now runs the audit first"). It hides the change when the state is the aggregate of operations the reader cannot recover: "Every lint rule in the shared configuration is now enforced in every package" conceals the change, which was "Fixes all outstanding lint issues and removes the cap that downgraded the severity of associated rules during strict-lint runs."
- **An invented beneficiary.** "Finding a module in the `readyup` package now means asking what role it plays" dramatizes a hypothetical reader; the shipped lede reports the operation (see the refactor exemplar).
- **The catalog.** Enumerating every delta at equal weight buries the one that matters. Status tallies ("Twelve rules remain deferred"), edge-case inventories, and doc-update mentions are body content at best; never mention that documentation was updated unless documentation is the subject of the PR.
- **Teaching instead of reporting.** A lede that explains the team's conventions, tutors the reader in a new language feature, or walks through the rule content the diff touches has stopped reporting. Name what changed; the document itself does the teaching.
- **Empty contrast.** In "a single run reports every defect it finds rather than stopping at the first", the second clause is the negation of the first. Use "rather than" / "instead of" only when the contrast informs ("inspectable rather than flattened into text"). The same test cuts self-evident corollaries ("...so temporary files are no longer left behind").
- **Unearned assurance.** A guarantee against a harm nobody suspected plants the doubt it means to soothe. State an invariant only when the change gives real grounds to fear it broke: "Published output is unchanged" earns its place after a compiler-target bump. A "previously" sentence passes the same test when it does motivation or migration work, and fails it when it merely restates the change's negation.
- **Talking around the name.** "An assertion dependency that nothing imported" withholds `@sindresorhus/is`. If the reader would have to open the diff to learn what you mean, name it.
- **Process narration.** Review mechanics, ticket numbers, finding IDs, test and CI runs, and roads not taken are not part of the change.

## Cut detail, not meaning

A lede can be cut past comprehension, and a too-abstract lede is worse than a longer concrete one. "Drops `jiti` from `release-kit`'s dependencies" passes every rule above -- change verb, named packages, an effect of the diff -- and still fails the reader, who cannot tell whether config loading survived. The shipped lede was longer: "`release-kit` now uses native Node with type-stripping to read its configs. `jiti` is no longer needed as a dependency." When a cut makes the entry harder to understand, the cut is wrong.

## Titles

A title is a one-sentence lede; everything above applies, distilled, plus:

- The code change, not what prompted it. Never "Address review findings" or "Apply feedback".
- No ephemeral references: the title must make sense to a reader with only `git log`.
- Only what is in the diff: external actions (ticket updates, notifications) are not part of the change.
