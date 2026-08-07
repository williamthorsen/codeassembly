# Changelog

All notable changes to this project will be documented in this file.

## 0.4.0 — 2026-08-07

### 🎉 Features

- Add the .kb/taxonomy.yaml format with drift reporting and back-fill (#1210)

  Introduces `.kb/taxonomy.yaml`, in which a knowledge base declares the structure of its assertions. `kb check` now reports three kinds of drift between that declaration and the folders on disk: a folder that holds notes nothing declares, a declared area that holds no notes, and a declared area whose parent is undeclared. A knowledge base that already holds notes can adopt a declaration in one pass with the new `kb taxonomy init`, and `--merge` adds only what an existing declaration omits.

- Guide kb-add note placement with the store's declared taxonomy (#1223)

  Improves classification of captured knowledge-base notes by aligning with the domains declared by the KB's taxonomy rather than looking to the directory structure. If a note is filed in a folder not covered by a domain, that folder is now added to the base's taxonomy. A domain added without confirmation is recorded as awaiting review.

## 0.3.1 — 2026-08-05

### 🧪 Tests

- Name every test file's isolation tier (#1185)

  Every test file now embeds the name of its tier (unit or tool), each of which can be run separately (`nmr test:unit` or `nmr test:tool`). Git isolation settings that had previously been removed from the root-level test configurations are now restored.

## 0.3.0 — 2026-08-04

### 🎉 Features

- Make codeassembly and kb CLI tools publishable (#1164)

  The `codeassembly` CLI now installs from npm, and its `install` and `sync` commands deploy the rulebooks, skills, and subagents it ships into any consuming project. The knowledge-base library `@williamthorsen/kb` and the session-lifecycle event package `codeassembly-lifecycle` are published alongside it.

### ♻️ Refactoring

- Rename packages to publishable names (#1157)

  Renames CodeAssembly packages in preparation for their initial publication. The package responsible for deploying and syncing agent guidance is now called `codeassembly`.

### ⚙️ Tooling

- Move compilation out of the install lifecycle into a bootstrap step (#1102)

  Fixes an issue where installation of dependencies failed intermittently. Reaching a usable tree afterward now takes one command, `pnpm run bootstrap`, and every workflow that needs a built tree runs it. A command-line tool invoked before bootstrapping now points to a command that exists.

- Migrate Vitest to nmr's centralized model (#1154)

  Changes Vitest configuration so that test suites are selected by project ("unit", "integration", and "app"), eliminating the need for category-specific configuration files. Every package keeps a single Vitest config file, which composes the repo's shared settings rather than carrying its own copy. The nmr fmt command now formats shell scripts as well, and the corresponding package-file scripts have been removed as redundant.

- Run every test in the default gate, classified by what it reaches (#1155)

  Upgrades `nmr` to 0.24, which changes Vitest configuration so that test suites are selected by a tier ("unit", "tool", "localhost", and "remote") corresponding to the services they use. `nmr test:unit` and `nmr test:tool` each run one of these; `nmr test:all` runs every suite. All tests are covered by the default run. `nmr test:integration` no longer exists, and no tests carry the `.int.` infix. The upgraded `nmr` includes a caching feature that skips checks that already succeeded against an identical working tree.

## 0.2.0 — 2026-07-18

### 🎉 Features

- Add a config-driven kb check CLI and library export (#735)

  Adds a `kb check` command (and matching `@codeassembly/kb/check` export) that validates an entire knowledge-base store against its rules in one step. Each store controls what gets checked through a new `.kb/config.yaml`, and the command's exit codes let it gate scripts and CI. A malformed config, schema, or tag-alias file now stops the run with a clear error instead of being quietly worked around.

- Add a kb create command to provision new KB stores (#755)

  Adds a `kb create` command that provisions a new knowledge base in one step, replacing the manual copy-and-edit of a bespoke provisioning script. It scaffolds the store's starter configuration and content folders and registers the store so the other kb tools discover it. Re-running is safe: it will not overwrite an existing store or claim a name that is already registered. The command is available both on the command line and as a library export.

- Alphabetize the default schema's field lists and add diataxis to assertion (#760)

  A Diátaxis documentation type is now a recognized optional field on assertion notes, and new stores provisioned by `kb create` recognize it from the start.

- Add note targeting to kb check via paths and --vs (#769)

  `kb check` now accepts positional arguments specifying a subset of notes to check (glob patterns, files, or directories) and a `--vs=<ref>` option to check only the notes changed versus a git ref.

- 🚨 **Breaking:** Adopt explicit-UTC second-precision timestamps for KB date fields (#773)

  KB note dates and event capture times are now recorded as UTC timestamps precise to the second, so a note can no longer be saved as verified before it was created. The older date-only form is still accepted, so notes in existing stores stay valid. The agent-supplied `--last-verified` flag is removed; callers that pass it now get an unknown-flag error. Adding the first note to a store that previously had none now switches on store-wide verification-staleness checks in `kb-curate`, surfacing older unmarked notes as re-verification candidates.

- 🚨 **Breaking:** Designate the default KB with a top-level default_kb pointer (#786)

  Designates each machine's default knowledge base with a single top-level `default_kb` key in `kb.yaml`, naming a registered KB. The named KB is the fallback for knowledge-base search and the default destination for `capture-event`, so lessons meant for the current environment stay out of shared project knowledge bases.

  🚨 **Breaking:** Replaces the per-entry `default: true` flag — set a top-level `default_kb: <name>` instead. `capture-event` with no `--store` now records to the `default_kb` rather than a hardcoded `codeassembly` store, and refuses the capture when neither is set.

- Add an addressed-by/addresses relation linking problems to their responses (#787)

  Adds optional `addressed-by` and `addresses` fields to knowledge-base records, so the actions taken to fix or mitigate a problem can be recorded on the problem, the fix, or both.

- Add a kb set-default command for the default knowledge base (#798)

  Adds a `kb set-default` command for choosing the machine's default knowledge base from the command line — by name, or interactively from a list of registered knowledge bases. Previously the default could only be changed by hand-editing the registry file.

- Set the default knowledge base when creating one (#799)

  `kb create` now configures a default knowledge base automatically, so a new user no longer has to run a separate command before working with one. When no default is set yet, the newly created knowledge base becomes the default; when other knowledge bases are already registered without a default, `kb create` prompts for which one to use on an interactive terminal, or points to `kb set-default` when run non-interactively.

- Record the agent harness in captured events (#822)

  The `capture-event` skill now records which agent platform produced each event alongside the model. Anyone recalling or analyzing events can tell them apart by the platform whose guidance was in effect when they were captured.

- Add kb-update-events for batch event editing (#867)

  Adds a `kb-update-events` command that lets agents annotate events already captured in the knowledge store, either marking them as addressed by a reference or replacing their tags. Previously, events were frozen at capture; they can now be updated after the fact. A single invocation can update many events at once, reporting success or failure for each.

- Add kb-retrieve-events for event recall (#872)

  Adds `kb-retrieve-events`, a command for recalling captured events on their own terms. It ranks results by how often a pattern recurs and then by recency, and shows each event's summary, capture time, and repository, along with how many matched events share that repository and any record of what was done about the problem. `kb-retrieve` now returns assertions only; when a query matches only events, each command's empty result points to its sibling. A note that has lost its record type still appears under `kb-retrieve`.

- Add a mutable impact rating to events (#901)

  Events in the knowledge base can now carry an optional impact rating (low, medium, high, or critical) denoting the estimated impact of addressing the event.

### 🐛 Bug fixes

- Require an explicit --store on every capture-event call (#806)

  Fixes an issue where recording an event with `capture-event` could silently file it in the default knowledge base whenever the destination store was left unspecified, misfiling events that should have gone elsewhere. Naming the destination with `--store` is now required: omitting it refuses the capture and reports the available stores and which one is the registry default. The registry default is still reachable, now by naming it explicitly with `--store @default`.

- Scope kb-retrieve recall to the configured note set (#829)

  Fixes an issue where searching with `kb-retrieve` could return markdown files that aren't notes, such as a top-level README or a draft under an excluded path, even though the rest of the toolchain never treats them as part of the knowledge base. Searches now return only the notes the knowledge base declares, the same set the `kb check` command validates against.

- Support events from a harness that exposes no session id (#981)

  Fixes an issue where agents running on a harness that exposes no session id could not capture events at all. Events already stored without a session id can now be marked as addressed, retagged, or rated for impact, so an event whose problem has since been fixed no longer resurfaces as a live candidate on every recall.

### 🏗️ Internal features

- Add type-blind note I/O and declared per-type record modules (#858)

  The kb package can now read and write the two knowledge-store record shapes: the knowledge entries themselves and the observations captured to refine them, each on its own terms, so an observation no longer carries fields that belong only to a knowledge entry. Fields it doesn't recognize are preserved unchanged, so records survive a read-write round trip intact.

### ♻️ Refactoring

- Rename @codeassembly/kb-core to @codeassembly/kb (#726)

  Renames the knowledge-base foundation package from `@codeassembly/kb-core` to `@codeassembly/kb`; code that depends on it should update its import to the new name. The registry loader for `kb.yaml` is also renamed, so in-repo callers should switch to the new loader and its return type.

- Redesign the record taxonomy around a stored recordType discriminant (#742)

  Settles the knowledge-base record taxonomy ahead of publication: Each record now declares whether it is an assertion or an event, instead of having that type guessed from its other fields, so a misfiled record can no longer be silently treated as the wrong kind. A store's `.kb/schema.yaml` must now declare its record-type vocabulary in the new single-list form; the older two-level and flat shapes no longer load and fail with a clear error. The `capture-event` skill no longer accepts `--type` or `--correction` and records a plain event, and the `--type` label on `kb-add` is now optional. Recall now groups repeated events by repository.

- Consolidate duplicated kb test helpers into a shared module (#758)

  Consolidates the knowledge-base package's duplicated test helpers — temporary-directory setup, path-existence checks, and KB scaffolding — into one shared test-support module.

- Remove the unused immutable record-type schema flag (#765)

  Removes the `immutable` field from the record-type schema in `.kb/schema.yaml`. The field was never enforced, so its presence implied a write-once guarantee that authors never actually had. A schema that still declares `immutable:` keeps loading, with the key now ignored rather than rejected.

- Normalize declaration ordering across the kb package (#770)

  Every source file in the kb package now follows a single declaration-ordering convention — exported declarations first, non-exported helpers grouped at the end — so a developer can locate any function by its position rather than learning each file's own arrangement.

- Route the assertion write commands through KbAssertion (#959)

  kb-add and kb-edit now enforce the same assertion contract as the rest of the knowledge-base pipeline, so a note that doesn't conform is refused up front with a specific reason instead of slipping through to a late, generic validation failure.

- Replace rule engine with a type-blind vault-integrity layer (#961)

  Refocuses `kb check` on cross-note integrity instead of per-note frontmatter validation: it now flags wikilinks that resolve to no note and note basenames shared by two or more notes. A duplicate basename is now reported once per vault, rather than once per link that references it.

  The per-store schema override is gone: `kb create` no longer writes `.kb/schema.yaml`, any existing file is ignored, and the record types are now fixed rather than configurable per store. When validation fails, `capture-event` now reports plain error messages.

  For `@codeassembly/kb` consumers, the `@codeassembly/kb/rules` and `@codeassembly/kb/schema` subpaths are removed, and a new `@codeassembly/kb/vault-integrity` subpath is added.

- Give the store's on-disk layout a single owner (#992)

  Consolidates a knowledge base's on-disk layout (its metadata directory and its note tree) behind a single source of truth that the rest of the codebase reads from, so moving any part of the layout can no longer leave other code pointing at the old location. Previously these conventions were duplicated, and a single drift could silently disable an event store's immutability guarantee. Separately, removes a source of intermittent failures in the agents test suite.

### 🧪 Tests

- Use full timestamps in test fixtures, not bare dates (#826)

  Test fixtures now seed date fields with full-precision UTC timestamps, the same form real notes carry, instead of bare day-only dates that no writer actually produces. Fixtures that deliberately exercise legacy day-only date parsing and validation keep their bare dates.

### ⚙️ Tooling

- Fix type resolution in the published kb and run-core packages (#975)

  Fixes the published form of `@codeassembly/kb` and `@codeassembly/run-core`: Installing either package previously delivered no usable type declarations, and a packed copy carried no build output at all. Types now resolve correctly for consumers of both packages, which unblocks the pending `nmr` upgrade.

- Migrate build to nmr-compile and give mcp an entry point (#1001)

  Building the monorepo's TypeScript packages is now a single compile step that emits both JavaScript and type declarations, so the separate typings pass and a repo-local build script are both gone. When the MCP server is started before the build has run, it now reports that the build output is missing instead of failing with a cryptic module-resolution error, and when a package's command-line tool fails to start, it now reports the real cause instead of always advising a rebuild.

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
