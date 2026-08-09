# Changelog

All notable changes to this project will be documented in this file.

## 0.8.0 — 2026-08-09

### 🎉 Features

- Fill guidance hooks from codeassembly.yaml bindings at sync time (#1243)

  Guidance hooks are now enabled. A user or project maps rulebooks to a hook in `codeassembly.yaml`, and that guidance is placed inside the skill or subagent definition where the hook sits.

- Carry implementation preferences into code-writing and reviewing agents (#1245)

  Coding and reviewing skills, along with the instructions of subagents who perform coding and reviewing, now include any custom implementation guidance defined by the user or project. Custom guidance is provided by assigning a rulebook to the `implementation-preferences` hook in a `codeassembly.yaml` file.

### 🐛 Bug fixes

- Recognize every deployed file, in every session (#1241)

  Fixes the issue that files deployed by CodeAssembly could be mistaken as editable. Agents are now instructed how to recognize CodeAssembly-deployed files, how to locate the source files, and how to redeploy after source files are updated.

## 0.7.0 — 2026-08-08

### 🎉 Features

- Add capture-feedback to the recommended collection (#1228)

  Adds the `capture-feedback` skill to the `recommended` collection and refines the guidance instructing agents how and where to save feedback as knowledge-base events.

  Separately, tests for that skill and its dependencies are no longer deployed alongside them or shipped in the published package.

- Label the regions sync writes as generated (#1235)

  Guidance files installed by codeassembly, along with the Rovo Dev prompt index, now carry a note that marks the managed block as generated, names where its content comes from, and warns that anything written inside the block is replaced on the next sync.

### 🐛 Bug fixes

- Remove sync's advice to pin a detected harness set (#1229)

  Fixes an issue where `sync` recommended declaring a harness set in projects that have none, even though a harness-neutral project has no harness requirement to declare.

- Bind lede-decision capture to the corpus it serves (#1240)

  Fixes an issue where lede decisions could be saved into the wrong store. Decisions are now saved by default into the `codeassembly` store, and a call to save them to `--store @default` (which could point to any arbitrary store) is refused. If the targeted store is unreachable, the author is told before being asked to decide.

### ♻️ Refactoring

- Source nmr's guidance from the installed package alone (#1230)

  `nmr`'s usage guidance now reaches agent sessions from a single source bundled with the currently installed package. A second copy (installed through the previous distribution mechanism) has been removed. In a fresh clone, the guidance is available once `pnpm run bootstrap` runs.

- Hold project guidance to a cheatsheet (#1233)

  Removes most content from AGENTS.md into its relevant project-level README files, avoiding the injection of unnecessary detail into an agent's context on launch. The `update-project-guidance` skill now instructs agents to perform a similar streamlining and separation when updating guidance in other repos. A mechanical test checks whether the file fits within a 200-line budget.

- Report the same conditions from sync's preview and its real run (#1234)

  `sync` and a `sync --dry-run` now report the same conditions in the same words. A dry run no longer reports a skipped ambient delivery that names no problem. A real `sync` now reports the legacy guidance blocks retired by the run. Both modes warn when a guidance file to be written by the run is not git-ignored.

## 0.6.0 — 2026-08-07

### 🎉 Features

- Gate the boolean prefix on a test and add the tail rule it rests on (#1195)

  Refines guidance in the `naming-conventions` guide on how to name variables, with the aim of improving code clarity, readability, and consistency. Booleans are the main focus.

- 🚨 **Breaking:** Rename the harness id to rovo and qualify the frontmatter key (#1199)

  Renames the internal ID for the Rovo Dev harness from `rovodev` to `rovo`. `--harness rovo` replaces `--harness rovodev` in every command.

  Separately, renames the `harnesses` frontmatter key (which narrows a skill to particular harnesses) to `supported-harnesses:` to avoid confusion.

- Report the retired `harnesses:` frontmatter key from `validate` (#1204)

  `codeassembly validate` now reports every skill whose frontmatter still declares the retired `harnesses:` key instead of `supported-harnesses:`, and exits non-zero.

  This is a safeguard for the recent retirement of the old key. Use of the old key in a skill's declaration would have silently deployed to every harness.

- Make a vetted subset of the library declarable (#1207)

  Vetted guidance artifacts (skills, subagents, and rulebooks) are now organized into two nascent collections: `recommended` (generally applicable) and `williamthorsen` (the maintainer's personal rulebooks). The `triage` collection contains all unvetted guidance. The `all` set continues to deploy all guidance.

- Add the .kb/taxonomy.yaml format with drift reporting and back-fill (#1210)

  Introduces `.kb/taxonomy.yaml`, in which a knowledge base declares the structure of its assertions. `kb check` now reports three kinds of drift between that declaration and the folders on disk: a folder that holds notes nothing declares, a declared area that holds no notes, and a declared area whose parent is undeclared. A knowledge base that already holds notes can adopt a declaration in one pass with the new `kb taxonomy init`, and `--merge` adds only what an existing declaration omits.

- Allow an artifact to belong to more than one collection (#1219)

  A library artifact can now belong to more than one collection: The vetted collections may overlap, and a collection outside the disposition scheme is now a plain bundle whose membership makes no claim about its members. Exclusivity remains only for the two dispositions that assert an absence: A standalone artifact belongs to no collection, and a triage artifact holds no vetted membership.

- Declare which harnesses sync targets (#1221)

  Guidance artifacts declared by a project (skills, subagents, rulebooks, and their dependencies) are now automatically deployed into every installed harness, and no longer depend on detection of a previous deployment when identifying which harnesses to target. Target harnesses can be declared for the user, for the project, or for a single copy of it, with command-line options available as overrides. The deployment report names the harnesses it targeted and how they were decided.

- Guide kb-add note placement with the store's declared taxonomy (#1223)

  Improves classification of captured knowledge-base notes by aligning with the domains declared by the KB's taxonomy rather than looking to the directory structure. If a note is filed in a folder not covered by a domain, that folder is now added to the base's taxonomy. A domain added without confirmation is recorded as awaiting review.

### 🪦 Removed

- 🚨 **Breaking:** Retire the bundled Bitbucket inline-comment script (#1198)

  Removes the `bb-pr-inline-comment` skill. Review guidance now directs agents to post inline pull-request comments through a Bitbucket MCP server or the Bitbucket REST API instead. Guidance for detecting the workspace and repository from a Bitbucket remote now covers the URL form that a Bitbucket clone sets.

- 🚨 **Breaking:** Dissolve `common-mistakes` into its consumers' guidance (#1217)

  Retires the `common-mistakes` skill; declarations that name it must drop the entry. Declaring a collection no longer pulls in the maintainer's personal rulebooks as a side effect. `anti-patterns` takes over rules the retired skill carried: agents are now instructed not to edit installer-generated files in place, and `any` and type assertions count as suppressions. `aspect-test-reviewer` and `orchestrated-coder` are now instructed on `testing-conventions` and `typescript-testing-conventions`, and `orchestrated-coder` also on `development-workflows`.

### 🐛 Bug fixes

- Bar acceptance-criteria revision prompts to genuine conflicts (#1212)

  Revises the code-review guidance to limit the circumstances under which the agent should offer to revise the acceptance criteria (AC). In particular, an implementation that goes beyond the AC or achieves them via a different route is not cause for revision. Revisions are offered only when the implementation materially deviates from or deliberately drops AC; where the review has already raised a finding on that behavior, the guidance is to leave the AC as written rather than restate them around the code. Work that is merely unbuilt, and work beyond what the AC asked, stay in the review's compliance report rather than prompting a ticket edit.

## 0.5.0 — 2026-08-05

### 🎉 Features

- Recognize and strip guidance-hook directives at every render seam (#1173)

  Adds initial support for guidance hooks: Hooks can now be declared in any deployable guidance file. A faulty hook declaration -- such as an unsupported name or duplicate declaration -- aborts the deployment with a diagnostic error message.

  Substitution of actual content for the hook will come later. For now, the hooks are simply stripped from the deployed content.

- Deliver a source's skill support files into its own namespace (#1178)

  Guidance packages can now ship the shared reference files their skills and rulebooks read, and those files reach every harness a consumer syncs to. A package can name those files freely, including names another package or the built-in library already uses.

- Move personal collaboration and workflow preferences into declarable rulebooks (#1181)

  Extracts the maintainer's personal instructions on persona, prompt formatting, and workflow from the shared agent guidance into separate rulebooks: `williamthorsen-collaboration-preferences` and `williamthorsen-workflow-preferences`. The latter includes new preferences relating to ticket structure, splitting, and relationship to PRs. Commit-convention guidance is reduced to a reference to the commit skill.

- 🚨 **Breaking:** Adopt the repository-root AGENTS.md as the project guidance slot (#1183)

  Project guidance has been moved from the custom `.agents/PROJECT.md` file to the conventional `AGENTS.md` location in the project root. The `update-project-guidance` skill is corrected to point the `.claude/CLAUDE.md` include directive to that location.

  The package now publishes readiness checks for the existence, correctness, and freshness of the guidance file. `check-project-staleness.sh`, `claude.sh`, and `rovo.sh` are removed along with their installer entries.

### 🧪 Tests

- Name every test file's isolation tier (#1185)

  Every test file now embeds the name of its tier (unit or tool), each of which can be run separately (`nmr test:unit` or `nmr test:tool`). Git isolation settings that had previously been removed from the root-level test configurations are now restored.

## 0.4.0 — 2026-08-04

### 🎉 Features

- Let reviewers emit gated insights into review artifacts (#1031)

  Code-review agents are now permitted to record "insights" -- non-obvious knowledge worth preserving, such as a pattern, gotcha, or architectural learning that isn't an actionable finding -- in their reviews. Previously a reviewer who noticed such knowledge had to drop it or force it into a finding it didn't fit. The housekeeping steps that follow a review are now instructed to collect these insights, so the knowledge is carried forward instead of being rediscovered later.

- Rule out absence-of-removed-code tests (#1032)

  Agents are now instructed not to add a test whose only purpose is to assert that removed code, text, or behavior stays gone, and reviewers are now instructed not to recommend one. The guidance directs that a removal-only change needs no new test, and that confirming a removal is complete belongs in a one-time pre-merge check rather than a permanent absence assertion.

- Add a redundancy rule to the lede-voice doctrine (#1058)

  The changelog-voice doctrine gains a third drafting rule that aims to reduce verbosity by eliminating statements containing trivial or redundant information. The drafting checklist and the automated draft audit now screen for it too, and the audit gains the cross-sentence comparison it previously could not make.

- Add a no-second-person rule to the lede-voice doctrine (#1070)

  Agents composing changelog and release-notes entries are now instructed not to use the second person.

- Deliver ambient rulebooks mechanically, retiring GLOBAL.md (#1075)

  A rule declared in a rulebook holds in every session, on both Claude Code and Rovo Dev. Previously it held only when an agent chose to look it up, so one session could obey it and the next ignore it, with nothing to show which had happened. Claude Code's built-in Explore and Plan agents are the exception; they do not pick up global rules.

  Machine-specific guidance can be declared through a local source rather than committed to the repository.

  `~/.agents/GLOBAL.md` is retired: `sync --global` removes it, preserving any hand-written content. Upgrading requires running `install` once before the first `sync --global`.

- Show the proposed edit above post-review menu options (#1078)

  Agents offering next steps after a code review are now instructed to show the exact edit an option would make to the ticket or pull request description above the numbered options, flagging any part of that edit that would settle or obviate an open review finding.

- Deliver project ambient rulebooks per harness (#1113)

  Fixes an asymmetry in the availability of project guidance by revising the delivery mechanism. That guidance is now delivered through the harness's `.local.md` files, which guarantees injection into either harness's main agent. Ambient rulebooks should now be the preferred way to deliver guidance to both harnesses.

  Because those files are git-ignored, `codeassembly-agents sync` must be run once in each worktree of a repository. `sync` no longer generates content in `.agents/PROJECT.md` or `.agents/rulebooks/`.

- Adopt a dependency's guidance by naming the package (#1121)

  A project can now adopt guidance accompanying a package by naming the package in `codeassembly.yaml`. This brings in every rulebook, skill, and subagent that the package carries. The `sync` command and `drop` key support this new guidance-delivery method.

  A package makes its guidance available by naming the content directory in its `package.json`.

- Sync guidance at build and install so an upgrade cannot leave it stale (#1123)

  Guidance artifacts declared by a project are now redeployed automatically, so that a fresh worktree, or a tree whose declared package has changed, carries artifacts matching what is installed. A project that consumes guidance from a package can wire the same refresh to its own install using the new `sync --warn-only` flag, which reports a failed sync as a warning rather than aborting.

- Render rulebook links and path tokens per harness (#1124)

  Rulebooks can now address a file by linking to it: A Markdown link to a skill or script, or a home-directory placeholder anywhere in the body, reaches each harness with that harness's own absolute path filled in. A link target that names a place no harness creates is now rejected with an error naming the rulebook and the target. Links opening with a home-directory placeholder now resolve in skills and subagents as well.

- Honor invocation tokens in rulebook bodies (#1129)

  A rulebook can now route an agent to another skill, subagent, or rulebook as a direct invocation rather than a name mentioned in prose, and each delivery renders that invocation in the form the receiving harness understands. A rulebook that routes to a missing target, or to one that deploys nothing an agent can invoke, now fails the run rather than shipping a dead reference. Naming a routing target is now enough to have it deployed alongside the rulebook that names it.

- Capture lede decisions as an accumulating corpus (#1132)

  After a pull request merges, agents are now instructed to ask the author whether the agent's lede (the paragraph summarizing the change) shipped as written or was rewritten before merge. Each decision adds to a body of evidence for refining the lede guidance: the agent's draft, the text that shipped, and the guidance in force at the time. A pull request that merged elsewhere can be recorded on request.

- Check a package's own guidance content before it ships (#1138)

  Adds a `validate` command that checks the CodeAssembly guidance bundled with a package and reports all defects found. The check covers every type of content and all harnesses to which it could be deployed.

- Establish personal rulebooks for code layout and TypeScript preferences (#1144)

  Adds two rulebooks describing code-layout and TypeScript conventions for agent-authored code, covering such topics as naming conventions, placement of test helpers and fixture data, use of JSDoc params, and preference for named exports. The `code-patterns` and `typescript-conventions` skills have been removed, and their content has been absorbed into the new rulebooks.

- Make codeassembly and kb CLI tools publishable (#1164)

  The `codeassembly` CLI now installs from npm, and its `install` and `sync` commands deploy the rulebooks, skills, and subagents it ships into any consuming project. The knowledge-base library `@williamthorsen/kb` and the session-lifecycle event package `codeassembly-lifecycle` are published alongside it.

### 🐛 Bug fixes

- Normalize action and question label identifiers across asks blocks (#1025)

  Fixes inconsistent identifiers in prompts that ask more than one thing: Some asks carried no identifier, and numbering restarted with each list, so a bare "1" was ambiguous and a secondary ask was easy to miss. Agents are now instructed to give every ask in such a prompt a distinct identifier, so a user can answer them all at once by identifier on one line instead of retyping a prose label.

- Name the side effects an approval ask authorizes (#1029)

  Fixes an issue where merging a pull request that also deleted the remote branch required a separate approval just for that deletion. Agents are now instructed to include the branch deletion in the approval they request for a merge, so that a single approval covers both. More broadly, any request for approval must now name the consequential, hard-to-reverse side effects it authorizes, such as force-pushing or closing an issue.

- Reject an anchor link that names no heading (#1135)

  A link pointing at a heading in its own document now fails `sync` and `install` when no such heading exists, or when two do. Every path that renders or ships a body carries the check (rulebooks, skills, subagents, and the guidance files `install` deploys). If the check fails, the deployment is aborted before anything is written.

- State doc-description form and make comment mood opt-in (#1151)

  Comment discipline now requires descriptions that describe "what the function does" and class and component descriptions that say "what the thing is". Function descriptions must start with a verb, and any other opening is declared nonstandard. The guidance also states how long a description may run and which constants, interfaces, and types warrant a description at all.

  Grammatical mood is no longer prescribed universally. The `williamthorsen-comment-preferences` rulebook declares a preference for the third-person indicative in descriptions and the imperative in inline comments.

- Anchor a project-deployed link where its target deploys (#1159)

  Fixes an issue where cross-references between guidance files that `sync` deploys into a project worked only if the linked guidance was also installed in the user's home directory, silently degrading agent output for anyone else.

### 🏗️ Internal features

- Retire input.received and redundant skill.progress emits (#1030)

  The instrumented skills no longer emit routine mid-run progress milestones or a redundant resume signal, and that resume signal is retired from the lifecycle-event vocabulary entirely. Fleet monitoring still derives the same waiting and resume states from a slimmer per-run event stream.

- Extend lifecycle-event instrumentation to five high-traffic skills (#1034)

  Sessions running plan, refine-plan, design-and-plan, and merge-pr, along with orchestrated runs, now surface in the live lane view. A watcher sees each run start, where it pauses waiting on a specific question or approval, the artifacts it saves, and how it ends: completed, stopped, or declined. In design-and-plan, every question in the design dialogue now surfaces individually, so a watcher can tell at a glance which one a paused session is waiting on. Orchestrated runs are labeled with the workflow that launched them.

- Add lifecycle workspace with the canonical envelope, vocabulary & lane fold (#1049)

  Introduces `@codeassembly/lifecycle`, a shared workspace package that houses the canonical lifecycle-event envelope, the event vocabulary, and the fold that turns a lane's events into session and lane state. The package is dependency-free and browser-bundle-safe.

### ♻️ Refactoring

- Remove the ambient ripgrep dependency from the test suite (#1097)

  Tests and the post-build smoke check no longer depend on ripgrep. Separately, the knowledge-base retrieval skills now fail with an explicit error when ripgrep returns output they cannot interpret, instead of reporting an empty result when matching notes exist.

- Rename the authoring rulebook and mark its enforced rules (#1092)

  Renames the rulebook for authoring CodeAssembly skills, subagents, rulebooks, and collections from `authoring-guidance` to `codeassembly-content-specification`, which authors now consult through the `consult-codeassembly-content-specification` skill. Each rule now marks whether violating it breaks the build, fails a test, or carries no automated check because the rule is house style.

- Rename packages to publishable names (#1157)

  Renames CodeAssembly packages in preparation for their initial publication. The package responsible for deploying and syncing agent guidance is now called `codeassembly`.

### ⚙️ Tooling

- Move compilation out of the install lifecycle into a bootstrap step (#1102)

  Fixes an issue where installation of dependencies failed intermittently. Reaching a usable tree afterward now takes one command, `pnpm run bootstrap`, and every workflow that needs a built tree runs it. A command-line tool invoked before bootstrapping now points to a command that exists.

- Migrate Vitest to nmr's centralized model (#1154)

  Changes Vitest configuration so that test suites are selected by project ("unit", "integration", and "app"), eliminating the need for category-specific configuration files. Every package keeps a single Vitest config file, which composes the repo's shared settings rather than carrying its own copy. The nmr fmt command now formats shell scripts as well, and the corresponding package-file scripts have been removed as redundant.

- Run every test in the default gate, classified by what it reaches (#1155)

  Upgrades `nmr` to 0.24, which changes Vitest configuration so that test suites are selected by a tier ("unit", "tool", "localhost", and "remote") corresponding to the services they use. `nmr test:unit` and `nmr test:tool` each run one of these; `nmr test:all` runs every suite. All tests are covered by the default run. `nmr test:integration` no longer exists, and no tests carry the `.int.` infix. The upgraded `nmr` includes a caching feature that skips checks that already succeeded against an identical working tree.

## 0.3.0 — 2026-07-18

### 🎉 Features

- Make recommendation-gradient the interactive default (#532)

  Promotes the recommendation-gradient format from a per-skill reference to a universal interactive convention. Whenever an agent presents 2+ numbered options to the user — in any skill, or with no skill active — each option is now expected to carry a strength marker (■■■/■■□/■□□/□□□) and `➕`/`➖` pros and cons. Adds a `Q1`/`Q2` identifier convention so users can reference answers unambiguously when a single response stacks multiple option-style questions. Switches the indent character that visually separates pros/cons from each option title to a non-breaking space, so the indent survives whitespace normalization in agent output rather than collapsing.

- Delimit publishable content in merge approval prompt (#533)

  Improves the legibility of the pre-merge approval prompt by wrapping the merge commit's title and body in inward-pointing triangle delimiters. Anything outside the triangles — strategy and deletion fields, CI status, free-form commentary — is unambiguously metadata; anything inside is what will actually be published. The same delimiter treatment is applied to the Bitbucket "auto-merge unavailable" fallback notice so the two merge-preview surfaces stay visually consistent.

- Document code+mark restriction in update-jira-ticket (#534)

  Adds a "Composition rules" section to the `update-jira-ticket` skill documenting that `<code>` cannot be combined with other inline marks (`<strong>`, `<em>`, `<a>`, `<strike>`, `<u>`, `<sub>`, `<sup>`) on the same text run, in either nesting direction. Agents encountering this trigger now find the rule by section heading rather than running a bisection cycle. Also extends the existing Confluence-namespace exclusion to cover `<ri:*>` resource identifiers alongside `<ac:*>`, since both have the same failure mode in ADF.

- Inline shared guidance into platform files at install time (#539)

  Improves how shared agent instructions reach platform AI assistants. Source guidance files now use a build-time include directive (`<!-- include: {source-relative-path} -->`) that the installer resolves and inlines directly into the platform-specific files. The previous mechanism (inline `@~/path` runtime references) was unreliable.

- Extract release-notes voice into shared rules (#549)

  Tightens the voice rules that `summarize-change` and `commit` apply when authoring `## What` sections, commit bodies, and PR descriptions. The rules are now centralized in a single shared file with two mechanically enforceable checks — a per-sentence outcome test and an identifier ban — that catch verbose drafts which previously slipped past softer tests.

- Add critical-evaluation guidance to collaboration skill (#550)

  Agents working in interactive mode now treat requests for an opinion — phrasings like "WDYT?", "Is this right?", "Any concerns?", or "Should we…?" — as invitations to critical evaluation rather than validation. When invited, agents are directed to engage with the merits, broaden the frame beyond the developer's immediate framing, verify when their knowledge may be stale, and push back civilly when they disagree.

- Add work-type emojis and breaking tag to PR descriptions (#554)

  PR descriptions now use canonical emojis in section headers and tag breaking changes inline, mirroring release-notes rendering. Several work-type labels are refreshed to match those release-notes conventions.

- Treat tickets as requests; design as if from the beginning (#562)

  Agents working from tickets now treat them as requests rather than specifications and explicitly consider whether the proposed change is worth making at all. When proposing designs, agents target the shape the code would have had if the new behavior had been there from the start, treating workarounds, carve-outs, and bolt-ons as anti-patterns to avoid.

  The new behavior applies wherever tickets are turned into designs: `design-and-plan`, `assess-ticket`, `plan`, and `software-engineering` all consume the updated guidance.

- Auto-retry interrupted reviewer dispatches (#566)

  Orchestrated runs no longer fall back to manual review when an individual reviewer runs out of turns mid-investigation. The engine retries the reviewer once with a tighter prompt, recovering automatically from interruptions that previously required a fresh run.

- Replace /review-change with /review-branch and /review-pr (#570)

  Code review now has two commands. `/review-branch` reviews the current branch against a diff base; `/review-pr <id>` reviews a pull request and evaluates the implementation against both the linked ticket and the PR description. Both accept `--diff-base=<ref>` (default: project's default branch) and `--ticket=<source>` (default: auto-resolved). The previous `/review-change` is removed; to review a specific commit, check it out and run `/review-branch --diff-base=<ref>~1`.

- Support partials in skills and subagent definitions (#571)

  Authors of subagent and skill markdown can now extract repeated content into shared partials and reference them via include directives, with optional inline slot content for per-call variation. This eliminates the cross-file drift that was already producing false-positive findings during automated review.

- Restructure voice and format rules to enforce inline at point-of-use (#573)

  Voice rules — the per-sentence outcome test and identifier ban — and an explicit audit step are now part of every voice-authoring skill at the point of authoring. Agents encounter the rules in their working context just before producing voice content, rather than through a forward reference that was reliably skipped.

- Redefine 👍🏼👎🏼 as a confirmation contract (#586)

  Redefines the `👍🏼👎🏼` marker in agent prompt formatting as a confirmation contract with fixed comprehension semantics. A clear affirmation proceeds with the proposed action; a clear negation stops; anything else — including positive commentary that isn't a clear go-ahead — is conversation, not inferred approval. The marker can be appended to any prompt seeking confirmation, including phrasings with an alternative clause (e.g., "Apply these revisions (say no if you'd like to adjust something else first)?").

- Require repo-relative paths in review finding locations (#594)

  Code-review findings now reference files using repo-relative paths, so readers can identify the right file without grepping when the repo has multiple files with the same name. The path also appears at the top of each finding for at-a-glance scanning.

- Unify artifact frontmatter under a canonical metadata schema (#596)

  Every artifact written by an agent — reviews, devlogs, plans, change summaries, response files, run summaries, deferred-findings, and orchestrated subagent outputs — now carries the same canonical metadata under a single documented schema. Identifying which branch and PR an artifact applies to is zero-effort post-write. Existing artifacts are not modified.

- Guide agents to prefer partials over duplicated content (#598)

  The `code-simplification-reviewer` subagent now consults project-documented DRY mechanisms (partials, includes, snippets, macros) before recommending pointer-indirection as a remediation for duplication. Where the project documents a single-source mechanism that preserves verbatim consumer output, the reviewer recommends that mechanism instead.

- Revise `respond-to-review` to be less deferential to reviewer recommendations (#600)

  Sharpens `respond-to-review` so the agent no longer accepts reviewer recommendations that move, promote, or restructure code or guidance without verifying that the destination's stated doctrine actually accommodates it. For such recommendations, pushback is the default posture; acceptance requires affirmative evidence: The destination's doctrine must clearly accommodate the change, and the move must resolve a real duplication or location problem.

  Hedging language in a recommendation is now treated as a signal that the premise needs independent verification rather than as license to accept on the reviewer's word.

- Make subagent tool-name references platform-portable (#601)

  Subagents and skills now render with each platform's native tool names in body prose. Authors reference tools by canonical name via `{tool:NAME}` placeholders; per-platform mappings live in `content/subagents/_data/{platform}.yml` under a new `_tools:` key. Typos in placeholder names abort install with a file-and-line-anchored error. Frontmatter `tools:` lines and Claude installs are unchanged.

- Add change-narrating voice and jargon to lede-voice (#602)

  Adds two new sections to `lede-voice` — one on change-narrating voice (verbs like `introduces`, `now`, `no longer`), and one on jargon discipline (define-while-naming when the audience may not share a term of art). Tightens the identifier rule so allowed identifiers still earn their words at the lede: A top-level config-file path is named only when the reader needs to act on it, not just to acknowledge that one exists.

  The inline audit checklist for commit-message authoring now names its own limits, pointing readers at the new sections for register and jargon judgments it doesn't test.

- Discourage code-level detail in design-and-plan tickets (#614)

  The `design-and-plan` skill emits tickets whose approach section is now titled `Proposed solution` and is constrained to outcome and architectural fit. File paths, line numbers, code, and syntax-level prescription are out of scope for that section; they belong in the implementation plan.

- Stop reporting "behavior unchanged" in changelog entries (#615)

  Agents are now instructed to avoid reporting "behavior unchanged" in changelog entries and commit bodies.

- Decouple review dispositions from reviewer framing (#616)

  The `respond-to-review` skill now decides review dispositions on whether the change belongs in the codebase, not on the reviewer's suggested handling. Hybrid forms like `ACCEPT (follow-up)` are no longer valid; the disposition vocabulary remains ACCEPT, REJECT, and PARTIAL.

- Add changelog-writer subagent (#620)

  Introduces a `changelog-writer` subagent that composes, rewrites, or audits changelog and release-notes entries against the lede-voice doctrine. The `summarize-change` skill now dispatches it when composing the `## What` section, so PR-description voice is enforced without authors needing to internalize the rules.

- Apply recommendation gradient to all substantive option choices (#625)

  Expands the recommendation gradient to cover every option-style choice with substantive tradeoffs, including the next-steps menus shown after a plan or review. Confirmation prompts (`👍🏼👎🏼`) are now reserved for procedural approve-or-redirect cases.

  Post-plan and post-review menus now surface an additional option: "Implement directly with follow-up review".

  Guidance on presentation of options has been refined: Pros and cons must relate to the specific decision at hand, not restate an option's inherent properties.

- Surface ticket-vs-PR-description divergence in /review-pr (#628)

  Adds a "Specification consistency" section to `/review-pr` output that flags divergence across the ticket, PR description, and implementation, with a per-aspect breakdown and an overall verdict. When there is a divergence, options to address the divergence are presented.

  Renames the `ex-post-facto` skill to `align-ticket-with-implementation`.

- Add kb-retrieve skill for querying the knowledge base (#645)

  Adds a new `/kb-retrieve` slash command that searches configured knowledge bases for notes relevant to a query and returns ranked results annotated with freshness, volatility, and deprecation status. The default search covers the project-local knowledge base and the global vault; `--all-kbs` widens the search to every registered knowledge base, and `--type`, `--tag`, and `--folder` narrow it.

- Add kb-add skill for capturing knowledge-base notes (#652)

  Adds a `/kb-add` skill for capturing knowledge-base notes from a chat. The agent classifies the note, pulls related entries via `/kb-retrieve` for cross-referencing, and proposes the draft for confirmation before writing — or writes it directly when invoked with `--auto`.

- Add comment discipline to agent guidance and review pipeline (#659)

  Introduces a comment-discipline rule that instructs agents writing code to omit common over-commenting patterns: next-line paraphrasing, conversation references, ephemeral ticket references, tutorial-style file headers, and defensive prose about unreachable cases. `/review-branch` now flags any such patterns that slip through.

- Add test-structure discipline to agent guidance and review pipeline (#669)

  Agents writing tests in this codebase are now instructed to use parameterized tables or named helpers to avoid repetitive setup, instead of leaving near-identical copies for the reader that obscure variation among tests. Adjacent tests with buried variation are now flagged during review.

- Add kb-edit skill for post-creation note maintenance (#676)

  Adds a `kb-edit` skill for modifying existing knowledge-base notes: refreshing dates, re-verifying a note without counting it as a content edit, appending text, replacing tags, and superseding one note with another. Previously the only way to change an existing note was to edit the file by hand. The `readonly: true` flag in a KB's `kb.yaml` is now honored on writes from both `kb-edit` and `kb-add`; previously the flag was accepted but ignored.

- Add /revise-comments to audit and edit existing comments (#680)

  Adds a `/revise-comments` command that applies the project's comment-discipline rules to a target file set, rewriting or removing comments in place and reporting what changed in each file. By default it operates on the files committed on the current branch; explicit paths extend its reach to legacy code or uncommitted work, and `--dry-run` previews the edits without writing. Test comments and intentional `eslint-disable` directives are left untouched.

- Add kb-curate skill for vault-wide KB hygiene (#681)

  Adds a `/kb-curate` skill that audits a knowledge base for hygiene problems: broken links between notes, hardcoded home-directory paths, tags that have drifted from their canonical form, verification that is stale or was never recorded, and broken supersede chains between notes. It reports findings without touching the vault by default; run with `--apply` and it additionally repairs the two issues it can fix safely, normalizing drifted tags and reconnecting stale links whose target is unambiguous.

- Treat suppression directives as reviewable design signals (#686)

  Adds guidance that treats a lint or type suppression as a design signal rather than a routine fix. Authors are now directed to try reworking the code, reconfiguring the rule, or defining a scoped exception before suppressing inline, and to attach a rationale to any suppression they keep, naming the rule, why it doesn't apply, and the alternatives rejected. Reviewers now flag suppressions introduced by the change under review as findings, rather than skipping them as routine lint.

- Consolidate the kb.yaml loader and surface registry defects in kb-retrieve (#695)

  When the knowledge-base registry is broken — a malformed config file, or an entry pointing at a directory that no longer exists — `kb-retrieve` now names the specific defect instead of reporting a generic "no knowledge base configured" or "no notes matched." The warning appears even when other knowledge bases still return results, so a broken setup is a one-line fix rather than a multi-step hunt.

- Skip HTML sanitization for the markdown Jira-update tool (#710)

  The Jira-update skill now chooses its update path based on which Jira tool the agent has, rather than steering every agent through HTML sanitization. When the available tool accepts Markdown, the skill directs the update to be authored and submitted as Markdown directly, sparing the agent the work of producing sanitized HTML it never needed.

- Add event capture and a kind-aware record-store core (#717)

  Introduces a way for agents to capture a mistake or a passing observation the moment it happens, in a single phrase, and save it to a centralized store. Agents can recall these observations later, ranked by how often and how recently the same kind of issue has recurred, so the patterns worth acting on rise to the top.

- Relocate event records to content/events/ and document the fix-tag convention (#719)

  Documents how to record a solved problem in the capture-event skill, so past fixes can later be recalled together as a group. Captured event records are now filed alongside the knowledge store's other content rather than at its root.

- Add a config-driven kb check CLI and library export (#735)

  Adds a `kb check` command (and matching `@codeassembly/kb/check` export) that validates an entire knowledge-base store against its rules in one step. Each store controls what gets checked through a new `.kb/config.yaml`, and the command's exit codes let it gate scripts and CI. A malformed config, schema, or tag-alias file now stops the run with a clear error instead of being quietly worked around.

- Add init and sync commands for the project rulebook library (#738)

  Adds rulebooks: a project can now opt into specific units of agent guidance instead of taking all of it or none. Run `codeassembly-agents init` to scaffold the project's rulebook declaration, list the rulebooks the project wants in `.agents/rulebooks.yaml`, then run `codeassembly-agents sync` to apply the declaration. Re-running sync makes no further changes once a project is in sync, and removing a rulebook from the declaration retracts its guidance on the next sync. Shell-script conventions are available as the first rulebook.

- Add skill delivery mode for rulebooks (#754)

  Adds on-demand skill delivery for rulebooks, which previously could only ship as always-on ambient guidance. A project that declares a rulebook for skill delivery now gets it installed by `codeassembly-agents sync` as guidance that agents invoke only when relevant, rather than carrying it at all times. Undeclaring the rulebook or switching it away from skill delivery removes the generated skill on the next sync, and hand-authored skills are left untouched. The shell-conventions rulebook now ships in both ambient and skill form.

- Add a kb create command to provision new KB stores (#755)

  Adds a `kb create` command that provisions a new knowledge base in one step, replacing the manual copy-and-edit of a bespoke provisioning script. It scaffolds the store's starter configuration and content folders and registers the store so the other kb tools discover it. Re-running is safe: it will not overwrite an existing store or claim a name that is already registered. The command is available both on the command line and as a library export.

- Rename the Diátaxis --type flag to --diataxis (#757)

  The `kb-add` and `kb-retrieve` skills now take a `--diataxis` flag for setting and filtering a note's Diátaxis label, replacing the former `--type` flag, which is now rejected.

- Honor the schema recall policy in kb-retrieve (#764)

  A knowledge base store's recall policy now controls how `kb-retrieve` ranks a record type's notes; previously the policy was declared but had no effect on retrieval. Custom record types now rank by whichever policy they declare, so their notes can be ordered by recency, or by how often and how recently they recur.

- 🚨 **Breaking:** Adopt explicit-UTC second-precision timestamps for KB date fields (#773)

  KB note dates and event capture times are now recorded as UTC timestamps precise to the second, so a note can no longer be saved as verified before it was created. The older date-only form is still accepted, so notes in existing stores stay valid. The agent-supplied `--last-verified` flag is removed; callers that pass it now get an unknown-flag error. Adding the first note to a store that previously had none now switches on store-wide verification-staleness checks in `kb-curate`, surfacing older unmarked notes as re-verification candidates.

- Unify plan and design-and-plan on a shared plan template (#782)

  The `plan` skill now turns a ticket directly into an implementation plan, so a user who already has a solid ticket can skip the interactive design dialogue that `design-and-plan` runs and go straight to planning. Plans from `plan` and `design-and-plan` are now interchangeable: The orchestrated pipeline trusts a plan from `plan` as much as one from `design-and-plan`.

- 🚨 **Breaking:** Designate the default KB with a top-level default_kb pointer (#786)

  Designates each machine's default knowledge base with a single top-level `default_kb` key in `kb.yaml`, naming a registered KB. The named KB is the fallback for knowledge-base search and the default destination for `capture-event`, so lessons meant for the current environment stay out of shared project knowledge bases.

  🚨 **Breaking:** Replaces the per-entry `default: true` flag — set a top-level `default_kb: <name>` instead. `capture-event` with no `--store` now records to the `default_kb` rather than a hardcoded `codeassembly` store, and refuses the capture when neither is set.

- Add an addressed-by/addresses relation linking problems to their responses (#787)

  Adds optional `addressed-by` and `addresses` fields to knowledge-base records, so the actions taken to fix or mitigate a problem can be recorded on the problem, the fix, or both.

- Store and reuse resolved ticket and PR URLs in the branch manifest (#789)

  Resolved ticket and pull-request URLs are now remembered, so a remote URL is supplied at most once instead of re-pasted on every command that needs it. After a URL is resolved (or a ticket or PR is created), later commands reuse it automatically; a stored URL that no longer points at its ticket or PR is dropped and re-resolved, and a newer user-supplied URL replaces the stored one. The `review-pr` command no longer requires a PR argument when a PR URL is already remembered.

- Add a kb-edit operation to append addressed-by references (#808)

  Lets a knowledge-base author record what addressed a problem (a fix, a mitigation, a PR, a commit, or a URL) with a single `kb-edit` command, instead of hand-editing a note's frontmatter, so that recalling the problem later surfaces the response alongside it. A single command can attach the same reference to several records at once, linking one response to every incident it addressed.

- Default ticket-emitting skills to concise tickets (#811)

  Skills that produce tickets (`design-and-plan`, `create-ticket`, and `align-ticket-with-implementation`) have been revised to encourage concision. Agents are instructed to omit design-process narrative, in particular.

- Record the agent harness in captured events (#822)

  The `capture-event` skill now records which agent platform produced each event alongside the model. Anyone recalling or analyzing events can tell them apart by the platform whose guidance was in effect when they were captured.

- 🚨 **Breaking:** Rename platform to harness (runtime) and scm (VCS host) (#832)

  The `--platform` install flag is replaced by `--harness` for selecting which agent runtime to target. Projects now set their version-control host with a `scm` key in `.agents/preferences.yaml`; an existing `platform` key keeps working as a deprecated alias. Authors should switch any scripts that pass `--platform` over to `--harness`, and rename `platform` to `scm` in their preferences before the alias is removed.

- Rename collaboration skill to collaborate and make it user-invocable (#837)

  The `collaboration` skill is renamed to `collaborate` and can now be invoked directly as a command, rather than running only when an interactive session triggers it.

- Name skill-delivered rulebooks with a consult- prefix (#839)

  Rulebooks delivered as skills are now invoked as `/consult-<slug>` (for example, `/consult-shell-conventions`) rather than the bare slug, so the command reads as bringing the guidance to bear rather than asking for its raw contents. Authors can override the generated command name from the rulebook's frontmatter. Declaring two skill-delivered rulebooks whose commands collide now fails the sync with an error naming both, instead of silently overwriting one.

- 🚨 **Breaking:** Introduce the codeassembly.yaml rulebook declaration format (#866)

  Adds a new `.agents/codeassembly.yaml` file through which projects opt into shared rulebooks. A project can adopt rulebooks, drop ones it inherits from a broader scope, or opt out of broader scopes entirely, and a gitignored local file holds per-checkout overrides.

  The former `.agents/rulebooks.yaml` is no longer read. The `shell-conventions` guidance is no longer installed automatically as a standalone skill; a project now receives it by declaring the `shell-conventions` rulebook and running `codeassembly-agents sync`.

- Add kb-update-events for batch event editing (#867)

  Adds a `kb-update-events` command that lets agents annotate events already captured in the knowledge store, either marking them as addressed by a reference or replacing their tags. Previously, events were frozen at capture; they can now be updated after the fact. A single invocation can update many events at once, reporting success or failure for each.

- Add library list command to enumerate artifacts (#868)

  Adds a `library list` command to the `codeassembly-agents` CLI that lists every available rulebook, skill, and subagent in one place, so users can discover what the library offers without reading the source tree.

- Add kb-retrieve-events for event recall (#872)

  Adds `kb-retrieve-events`, a command for recalling captured events on their own terms. It ranks results by how often a pattern recurs and then by recency, and shows each event's summary, capture time, and repository, along with how many matched events share that repository and any record of what was done about the problem. `kb-retrieve` now returns assertions only; when a query matches only events, each command's empty result points to its sibling. A note that has lost its record type still appears under `kb-retrieve`.

- 🚨 **Breaking:** Make skills declarable & deployable via codeassembly.yaml (#873)

  Projects can now opt individual skills into delivery by declaring them in `codeassembly.yaml`, so a skill reaches only the projects that ask for it instead of every catalogued skill installing everywhere. Running `sync` delivers each declared skill into the project and withdraws it again once its declaration is removed.

- Make subagents declarable and deployable via codeassembly.yaml (#875)

  Subagents can now be declared in codeassembly.yaml and deployed per project, the same way rulebooks and skills already can. Declaring a subagent for a project delivers it to that project; removing the declaration retracts it, so subagents are no longer installed globally with no way to opt in. The library listing now shows whether each subagent is delivered globally or by per-project declaration.

- Add collections and transitive dependency resolution (#876)

  Projects can now opt into a curated set of artifacts in one line: declaring a collection in `codeassembly.yaml` deploys every artifact it depends on, and everything those depend on in turn. Any artifact can now declare its own dependencies, so deploying one brings along its full set. A `recommended` collection ships as a curated starter set projects can opt into, and `library list` now lists collections alongside rulebooks, skills, and subagents.

- Add capture-feedback skill (#882)

  Adds a `capture-feedback` skill that records information about a desired behavior modification at the time when an undesired behavior is observed.

- Add a user-global deployment domain via sync --global (#884)

  Adds `codeassembly-agents sync --global`, which deploys skills, subagents, and rulebooks at the user level so guidance declared once applies across every project without per-repo setup. By default it enables the recommended set, so a single run lands a ready-to-use baseline. Skills and subagents a user authored or installed by hand are never overwritten or deleted, and a bare `sync` run from the home directory is refused with a pointer to `sync --global`.

- Add collection members key with computed @library membership (#889)

  Introduces an `all` collection that deploys the entire content library (every rulebook, skill, and subagent) and automatically includes newly added artifacts, so there is no list to maintain by hand. The guidance artifacts in a collection are now declared as `members` rather than `dependencies`.

- Resolve and persist ticket URLs for bare or omitted references (#890)

  For platforms whose URL can't be derived from the ticket ID, the ticket URL can now be resolved relative to a base URL specified in preferences. Resolved ticket URLs persist across sessions; once a URL is supplied or constructed, later commands need no ticket argument.

- Apply skill transforms when sync deploys declared skills (#893)

  Skills that use include directives, tool-name placeholders, or relative Markdown links now deploy correctly through `sync`. When a skill's include directives or tool-name placeholders can't be resolved for a target harness, `sync` fails the run and writes nothing.

- 🚨 **Breaking:** Retire unconditional install (#894)

  The full catalog of skills, subagents, and rulebooks can now be deployed to a home or project by opting into it with a single declaration. For a home, the new `init --global` command scaffolds that opt-in, and `sync --global` deploys the catalog into the home agent directories. Breaking: `install` no longer deploys the catalog; it now handles only shared guidance, harness-specific content, scripts, and support data. Existing setups need a one-time migration: re-run `install` to prune the old catalog copies, then run `sync --global`.

- Add authoring-guidance rulebook for agents (#896)

  Adds guidance instructing agents how to author a CodeAssembly skill, subagent, rulebook, or collection: how to declare dependencies between artifacts, how a collection lists its members, the frontmatter fields each artifact type takes, and the naming rules.

- Add a mutable impact rating to events (#901)

  Events in the knowledge base can now carry an optional impact rating (low, medium, high, or critical) denoting the estimated impact of addressing the event.

- Add `{skill:}` and `{subagent:}` invocation tokens (#905)

  Lets skill and subagent authors invoke another skill or subagent inline with a single token that renders to the form each harness expects and is automatically counted as a dependency. The invocation no longer has to be declared as a separate dependency and kept in sync with the prose that performs it. A token naming a skill or subagent that doesn't exist now fails the deploy, the same as a missing declared dependency.

- Surface event impact in recall and filter by it (#906)

  Adds a `--min-impact` filter to `kb-retrieve-events` that restricts results to events rated at or above a chosen impact level, so triaging to the observations most worth acting on takes a single step. Each event's impact rating now appears in the results.

- Make events editable until pushed to the remote (#910)

  Knowledge-base events are now editable until pushed to the shared store. This avoids a situation where an event captured inaccurately or by mistake required a second, duplicate capture to correct it. Once pushed, an event can be overridden by means of deliberate override.

- Generate project-scoped Rovo Dev prompts.yml on sync (#911)

  Syncing a project now adds its skills to Rovo Dev's list of available skills. Previously a synced skill could be invoked only by typing its exact name and never appeared in that list. Prompt entries hand-authored in the project are preserved, and the list stays current as project skills are added or removed.

- 🚨 **Breaking:** Deploy harness-specific skills via the declarative mechanism (#912)

  Skills can now target specific coding-agent harnesses, so a single skill can serve several harnesses without keeping a separate copy for each; a skill that declares no targets deploys to every harness. Installing no longer deploys skills or generates Rovo Dev's `prompts.yml`; skills reach a harness only when declared and synced, and syncing merges that file rather than overwriting it, so hand-authored entries survive. The library listing now shows which harnesses each skill targets.

- Establish the concision spine and wire the ticket and review-comment gates (#923)

  Introduces a shared concision principle for agents to apply when authoring code comments, changelog entries, tickets, review findings, and review comments, with the aim of making each of these more concise.

- Extend compose-time concision to plans, devlogs, summaries (#925)

  Extends the concision guidance that already governs tickets and review comments to plans, devlogs, and chat summaries, with the aim of making these artifacts tighter and easier to scan.

- Default interactive chat to concise with deep-dive opt-in (#926)

  Agents in interactive sessions are instructed to provide concise replies, leading with the answer or recommendation and holding the full walk-through until the reader asks to go deeper, but continuing to surface any flaw, risk, or dissent worth raising.

- Route generalizable feedback to capture-feedback, not memory (#929)

  Agents are now instructed to store generalizable corrections and conventions in a shared knowledge base rather than local memory. Per-project memories are now reserved for facts that are genuinely local and shouldn't propagate.

- Add migrate-feedback-memories skill to route memories home (#930)

  Adds a `migrate-feedback-memories` skill that consolidates the feedback memories accumulated on a machine, routing each to its proper home in a single reviewable pass. Generalizable lessons are captured into the shared knowledge base, each carrying a record of where it originated, so they propagate to every project and machine; memories already captured elsewhere or otherwise redundant are removed; and genuinely local notes are left in place. Nothing changes until the full routing plan is approved, and re-running after a completed migration makes no further changes.

- Scope feedback-memory migration per store and ground triage in each project (#931)

  The feedback-memory migration can now run one project store at a time, so a machine holding many memories no longer has to be migrated in a single sweeping pass. Each memory is now routed against the guidance its origin project has already established, rather than judged in isolation. A store whose origin project is no longer present on the machine is now routed anyway instead of stalling the run. A memory that records an agent breaking an established rule is now kept as a tracked mistake rather than deleted as redundant.

- Resolve rulebooks from user-declared content sources (#935)

  Adds support for drawing rulebooks from user-specified content directories, not just from the built-in library. A user can now override a rulebook the library ships or supply one the library lacks.

- Support skills and subagents from user-declared content sources (#945)

  Skills and subagents declared from a user's own content sources now deploy from those sources, not only from the built-in library. When a source and the built-in library both define a skill or subagent with the same name, the one from the source takes precedence. A source skill or subagent may reuse shared content from within its own source, but referencing content outside that source is rejected. Declaring collections from a source is not yet supported.

- Add a feedback-memories list command and rename the toolbox (#946)

  Adds a `feedback-memories list` command that inventories agent feedback memories across every project on the machine, reporting for each project how many it holds, when its most recent memory was last modified, and whether any memory files were found but couldn't be read. A verbose mode adds each memory's one-line description alongside the paths of any unreadable files, and the inventory can be narrowed to a single project.

- Report the source each deployed artifact resolved from (#947)

  Running `sync` now surfaces the origin of each deployed artifact, whether a declared content source or the built-in library, so a declared source masking a same-name built-in artifact (a shadow) no longer goes unnoticed. Running `sync --dry-run` shows the full origin report for every artifact, while a real run stays quiet unless a shadow occurs, then warns.

- Keep implementation detail out of ticket drafts (#948)

  The `design-and-plan`, `create-ticket`, and `align-ticket-with-implementation` skills now instruct agents to leave implementation mechanism (specific files, API and config names, step-by-step procedure) out of the ticket and defer it to the implementation, while retaining the detail that is the change's actual subject. For bug and refactoring tickets, the instruction keeps the existing code they change and defers only the fix procedure.

- Support collections from user-declared content sources (#951)

  A collection declared in a user content source now deploys its members, just like one from the built-in library; previously such a collection could not be used at all. When a user-source collection opts into the entire catalog, it draws that source's own artifacts rather than the built-in ones. Collections were the last artifact type limited to the built-in library, so a user content source can now supply every artifact type.

- Support a PR number as a branch and artifact identifier (#954)

  Adds support for a pull request with no backing ticket to serve the same role a ticket ID does: Naming a branch `PR-123` now gives that PR its own artifact directory and a stable reference. In a project with a configured ticket base URL (such as a Jira instance), `PR-<n>` no longer resolves to a link for a nonexistent ticket.

- Add spike mode to the ticket and plan authoring skills (#955)

  Adds an opt-in spike mode to the ticket- and plan-authoring skills, for investigations whose goal is to answer a question and enable a decision rather than ship software. A spike ticket centers on the question under investigation, a timebox, and a findings deliverable, with acceptance criteria expressed as questions to answer and decisions to enable rather than observable-behavior checkboxes. A spike plan is organized around lines of inquiry (each stating what it probes, how, and when it is answered) rather than a create-modify-test task list.

- Resolve the PR URL from a PR-based branch identity (#956)

  On a PR-based branch, the pull-request URL is now resolved automatically, so PR-aware skills — reviewing a PR, responding to review feedback, merging — pick it up from the branch instead of requiring the URL to be supplied again each session.

- Standardize ticket-authoring doctrine across the emitting skills (#968)

  The three ticket-authoring skills now reference one consistent standard for the ticket structure. The conventions for test and documentation acceptance criteria now apply to all three skills instead of only one.

- Default to folding discovered work into the current change (#969)

  Agents are now guided to treat a ticket as a signal rather than a boundary: Work discovered mid-task that the problem requires, or that is cheap and serves the ticket's goal, folds into the current change by default. Spinning off a separate ticket now calls for a stated reason beyond the ticket's silence, and the scope decision rests with the person, not the agent.

- Frame agent-guidance changes as instructions, not accomplished behavior (#970)

  Agents composing changelog and commit entries are now instructed to describe the change to guidance rather than a modified downstream behavior that the change itself cannot guarantee.

- 🚨 **Breaking:** Disambiguate the memory-store selector and accept its displayed label (#979)

  Renames the `migrate-feedback-memories` store selector from `--store` to `--memory-store`, which accepts the project label the skill displays when listing stores, not only the path-mangled directory name. Naming a store that does not exist, or a label that two stores share, now fails with an error instead of silently completing as though there were nothing to migrate. Across the skills, `--store` now refers only to the knowledge-base store that `capture-event`, `capture-feedback`, and the `kb-*` skills write to.

- Add an action-items convention that separates asks from prose (#982)

  Agents are now instructed to end any response containing an ask with a single labelled block of action items, placed last. Agents are forbidden from embedding asks in conversational text.

  Agents are also now instructed to nest an option's reasoning beneath the option, fixing an issue where pros and cons would not be correctly indented in terminals that discard whitespace indents.

- 🚨 **Breaking:** Rename and generalize the upgrade-dependencies skill (#1003)

  Extends the dependency-upgrade guidance to any project managed by `package.json`, not just pnpm/Node projects. The guidance is now built to hold up on difficult major-version upgrades and to stay accurate as package-manager ecosystems change. The skill is now invoked as `upgrade-dependencies`; the former `upgrading-dependencies` name no longer resolves.

- Add an implement-plan skill for the implementation phase (#1016)

  Adds an `implement-plan` skill, bringing the implementation phase under the same governance the rest of the ticket lifecycle already had. An agent handed a saved feature plan is now instructed to carry it through to a finished branch: treating the ticket's acceptance criteria as the contract wherever plan and code disagree, leaving the plan itself unedited, and running the plan's own verification gates. The instructions hold whether the plan was written moments earlier in the same conversation or handed cold to a fresh session.

  The menu offered after planning now presents three options rather than four, its two implement options collapsed into a single Implement. Whether the finished work wants a review pass is now decided once there is a diff to judge, rather than before any code exists.

- Add a managed event-hook utility for Rovo config.yml (#1017)

  Adds a utility for managing a project's own Rovo hooks within a shared config that other tools also write to. Callers can add their hooks, check whether each is present, missing, or has drifted from its intended form, and remove the ones they added. Hooks, comments, and settings written by other tools are left untouched, and a config that can't be parsed is never rewritten.

- Add a personal rulebook with em-dash usage rule (#1024)

  Introduces `williamthorsen-writing-preferences`, an opt-in personal writing rulebook that instructs agents never to emit the em-dash character. Where a dash is genuinely the best choice, agents are told to write it as two hyphens (`--`); otherwise, to choose the punctuation or wording that names the relationship.

### 🐛 Bug fixes

- Treat menu omission as drop in /wrap-up (#541)

  Fixes an issue where the `/wrap-up` skill required users to explicitly drop findings they did not want to ticket. Findings the user does not select for ticket creation are now dropped silently — and still recorded in the wrap-up report and the deferred-findings artifact, so user discretion is preserved. The "Drop findings" menu action is removed.

- Stop under-recommending direct implementation (#557)

  Fixes the next-steps menu that pushed bounded single-package work to orchestration when a single review pass would have caught what mattered. Direct implementation is now recommended for that class, with two follow-up paths: direct implementation alone for changes a review pass would not improve, and direct implementation paired with a review pass otherwise.

- Raise reviewer max_turns defaults (#564)

  Mitigates the issue that reviewer agents in orchestrated runs were sometimes killed mid-investigation by `max_turns` exhaustion, forcing a full re-dispatch and wasting the prior round's work. Default ceilings now provide a 30–50% margin over observed worst-case tool-call counts.

- Prohibit `version_message` argument in update-jira-ticket (#579)

  Fixes the recurring wasted retry that agents trigger by passing a hallucinated `version_message` argument to `update_jira_issue` (and `create_jira_issue`). The `update-jira-ticket` skill now explicitly prohibits the argument.

- Restore gradient usage with skill-local pointers (#582)

  Fixes the failure of agents to use the recommendation-gradient format when presenting numbered option-style questions — including in plan refinement, merge composition, and project-guidance setup, where the format previously didn't appear.

- Remove `<pre>` from update-jira-ticket allowlist (#585)

  Removes `<pre>` from the elements permitted in `update_jira_issue` HTML payloads. Eliminates a class of opaque `INVALID_INPUT` failures that occurred when multi-line `<pre><code>` blocks contained quoted strings or apostrophes.

  Multi-line code samples are now rendered as multiple `<p><code>` paragraphs or a single `<p>` with `<br>` separators and inline `<code>`. Single-line code continues to use inline `<code>` inside `<p>` or `<li>` as before.

- Fix shellspec test suite hangs in agents package (#609)

  Fixes two indefinite-hang bugs in the agents package: the shellspec test suite (`pnpm -F agents test:sh`) hung on common developer configurations, and PR-lookup calls (`gh pr list`, `curl`) hung on stock macOS. The shell-test suite now also runs automatically as part of `nmr -F agents test` and `nmr ci`. No migration required.

- Use {platform_home_dir} for helper-script invocations (#613)

  Fixes an issue where skills and subagents looked for a helper script in the wrong location, then wasted tool calls guessing at the install path.

- Make skill tool-name references platform-portable (#619)

  Fixes the issue that Claude-specific tool names were being invoked by some skills. Skills installed for Rovo Dev now use that platform's native tool names. References to `WebFetch` are reworded tool-neutrally because Rovo Dev has no native web-fetch counterpart and web access flows through MCP servers or shell tools.

- Codify dispatch precondition for resolve-frontmatter (#626)

  Fixes a confusing failure when a subagent runs `resolve-frontmatter.sh` and the branch manifest is missing. The error now identifies the dispatcher as the party that must invoke `get-session-context` before dispatch, distinguishes that skill from a script, and points to the precondition contract documented in `artifact-conventions.md`.

- Make resolve-frontmatter work from any subdirectory (#627)

  Fixes an issue where `resolve-frontmatter` failed with a manifest-missing error when invoked from any subdirectory of the repository. The script now resolves its manifest correctly regardless of the working directory, and when the manifest is genuinely absent the error message names the absolute path that was checked.

- Make installable content paths resolve outside the monorepo (#632)

  Fixes silent failures and broken references in installed skills and subagents when run outside this monorepo. `changelog-writer` audit results from non-monorepo contexts before this fix were unverified and should be rerun.

- Skip .DS_Store and stray entries during rovodev install (#633)

  Fixes a crash in `codeassembly-agents install --platform rovodev` that occurred when the destination skills directory contained any non-directory entry, such as a `.DS_Store` file dropped in by macOS Finder. Install now skips stray non-directory entries and completes normally.

- Add update-jira-ticket pre-flight validator and rework recovery protocol (#654)

  Fixes two failure modes in the `update-jira-ticket` skill:
  - Agents repeatedly failing to update Jira tickets. A pre-flight check now catches the HTML patterns the MCP tool rejects and reports specific findings instead of opaque errors.
  - "PROBE delete me" tickets leaking into the user's backlog. Probe creation is now opt-in and carries a label for one-query JQL cleanup.

- Replace `get-session-context` skill with a bundled TS deriver (#663)

  Fixes an issue where artifact writes failed when the branch manifest had not yet been initialized. Subagents and shell scripts can now create the manifest themselves instead of depending on a separate skill to do it as a side effect.

- Tolerate unknown keys in `.agents/preferences.yaml` (#666)

  Fixes an issue where skills that read `.agents/preferences.yaml` or `~/.agents/preferences.yaml` failed when the file contained keys outside the codeassembly schema.

- Fix `&` corruption in rendered titles on bash 5.2+ (#667)

  Fixes an issue where titles containing `&` were silently corrupted when generated by the `commit`, `create-ticket`, `create-pr`, and `merge-pr` skills, so a title like `Add A & B` came out as `Add A {title} B`. Workarounds such as avoiding `&` in titles are no longer needed.

- Move user-global KB config to `~/.agents/kb.yaml` (#675)

  Fixes an issue where Rovo Dev installations of the `kb-add` and `kb-retrieve` skills resolved the user-global KB registry as empty; only Claude Code installations could read it. The user-global config path is now `~/.agents/kb.yaml` instead of `~/.claude/kb.yaml`. Users with an existing file at the old path must move it; there is no fallback.

- Tighten review-finding thresholds for genuine improvements (#679)

  Cuts review noise from style-preference Suggestions and cosmetic Warnings. Reviewers must now produce evidence that a non-defect finding (Warning, TODO, Recommendation, or Suggestion) names a real improvement over the existing code, not merely an alternative; FIXME remains exempt as a defect claim.

- Stop resolving the pr field at artifact-write time; set it only in PR-aware skills (#687)

  Fixes several issues relating to PR lookup: Lookup was being performed by numerous skills even when no remote branch or PR existed; lookup failed for Bitbucket repos when API credentials were not found, even MCP server was available to perform the lookup.

  Writing an artifact no longer triggers a network PR lookup, so artifact writes are faster and no longer depend on transport availability. In MCP-only Bitbucket environments, this removes a misleading credentials-failure message that previously appeared on nearly every write.

- Keep change-summary ledes outcome-shaped (#688)

  Revises the guidance on writing change summaries for documentation changes, instructing agents to describe what readers of the doc will do or know differently, instead of restating what the page says. This guidance applies across the changelog, commit, and merge flows alike, and headlines should now lead with the reader-facing outcome rather than a list of what changed.

- Forbid interactive UI controls when prompting the user (#692)

  Fixes an issue where coding agents would sometimes pop up an interactive picker for multiple-choice and clarifying questions instead of asking them in plain text. Agents are now directed always to present these questions as numbered text option lists, consistently across the supported agent platforms.

- Self-anchor agents helpers at the git repo root (#703)

  Fixes the agents bundled helpers so they work correctly when run from any subdirectory of a repository, not just the directory where the session started. Running a helper from a subdirectory no longer leaves stray `.agents/` directories behind there, and configured project preferences are now honored wherever the helper runs.

- Give the lede pipeline authority to cut supplied mechanism (#708)

  Strengthens agent guidance to fix an issue where implementation detail could leak into the headline section of a generated change summary or PR description, even though that section is meant to carry only the outcome. Detail-heavy changes should now result in a clean headline. A final-review pass has been added to ensure more reliable results.

- Reframe legacy finding-ID rule to prevent ID collisions (#712)

  Fixes a case where two findings in the same code review could be given the same reference number, so a bare reference like "T1" was ambiguous about which finding it meant. Every finding in a review now carries a distinct reference, and a citation points to exactly one finding.

- Drop branch-cleanup advice and deletion-status fields from merge output (#722)

  Fixes an issue where the completion output and saved record after a GitHub PR merge drifted off the merge result, appending unrequested local-branch cleanup steps and reporting branch-deletion statuses that only restated the deletion choice the user had already made.

- Resolve review spec source by recency with an explicit override (#753)

  Fixes an issue where branch and pull-request reviews could flag already-specified work as unplanned or off-spec, because they graded the implementation against a ticket snapshot frozen at planning time even after the ticket had moved on. Reviews now grade against whichever copy of the ticket is more current — the live remote issue or the local snapshot — and each review states which copy it used and when that copy was last updated. A new `--spec-source=remote|local` option lets a reviewer override that choice when they know which copy is authoritative.

- Exclude top-level skills/_partials/ from skill installation (#788)

  Fixes the issue where installing skills left a stray `_partials` directory in the target skills tree.

- Expand templated script paths in installed subagents (#797)

  Fixes an issue where an agent following an installed subagent's instructions could not run a helper script the subagent named, because the named path pointed nowhere; the scripts now resolve to runnable, absolute paths. Separately, orchestrated commits no longer occasionally ship without the configured commit-title prefix.

- Repair collaboration skill's mistake-recording step (#805)

  Fixes an issue where an agent following the collaboration skill's mistake-recording step failed to record the correction, so feedback captured right after a skill's guidance proved inadequate was silently lost. Such skill-caused mistakes are now tagged so they can be recalled together when deciding which skills to revise.

- Require an explicit --store on every capture-event call (#806)

  Fixes an issue where recording an event with `capture-event` could silently file it in the default knowledge base whenever the destination store was left unspecified, misfiling events that should have gone elsewhere. Naming the destination with `--store` is now required: omitting it refuses the capture and reports the available stores and which one is the registry default. The registry default is still reachable, now by naming it explicitly with `--store @default`.

- Stop reviewers emitting self-disqualifying findings (#804)

  Fixes an issue where code reviews surfaced findings that disqualified themselves, such as a recommendation hedged with "no action needed in this change" or a suggestion gated on a condition that isn't currently met. Reviews now carry only findings the author can act on in the change under review.

- Gate kb-add's registry default behind an explicit @default sentinel (#814)

  Fixes an issue where `kb-add` silently wrote a note to the registry's default knowledge base when no destination was named. With no `--kb` flag and no surrounding `.kb/` directory, `kb-add` now refuses and lists the registered knowledge bases instead of guessing; the registry default is reachable only by passing `--kb @default`. The same guardrail applies to `kb-curate`.

- Stop --retag from bumping updated for curatorial tag edits (#823)

  Fixes an issue where retagging a knowledge-base note with `kb-edit --retag` updated the note's last-changed timestamp. A tag cleanup is curatorial, so it no longer makes a record read as more recently changed than it actually is. The `kb-edit` skill also now spells out which editing operations count as a substantive change and which leave the record's recency untouched.

- Write kb-add assertions under content/assertions (#819)

  Notes added with `kb-add` now land in their correct location within the knowledge base instead of at its root, where misfiled notes fell outside the organized content tree. `kb-add` files each assertion under `content/assertions/`, and the `--folder` flag now names only the topic to file it under, rather than the full path.

- Scope kb-retrieve recall to the configured note set (#829)

  Fixes an issue where searching with `kb-retrieve` could return markdown files that aren't notes, such as a top-level README or a draft under an excluded path, even though the rest of the toolchain never treats them as part of the knowledge base. Searches now return only the notes the knowledge base declares, the same set the `kb check` command validates against.

- Prune stale files on install (#836)

  Fixes an issue where `install` left behind previously installed files whose source had since been deleted, so obsolete skills, subagents, scripts, and guidance could keep turning up where agents would discover and load them. Installing now removes these stale files; ones the user has modified are preserved unless `--force` is passed, and `--dry-run` previews the removals.

- Make a no-findings review a valid, full-score result (#838)

  Fixes a pattern where code reviews padded a clean change with low-value findings and then docked its score to match. A change with nothing to fix now earns a full score, and the review reports no findings rather than manufacturing some. Findings of every severity now move the score, closing a gap where the lowest-severity ones piled up without affecting it.

- Remove dangling owned symlinks during uninstall (#844)

  Fixes an issue where uninstalling left behind broken symlinks the tool had installed whose source file no longer existed, instead of removing them. A managed symlink whose target has changed is also now removed during uninstall rather than left in place, so clearing it no longer requires a force flag.

- Wire comment-discipline into respond-to-review (#845)

  The `respond-to-review` skill now directs the agent to apply `comment-discipline` when it edits code to implement an accepted finding, so comments describe what the code does rather than narrating the change, restating the reviewer's concern, or citing the finding that prompted the edit.

- Deploy a subagent's injected skills with sync (#900)

  Fixes an issue where deploying a subagent declaring a skill but not declaring that skill as a dependency could leave it pointing at a skill that was never installed. The skills a subagent injects at runtime are now automatically treated as dependencies and deployed when it is synced. An injected skill that does not exist in the library now fails the sync with a clear not-found error instead of being silently skipped.

- Skip support directories with no installable files (#903)

  Fixes an issue where `install` could abort partway through when a skill support directory contained nothing installable, such as a directory holding only a stray `.DS_Store`. These directories are now skipped, and the install completes normally.

- Declare cross-artifact runtime dependencies (#908)

  Fixes an issue where a skill installed on its own, without the other skills or subagents it invokes, would fail at runtime when it tried to call one that wasn't installed. Installing a skill now also installs the ones it invokes. Within a skill, references to the skills it invokes now render with the command prefix of the active agent tool rather than a fixed slash.

- Prevent create-ticket from mis-associating backlog tickets (#928)

  Fixes an issue where creating a backlog or follow-up ticket while working on a branch that already owned a different ticket overwrote the branch's ticket link and recorded the branch's id in the new ticket's saved files.

- Attribute migrated feedback events to their origin project (#942)

  Fixes an issue where migrating per-project feedback lessons into the shared knowledge base attributed each lesson to the migration run rather than the project it came from, so unrelated lessons were miscounted as a single recurring one. Migrated lessons are now attributed to their origin project.

- Dedup migrated memories by topic, not session id alone (#949)

  Fixes an issue where migrating feedback memories could permanently discard a memory whose lesson had not been captured anywhere else. A memory is now removed only once the knowledge base genuinely holds its lesson.

- Render self-referential and cross-skill invocations per harness (#957)

  Fixes an issue where a skill command named in a skill's or subagent's prose (its own command or a sibling skill's) rendered with the wrong prefix on harnesses other than Claude. Separately, a skill that only names another skill in passing no longer drags that named skill into the deployment.

- Inline output-shaping specs so skills cannot improvise them (#980)

  Addresses malformed next-steps menus and option-style questions: dropped numbering, a recommendation that didn't match the top-rated option, and menus that never appeared at all. Skills presenting these blocks are now instructed to build them from formatting rules the skill states directly. A companion rule directs that any shared instruction an agent must reproduce be stated in the skill that uses it, while material it only consults stays in a linked reference.

- Support events from a harness that exposes no session id (#981)

  Fixes an issue where agents running on a harness that exposes no session id could not capture events at all. Events already stored without a session id can now be marked as addressed, retagged, or rated for impact, so an event whose problem has since been fixed no longer resurfaces as a live candidate on every recall.

- Carry comment discipline in every agent that writes comments (#983)

  Fixes an issue where agents wrote source comments that argued the change to a reviewer, piled on counterfactuals, or narrated the code's history. Every agent that writes or judges a comment is now instructed on what belongs in one, including the orchestration agents, which previously carried no comment standard at all. The instruction now governs comment text wherever an agent writes it, including a replacement comment proposed inside a review finding. Reviews themselves are held to a narrower bar: They may ask for a comment only when it would record a constraint the code cannot show.

- Recommend refine-plan only when decisions remain unsettled (#990)

  Fixes an issue where agents frequently recommended a `refine-plan` pass on plans whose decisions had already been settled during design. Agents are now instructed to recommend the pass only when a decision the plan depends on is still unsettled, and to name that decision in the recommendation itself.

- Remove the visualization hooks that logged an error on every prompt (#995)

  Fixes an issue where submitting a prompt from a repository subdirectory logged a spurious "No such file or directory" error, cluttering the logs and chat history.

- Sweep ticket and plan for missed decisions before saving (#1015)

  Fixes a gap where tickets and plans could be saved without what the design conversation settled (rejected alternatives, agreed constraints and scope boundaries, edge cases, success criteria), leaving users to ask for a completeness pass by hand after the artifacts were already presented as done. Agents running `design-and-plan` or `plan` are now instructed to check both artifacts against the conversation before saving and to fold in whatever is missing, reporting the amendments without reopening approval. `design-and-plan` is also instructed to offer the remote-issue update after this check rather than before it, and only when the refined ticket differs from what the issue already carries.

- Rebuild post-review next steps on the reviewer/author role model (#1020)

  Fixes the issue that agents were offering inappropriate next steps (such as redesign or replanning) after a code review. Agents are now instructed to offer only the steps of handing findings to the author, addressing findings directly, or updating a misaligned ticket or PR description. The offered choices are fitted to where the review began, so a pull-request review and a local-branch review present different options for routing the findings.

### 🏗️ Internal features

- Migrate label-map schema reference to release-kit (#530)

  Generated `.meta/label-map.json` files now reference the release-kit-hosted JSON schema in place of the codeassembly-hosted URL, and the `internal` commit type maps to the `internal` label (renamed from `utility` to align with release-kit's preset). Existing label-map files keep validating without changes: the previous schema URL points at an immutable git tag that continues to resolve.

- Add an emit-event skill helper and lifecycle event envelope v0 (#998)

  Skills can now emit session-lifecycle events (a run's progress, an artifact written, input requested or received, a pull request created) to a live, per-session log, so a watching surface can read it and show what a session is doing as it runs. Emission never blocks the calling skill and cannot fail from its side, so a telemetry problem never interrupts or alters the run being observed.

- Instrument review-branch, respond-to-review, and create-pr with lifecycle events (#999)

  The three most-used interactive skills (branch review, responding to review, and PR creation) are now instructed to emit lifecycle events throughout a run, so a watching surface can render what a session is doing as it works. The skills are instructed to treat emission as best-effort, so it never blocks or changes the work it observes.

- Add a managed hook-entry utility for Claude Code settings.json (#1011)

  Adds the ability to install CodeAssembly's own hook entries into Claude Code's settings file, check whether they are present, and remove them again. Installing is safe to rerun and brings a drifted entry back into line, and removal reaches entries left behind by earlier versions.

- Emit session-lifecycle events via harness hooks (#1021)

  Session lifecycle is now visible on both the Claude Code and Rovo Dev harnesses. A session appears the moment it opens, no longer staying invisible until its first tracked activity, and is marked ended when it exits or switches away rather than lingering as idle. Each turn boundary (a prompt submitted or a response finished) is now reflected as it happens, so the waiting-on-user state no longer rides an unreliable signal.

### ♻️ Refactoring

- Unify Jira-style ticket ID extraction across skills (#529)

  Aligns the two ticket-ID extraction implementations (`get-ticket-id` Bash script and `get-session-context` zero-Bash spec) on a single canonical contract: case-insensitive `[A-Za-z]{2,}-[0-9]+`, first occurrence wins, uppercased on output. Trailing `.N` sub-ticket suffixes and `-description` slugs are tolerated in input but excluded from the canonical ID by greedy-digit boundary behavior. Author- and scope-prefixed branches (`wt/MAC-130`, `wthorsen/MAC-130`) and mixed-case inputs (`wt/compPlaN-795`) now produce identical, uppercased IDs from both extractors. The shared contract lives at `_data/ticket-id-extraction.md` and is cited from both consumer skills.

- Remove duplicated rules from shared AGENTS.md (#547)

  The shared agent-guidance file is trimmed to remove two rules whose actions only the main agent performs — the PR test-plan rule and the insight-recording rule. Both rules remain enforced inside their owning skills (`create-pr`, `summarize-change`, `merge-pr` for PR test plans; `wrap-up` for insights); behavior is unchanged.

- Stop duplicating work-type tiers in commit/SKILL.md (#551)

  The `commit` skill no longer enumerates work-type tier membership inline; tier membership is now sourced exclusively from the canonical taxonomy. Tier glosses (consumer-facing, not consumer-facing, tooling and supporting work) are preserved so dependent prose in the same skill remains self-supporting. Type assignments are unchanged.

- Emit complete YAML frontmatter from resolve-frontmatter.sh (#604)

  Skills and subagents authoring artifacts no longer compose YAML frontmatter by hand: `resolve-frontmatter.sh` now emits the complete frontmatter, which callers prepend verbatim. The `_partials/frontmatter-via-script.md` partial is removed. Existing `--format json` callers are unchanged.

- Consolidate acceptance-criteria scaffold into a partial (#691)

  The `create-ticket`, `align-ticket-with-implementation`, and `design-and-plan` skills now generate acceptance criteria in one consistent format: Must/Should/Nice-have tiers with checkbox items, omitting any tier that has no items. Tickets created with these skills no longer carry a "Fix lint" criterion.

- Deduplicate filesystem-existence and type-guard helpers (#700)

  Consolidates the duplicated filesystem-existence checks and the repeated error and plain-object type guards into shared helpers, so each behavior now has a single definition rather than near-identical private copies that could drift apart. Previously these copies silently disagreed on which errors meant "absent" — some re-threw permission errors while others swallowed them — and which copy you happened to edit decided the behavior; that choice is now deliberate and documented per caller.

- Deduplicate the isRecord type guard across factory and run-core (#707)

  Consolidates a duplicated type guard onto a single shared definition per package. The unified guard also rejects malformed array data, so such data can no longer surface bogus reviewer names in the rendered run visualizations.

- Rename @codeassembly/kb-core to @codeassembly/kb (#726)

  Renames the knowledge-base foundation package from `@codeassembly/kb-core` to `@codeassembly/kb`; code that depends on it should update its import to the new name. The registry loader for `kb.yaml` is also renamed, so in-repo callers should switch to the new loader and its return type.

- Redesign the record taxonomy around a stored recordType discriminant (#742)

  Settles the knowledge-base record taxonomy ahead of publication: Each record now declares whether it is an assertion or an event, instead of having that type guessed from its other fields, so a misfiled record can no longer be silently treated as the wrong kind. A store's `.kb/schema.yaml` must now declare its record-type vocabulary in the new single-list form; the older two-level and flat shapes no longer load and fail with a clear error. The `capture-event` skill no longer accepts `--type` or `--correction` and records a plain event, and the `--type` label on `kb-add` is now optional. Recall now groups repeated events by repository.

- Replace js-yaml with the yaml library (#743)

  Consolidates all YAML parsing on a single library, removing a redundant YAML dependency that overlapped with it.

- Remove the unused immutable record-type schema flag (#765)

  Removes the `immutable` field from the record-type schema in `.kb/schema.yaml`. The field was never enforced, so its presence implied a write-once guarantee that authors never actually had. A schema that still declares `immutable:` keeps loading, with the key now ignored rather than rejected.

- Consolidate duplicated parseTagList and readAll helpers (#781)

  Consolidates two duplicated internal helpers onto single shared definitions. Both helpers also gain direct unit-test coverage they previously lacked.

- Rename PlatformConfig dir-name fields to *DirName (#801)

  Renames the platform's directory-name fields to distinguish them from resolved-path fields.

- Set the shell-conventions rulebook to skill-only delivery (#916)

  Shell-script conventions no longer load into every agent session's standing guidance. They now surface only on demand, keeping that guidance out of the context of sessions that aren't writing shell scripts.

- Narrow resolveClosure to SourceResolver only (#941)

  Consolidates the internal artifact-resolution API on a single calling convention.

- Route the assertion write commands through KbAssertion (#959)

  kb-add and kb-edit now enforce the same assertion contract as the rest of the knowledge-base pipeline, so a note that doesn't conform is refused up front with a specific reason instead of slipping through to a late, generic validation failure.

- Replace rule engine with a type-blind vault-integrity layer (#961)

  Refocuses `kb check` on cross-note integrity instead of per-note frontmatter validation: it now flags wikilinks that resolve to no note and note basenames shared by two or more notes. A duplicate basename is now reported once per vault, rather than once per link that references it.

  The per-store schema override is gone: `kb create` no longer writes `.kb/schema.yaml`, any existing file is ignored, and the record types are now fixed rather than configurable per store. When validation fails, `capture-event` now reports plain error messages.

  For `@codeassembly/kb` consumers, the `@codeassembly/kb/rules` and `@codeassembly/kb/schema` subpaths are removed, and a new `@codeassembly/kb/vault-integrity` subpath is added.

- Route the capture-event add path through KbEvent (#966)

  Amending a captured event no longer reorders its unchanged frontmatter fields.

- Give the store's on-disk layout a single owner (#992)

  Consolidates a knowledge base's on-disk layout (its metadata directory and its note tree) behind a single source of truth that the rest of the codebase reads from, so moving any part of the layout can no longer leave other code pointing at the old location. Previously these conventions were duplicated, and a single drift could silently disable an event store's immutability guarantee. Separately, removes a source of intermittent failures in the agents test suite.

- Separate the smoke-test code from the bundle build tooling (#996)

  Building the skill-helper bundles no longer creates temporary directories or a throwaway git repository. The build now does only build work, rather than also standing up smoke-test fixtures.

- Remove client-side event-immutability enforcement (#997)

  `capture-event --amend` now rewrites an event in place whether or not it has been pushed; the `--allow-pushed` override flag previously needed to amend a pushed event is removed. To correct an event that may already have been shared, agents are now instructed to append a superseding event with `kb-update-events --add-addressed-by` rather than rewrite it.

### 🧪 Tests

- Add edge-case tests for artifact-frontmatter YAML emission (#618)

  Closes three edge-case coverage gaps in artifact-frontmatter YAML emission: canonical field ordering, the bare-colon quoting boundary, and embedded single quotes in list elements.

- Pin --kb resolution for a single-entry default registry (#698)

  Adds a regression test covering `kb-add`'s `--kb` selection against a registry that holds a single knowledge base marked as the default.

- Use full timestamps in test fixtures, not bare dates (#826)

  Test fixtures now seed date fields with full-precision UTC timestamps, the same form real notes carry, instead of bare day-only dates that no writer actually produces. Fixtures that deliberately exercise legacy day-only date parsing and validation keep their bare dates.

- Rationalize install-command tests onto fixtures to remove timeout flakes (#870)

  Shrinks and streamlines install-command tests to avoid intermittent timeout failures that surfaced unpredictably under parallel-worker load.

- Run real-install tests only as a deliberate integration step (#917)

  Fixes a testing issue where unit test runs in the agents package could intermittently fail when a real content-library install runs long under load and overruns the test timeout. The real-install tests responsible now run only on demand, as a deliberate integration step invoked with `nmr test:integration`.

### ⚙️ Tooling

- Exclude generated files from Prettier formatting
- Allow test:sh to run selected shellspec tests (#610)

  The `test:sh` script in `@codeassembly/agents` now accepts positional arguments and forwards them to `shellspec`. Callers can run a single test file, a subset of files, or apply shellspec flags such as `--example PATTERN`, instead of always running the full suite.

- Migrate build to nmr-compile and give mcp an entry point (#1001)

  Building the monorepo's TypeScript packages is now a single compile step that emits both JavaScript and type declarations, so the separate typings pass and a repo-local build script are both gone. When the MCP server is started before the build has run, it now reports that the build output is missing instead of failing with a cryptic module-resolution error, and when a package's command-line tool fails to start, it now reports the real cause instead of always advising a rebuild.

## 0.2.0 — 2026-05-04

### 🎉 Features

- Update run-index.json incrementally during parallel review (#69)

  Updates the orchestrate skill's review-cycle module and the factory visualization to support incremental `run-index.json` writes at every state transition during the review cycle. Adds per-phase `startedAt`/`completedAt` timestamps, an iteration-level structure for `parallelReview`, and fixes a phase-inference bug where `isPhaseEvaluated()` conflated "data present" with "phase completed."

- Add rich summary sections to orchestrated run output (#88)

  Expands the Phase 5 (Summary) template in the orchestrate skill with three new sections — "What was built", "Insights", and "Deferred items" — that capture interpretive, ephemeral content previously lost when orchestration conversations ended. Adds an instruction for the orchestrator to present the same rich summary in conversation, matching the artifact.

  Also adds an instruction for the orchestrator to present the same summary in the conversation after writing the artifact.

- Add post-session wrap-up skill (#95)

  Add a `/wrap-up` skill that provides post-session housekeeping — detecting session type, identifying deferred items and discoveries, presenting a tailored checklist, and delegating to existing skills after user confirmation. Integrate it as a prompted Phase 6 in the orchestration engine.

- Refine wrap-up: numbered findings, action menu

  Replace the checklist format with an inventory of prefixed, numbered items (fixme F1, todo T1, insight I1, etc.) and a numbered action menu, making it easy to see proposed actions and give per-item instructions.

- Add mode system and two-threshold model to orchestrate-dev (#123)

  Adds a `--mode=<vibe|strict>` argument to `/orchestrate-dev` and replaces the boolean `--fix-low`/`--no-fix-low` flag with a two-threshold model (`--approval-threshold` and `--budget-threshold`). Each mode is a preset bundle that configures pipeline phases, review thresholds, model assignments, and review round limits. The threshold model gives finer-grained control over which findings block approval versus which consume review budget opportunistically.

- Migrate orchestrator to MCP and v3 events (#133)

  Rewrite orchestrate SKILL.md and review-cycle module to drive run state via MCP tool calls (init_run, emit_event, register_artifact, complete_run, get_run_state) instead of direct JSON file reads/writes. Replace all run-index.json state writes with emit_event calls, replace artifact array management with register_artifact calls, and replace final status write with complete_run.

  Add get_run_state calls at 5 decision points in the review cycle for cumulative state decisions with MCP-unavailable fallback. Formalize strict subagent return contracts across all 7 subagent files — omitting fields or unrecognized values now cause phase failure with no fallback parsing. Add v3 event-sourced format specification to artifact-conventions.md documenting all 13 event types, the run-log.jsonl format, and the new run directory layout.

  Extract the repeated `get_run_state` fallback clause (6 occurrences across SKILL.md and review-cycle.md) into a single policy statement in each file's preamble section. Remove the duplicate version-mapping sentence from artifact-conventions.md's v3 backward compatibility subsection. Add a reader note at the top of the v2 Schema section directing to the v3 section for new runs.

  Run directories are now stored at `.ai/runs/{ticketId}/{runId}/` instead of `.ai/runs/{runId}/`. When no ticket ID is provided to `init_run`, one is auto-generated in the format `{YYYYMMDD}-{4 hex chars}`.

- Add --mode=lite to orchestrate-dev skill (#143)

  Adds a new `--mode=lite` preset to the `orchestrate-dev` skill, positioning it between `vibe` (fast + lenient) and the default (balanced). Lite mode skips architecture and planning phases for speed but enforces low approval/budget thresholds with up to 2 review rounds, enabling meaningful fix cycles that `vibe` mode cannot provide.

- Add /refine-plan skill for plan review and refinement (#159)

  Adds a `/refine-plan` skill that performs a single review-and-revise round on saved implementation plans, checking for completeness (decision gaps the coder would fill) and correctness (factual accuracy against the codebase). The skill dispatches two new subagents — `plan-reviewer` for analysis and `plan-reviser` for incorporating findings and user answers into a refined plan.

- Replace timestamp prefixes with sequential counters on run artifacts (#170)

  Replaces the `{file-timestamp}` prefix on orchestrated-run artifact filenames with a two-digit sequential counter (`{NN}`), so artifacts sort by creation order instead of sharing an identical timestamp. All four orchestration documentation files are updated: the engine skill, the review-cycle module, the artifact conventions reference, and the save-artifact skill.

  Model: claude-opus-4-6
  Workspaces: agents

- Make review fan-out mode-aware and remove lite mode (#203)

  Thread `aspect_reviewers` through the mode cascade so modes control review fan-out, and remove `--lite` mode (superseded by #199 auto-sizing).

  orchestrate-dev: Remove lite mode argument, preset column, and pipeline section. Add `aspect_reviewers` row to mode preset table — vibe sets all to `false` (deactivated), default/strict use `—` (file-pattern defaults). Use `excluded` for phases not in pipeline to disambiguate from `—`.

  orchestrate: Remove lite from wrapper reference. Add `{aspect_reviewers}` to review-cycle context preparation, derived via shared conversation context.

  review-cycle: Add `{aspect_reviewers}` to inputs table. Replace preferences.yaml activation lookup with two-step resolution (override then file-pattern default). Make aspect-code-reviewer dispatch conditional. Add key-to-reviewer mapping annotations.

- Replace orchestration mode system with effort system (#206)

  Replace `--mode=vibe|lite|strict` with `--effort=low|medium|high` across the orchestration system. Effort defines a ceiling on permitted investment — the orchestrator right-sizes to the task; the effort level determines how far it is allowed to go.

  Key changes:

  - Rewrite orchestrate-dev/SKILL.md with effort presets, resolution cascade, piggybacking rule, and deferred-item handling. Single pipeline replaces per-mode variants.
  - Revise finding scheme from per-category severity names to canonical criticality levels (high/medium/low/none). Max-severity-wins replaces quantity-based aggregation.
  - Add `effort`, `approvalThreshold`, `budgetThreshold` to run-core types, Zod schemas, event-folder, and all three parser paths (v1/v2/v3).
  - Remove `fixLowFindings` field and `--fix-low`/`--no-fix-low` CLI aliases entirely — no consumers remain.
  - Update orchestrate/SKILL.md and orchestrate-review/SKILL.md with effort references.
  - Update all factory and MCP fixture/test construction sites for new type shape.

  Model: claude-opus-4-6
  Workspaces: agents, factory, mcp, run-core

- Create sprite-loading infrastructure for catwalk (#228)

  Replaces the catwalk visualization's geometric primitives (circles + text for station agents, rectangles + text for the orchestrator) with pixel art sprites loaded from PNG sprite sheets. Introduces a sprite loading/caching module, placeholder SVG sprite sheet assets, a Vite static import mapping layer, and refactors both actor classes to render via `Animation` + `GraphicsGroup`.

- Add artifact-write safeguards to subagent prompts (#229)

  Adds four independent safeguards to prevent subagents from exhausting their turn budgets before writing artifact files. Changes span all 10 subagent definitions, the orchestrate SKILL.md turn-budget table, and the review-cycle.md dispatch calls — 12 markdown content files in total.

- Create find-orchestration-savings skill to identify token waste (#232)

  Add a `find-orchestration-savings` skill and supporting infrastructure for analyzing completed orchestrated runs to identify token waste, suggest efficiency improvements, and surface resource misallocation. Extends the run-log event schema with optional usage metrics (`tokens`, `toolUses`, `durationMs`) on four event types and folds them into `CanonicalRunStatus`. The savings analyzer is auto-triggered on Haiku during Phase 5 of the orchestrate pipeline.

  Model: claude-opus-4-6
  Workspaces: agents, run-core

- Add design-and-plan skill for interactive design + planning (#234)

  Adds a new `design-and-plan` skill that provides an interactive, multi-phase workflow for turning a task into a well-defined ticket and an actionable implementation plan. The skill guides the user through understanding, design convergence, ticket refinement, plan generation, and artifact saving — producing two artifacts (a refined ticket and an implementation plan) before stopping.

- Use plan provenance and trust level when calibrating orchestration effort (#265)

  Adds provenance headers to plan artifacts and trust-tiered phase skipping to the orchestration pipeline. Plan-producing skills (`design-and-plan`, `plan-orchestrable-steps`, `refine-plan`) now emit YAML frontmatter identifying the authoring skill, creation timestamp, and codebase state. The orchestrator parses these headers, scores trust (high/medium/low), and adjusts the pipeline — skipping redundant architecture and planning phases for trusted plans.

- Wire up usage metrics for savings analysis (#275)

  Wires up the existing `run-core` usage metrics infrastructure end-to-end so that the orchestrate skill and review-cycle module emit token-based usage data on all completion events, and the savings analyzer prefers those metrics over timestamp-derived duration for cost comparisons.

- Add bb-pr-inline-comment skill (#276)

  Adds a new `bb-pr-inline-comment` skill that posts inline comments on Bitbucket pull requests anchored to specific file paths and line numbers via the REST API. The skill consists of a SKILL.md documentation file and a companion shell script that handles auto-detection of workspace, repository, and PR ID from the git context, with three-tier authentication (bot credentials, API token env var, macOS keychain).

- Add variable naming conventions (#284)

  Creates a `_data/naming-conventions.md` reference file with four variable naming rules (no abbreviations, unit-of-measure suffixes, verb-led function names, boolean prefixes). Wires it into the `code-patterns` skill and add `code-patterns` to the orchestrated-coder's skill list so the coder agent follows these conventions during implementation.

- Show waiting-for-input state in factory visualization (#292)

  Adds end-to-end visibility for when an orchestrated run pauses for user input (permission prompts, elicitation dialogs, idle prompts). New `waiting_for_input` and `input_received` events flow through run-core's event log and Zod schemas into the canonical status model. The factory catwalk visualization derives a `waiting` state for the orchestrator, rendering a concerned animation at reduced opacity. Claude Code hooks detect input-waiting states and emit events to the run log automatically.

- Add plan provenance to save-plan and refinedBy field (#317)

  Adds provenance recording to `/save-plan` and introduces a `refinedBy` field in plan provenance to separate authoring origin from refinement processing. Updates `/refine-plan` to always produce `refinedBy: refine-plan` (including for plans with no prior provenance), and extends the orchestrate trust evaluation with a "refinement-elevated" classification capped at medium trust.

- Add next-steps resumption prompt to plan-producing skills (#329)

  Adds a standardized next-steps resumption prompt to the three plan-producing skills (`design-and-plan`, `refine-plan`, `save-plan`). Creates a shared `_data/next-steps-after-plan.md` reference file that defines the canonical format — three options (Refine plan, Orchestrate, Implement directly) with `▶`/`·` markers, "(recommended)" label, platform-agnostic skill invocation syntax, and priority-ordered recommendation rules. Also adds a conditional ticket-update prompt to `refine-plan`.

- Add ticket compliance checking to review-change skill (#331)

  Adds optional ticket compliance checking to the `review-change` skill. When a ticket is available (via explicit argument or auto-resolved from the artifact directory), branch-scope reviews now include a "Ticket compliance" section that maps acceptance criteria to implementation status. A new shared data file `_data/next-steps-after-review.md` defines the format and recommendation rules for a conditional post-review next-steps prompt.

- Add update-project-guidance skill (#349)

  Add the `update-project-guidance` user-invocable skill to the agents package. The skill generates or refreshes `.agents/PROJECT.md` for any repository through a 3-phase process: discover codebase sources, classify findings by scope (project-specific vs general), and produce a concise project guidance file with interactive review before writing.

- Add numbered options and context-clearing to next-steps prompts (#355)

  Replaces `▶`/`·` markers with numbered options, emojis, and bold recommended labels in both `_data/next-steps-after-plan.md` and `_data/next-steps-after-review.md`. Adds per-option context-clearing guidance and `~/`-relative path formatting. Updates inline example blocks in consuming skills (`design-and-plan`, `refine-plan`, `save-plan`) to match the new format.

- Add staleness and relevancy check to design-and-plan skill (#356)

  Add a heuristic-gated staleness and relevancy check to the `design-and-plan` skill. When a ticket may be out of date (last updated > 3 days ago and > 5 commits since), the skill prompts the user before running the check. Two override arguments (`--check-staleness`, `--skip-staleness`) provide explicit caller control.

- Add assess-ticket skill and extract shared ticket resolution (#359)

  Add a standalone `assess-ticket` skill that evaluates a ticket against the current codebase across three dimensions — drift, relevance, and progress — each producing a constrained enum verdict with traffic-light emoji and supporting evidence. Extract the ticket-source resolution table (previously duplicated in `design-and-plan` and `review-change`) into a shared `_data/ticket-source-resolution.md` reference with a new auto-resolve path that derives tickets from the branch name and environment.

- Add shared complexity rubric and quick-fix pass to wrap-up (#362)

  Adds a shared four-level complexity classification rubric (`_data/complexity-classification.md`) and integrates it into three consuming skills: `wrap-up` gains a quick-fix pass that lets agents apply trivial/mechanical fixes immediately, and both `next-steps-after-plan` and `next-steps-after-review` now reference the shared rubric instead of inline prose criteria.

- Add people-report skill (#365)

  Adds a new shared `people-report` skill that generates HR analytics reports (headcount, attrition, diversity, org health) from user-provided employee data. The skill accepts CSV or tabular data in any format, infers column meanings adaptively, and produces structured markdown reports.

- Add PROJECT.md staleness check and agent launchers (#367)

  Adds shell scripts that check whether `.agents/PROJECT.md` is out of date before launching an AI agent session. A staleness heuristic counts meaningful commits since PROJECT.md was last modified, filtering out commits that only touch package manifests and lock files. Launcher scripts for Claude Code and Rovo Dev run the check and then exec into the respective agent command with all arguments forwarded. An installer symlinks the scripts into a directory on PATH.

- Add severity to legacy findings (#369)

  Replaces the flat `L{n}` legacy finding category with severity-tagged IDs using a `-L` suffix (`F3-L`, `W2-L`, `T1-L`, etc.) across all review-producing skills and agents. Legacy findings now carry the same severity letter as their non-legacy counterpart, sharing the numbering sequence with author findings of the same letter.

- Add complexity classification to assess-ticket and as standalone skill (#371)

  Adds a fourth dimension (complexity) to assess-ticket alongside drift, relevance, and progress. Complexity uses a size scale (⚪/🟢/🟠/🔴) rather than the concern scale of the other dimensions, classifying tickets as trivial, mechanical, involved, or architectural using the existing 4-level rubric.

  Creates `/classify-complexity` as a standalone user-invocable skill with richer output (Scope, Drivers, Risks sections). Both skills reference the shared rubric in `_data/complexity-classification.md` but define their investigation processes independently.

- Skip complexity assessment when progress is complete (#373)

  When the `assess-ticket` skill runs in mode `all` and the progress verdict is `complete`, the complexity investigation is now skipped and its output section omitted. Two locations in the skill definition were updated: the investigation step (to skip the work) and the output step (to omit the section).

- Prompt for next steps after non-baseline assessment verdicts (#375)

  Adds a follow-up action prompt to the `assess-ticket` skill that presents numbered actions when any assessment verdict is non-baseline. Actions are grouped by type (♻️ update, 🏁 close, 💬 comment) and the user selects by number.

- Require tests with code changes across orchestration pipeline (#380)

  Adds targeted guidance to six existing files across the agents content directory so that every layer of the orchestration pipeline enforces test-accompaniment for code changes. The `testing-conventions` skill defines the canonical rule and narrow carve-outs; `design-and-plan` requires test criteria in ticket and plan acceptance criteria; `orchestrated-planner` includes test coverage in step design principles; `orchestrated-coder` mandates writing tests as part of the deliverable; and both `orchestrated-reviewer` and `aspect-test-reviewer` verify acceptance criteria are satisfied, with F-level classification for unmet test requirements.

- Allow commit prefixes to be configured for user and for repo (#387)

  Replaces hardcoded `{workspace}|{WORK_TYPE}:` prefix assembly across agent skills with a deterministic bash script (`describe-change.sh`) that resolves the correct prefix for each context (commit, ticket, PR) from user and project preferences. Extends the agents CLI installer to deploy scripts alongside skills, and updates all consuming skills and the `orchestrated-coder` subagent to call the script instead of constructing prefixes from prose rules.

- Add guidance file install, uninstall, and status support (#389)

  Adds guidance files as a new content type in the agents CLI. Shared guidance (`~/.agents/AGENTS.md`) installs unconditionally before platform detection, and per-platform shims (`~/.claude/CLAUDE.md`, `~/.rovodev/AGENTS.md`) install inside the per-platform loop alongside skills and subagents. All guidance files are tracked in the manifest with drift detection, and supported by the install, uninstall, and status commands.

- Improve outcome-first guidance across change-summary & commit skills (#406)

  Establishes outcome-first writing as a consistent convention across change summaries, commit messages, and condensed branch descriptions, ensuring agents lead with what a change accomplishes rather than how it was implemented.

- Add project guidelines reading to 9 subagent definitions (#408)

  Ensures all codebase-touching subagents read CLAUDE.md and .agents/PROJECT.md as the first step of their process, closing the gap where 9 of 11 agents operated without project context.

- Add GitHub label application to create-ticket skill (#410)

  Enables the `create-ticket` skill to automatically apply GitHub labels for scope and work type when creating issues, using a repo-level mapping file generated by release-kit. Also adds a `platform` field to the preferences/manifest pipeline so skills can distinguish GitHub from Bitbucket repos.

- Rationalize PR creation skills with platform-specific delegates (#411)

  Restructures PR creation into a single user-facing orchestrator (`create-pr`) that delegates platform-specific API calls to internal skills (`create-gh-pr`, `create-bitbucket-pr`). Adds structured YAML frontmatter to `summarize-change` output, enabling downstream consumers to read scope, type, and title without parsing markdown. Retires `prepare-pr`, whose responsibilities are now absorbed by the orchestrator and delegates.

- Adopt release-notes voice in commit/change-summary skills (#417)

  Promotes release-notes voice as the primary rule for commit bodies and the PR `## What` section, so release notes and changelog entries read naturally for users and developers without merger-time rewriting. Adds cross-type examples (`fix`, `feat`, `internal`, `refactor`, `deps`) demonstrating that the same voice applies across every work type. Makes the title/body voice split explicit in the `commit` skill — titles remain imperative (the coder's task), bodies adopt release-notes voice — and cross-references `summarize-change` as the canonical source so future refinements land in one place.

- Add `generate label-map` CLI command with JSON Schema and readyup check (#420)

  Adds a `generate label-map` command to the `codeassembly-agents` CLI that scaffolds `.meta/label-map.json` with canonical commit-type mappings and package-scope entries derived from `packages/*/` subdirectories. The generated file includes a `$schema` reference for IDE integration. Includes a JSON Schema at `packages/agents/schemas/label-map.json` for validation tooling, and a presence check in the default readyup kit that warns when the label map is missing.

- Make devlogs ticket-scoped and add linking frontmatter (#434)

  Adds ticket scoping and linking frontmatter to devlogs created by `/create-devlog`. When a ticket is in session, devlogs now save alongside other ticket-level artifacts under `tickets/{ticket-id}/` instead of the flat project-scoped `devlogs/` directory; when no ticket is in session (research/exploration), the existing project-scoped path is preserved as a fallback. Newly created devlogs carry a YAML frontmatter header recording `provenance` (skill, timestamp, baseSha, isInteractive), `ticket_id`, `run_id`, `branch`, and `commits` — linking each entry back to its ticket, orchestrated run (when applicable), branch, and the commits it summarizes.

- Add provenance markers to generated files (#447)

  Prevents silent loss of edits to installed skills, subagents, and shared guidance by marking every generated file with a visible "GENERATED FILE" header that links to the file's canonical source in this repository. Agents (and humans) reading an installed file now see, before the frontmatter keys, that edits will be overwritten on the next install and where the source actually lives.

- Require outcome-first framing in commit titles (#454)

  Modifies the `commit` skill to require titles to describe the outcome a change delivers, not the mechanism it uses. Titles previously satisfied every written rule yet left readers of the changelog and release notes with no sense of what was fixed, added, or improved.

- Have Rovo Dev present choices as numbered text (#457)

  Replaces Rovo Dev's arrow-key `ask_user_questions` prompts with a numbered plain-text list, which is easier to scan and accepts free-form replies.

  Introduces `codeassembly-guidance.md` as a platform-scoped addendum that lives alongside the Rovo wrapper and is `@`-referenced from it. Future platform-specific guidance can layer on the same way — the install pipeline already enumerates every file in `content/guidance/_platforms/{platformId}/`, so no install-code changes were required.

- Have /design-and-plan evaluate tickets on their merits (#463)

  Adds an "Evaluate the ticket on its merits" step to the `/design-and-plan` skill, so the agent now critically assesses each ticket's framing, scope, proposed solution, and title accuracy before forming clarifying questions or designing a solution. When the evaluation surfaces a divergence from the ticket as written, the agent raises it to the user instead of carrying the ticket's framing forward unchanged.

- Append `Closes` line to PRs and expose `ticket_ref` (#465)

  If a ticket ID can be determined, a PR created via `create-pr` now includes a `Closes {ticket_ref}` line at the end of the PR body.

- Add update-jira-ticket skill to prevent INVALID_INPUT failures (#470)

  Adds a new user-invocable skill, `update-jira-ticket`, to prevent the recurring opaque `INVALID_INPUT` failure when updating a Jira issue's description or comment via the `update_jira_issue` MCP tool. The skill prescribes a narrow HTML allowlist, forbids observed failure triggers, and the tool's file-path mode), and provides a bounded recovery protocol that records structured failure data so escalation decisions can be made.

- Render commit, ticket, PR, and merge titles from declarative templates (#475)

  Replaces the prefix-resolver in `describe-change.sh` with a declarative title-templating model. Each surface — commit, GitHub issue, PR, and squash-merge commit — now has its own `*.title_format` template that the script renders into a complete title from five tokens (`{scope}`, `{type}`, `{title}`, `{ticket_ref}`, `{pr_number}`). Optional `[...]` groups drop entirely when any inner token is empty, so a single template like `[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]` collapses gracefully across every state a title might be rendered in.

- Render ticket reference consistently in artifact headings (#479)

  Improves consistency of artifact headings across review and summary skills by rendering them from the `ticket_ref` field exposed by `get-session-context`, replacing the previously hand-rolled `{TICKET}` placeholder convention used at five sites. Fixes a latent bug in `create-ticket` where the heading on GitHub-style projects produced `# 461: Title` instead of the correct `# #461: Title` (missing the `#` sigil).

- Persist deferred findings from /wrap-up sessions (#482)

  Adds a `deferred-findings` ticket-level artifact that `/wrap-up` writes at Phase 4. It records what remains to be done after a session — skipped findings (deferred without tracking) plus cross-references to any tickets created (deferred with tracking). Insights, applied quick fixes, and posted devlog content are out of scope; the artifact is a focused index of unfinished work, not a session summary.

- Add recommendation gradient to clarifying questions (#483)

  Adds a recommendation gradient that agents apply when asking numbered clarifying questions, so each option carries a strength label and a brief rationale of inline pros and cons instead of arriving as a bare list. The strength is conveyed by a four-level marker — ■■■ strongly recommended, ■■□ recommended, ■□□ weakly recommended, □□□ not recommended — and the developer can tell at a glance whether the agent is leaning strongly, weakly, or has no preference at all (in which case the markers are omitted entirely).

- Adopt cost-aware three-lane disposition for findings and follow-ups (#485)

  Adds a cost-aware mental model for ticket creation, so agents stop reflexively filing tickets for trivial follow-ups whose per-ticket overhead would exceed the underlying work. Every finding is now routed into one of three explicit lanes — **do now** (drive-by), **batch later** (one ticket covering several related items), or **separate ticket** (one ticket per substantive item) — and the user retains discretion to drop any finding through an explicit action rather than menu omission.

- Adopt plural tickets_created and drop counts (#487)

  Lets `/wrap-up`'s deferred-findings artifact record batch tickets — a single ticket addressing multiple findings — without schema contortion. The `tickets_created` frontmatter field now uses a uniform `items: [<ID>, …]` shape for both single-finding and batch entries, replacing the prior singular `item: <ID>`. Also removes the redundant `counts.ticketed` counter, which was fully derivable from `tickets_created.length`.

- Surface recommendation-gradient format at point of use (#488)

  Surfaces the recommendation-gradient format at the point of use in clarifying-question callsites, so agents reliably produce numbered questions with the prescribed marker glyphs and inline pros/cons rationale instead of confabulating the format from priors. Also relocates the canonical spec to a dedicated `_data/` reference doc, keeping the `collaboration` skill focused on its declared scope.

- Reframe `## What` guidance around outside-reader audience (#492)

  Sharpens the `summarize-change` skill's guidance for the `## What` section — the bullet that becomes a changelog entry and, for significant changes, a release note. The guidance now leads with a concrete audience (an outside developer scanning the changelog or an end user opening release notes) and gives writers an explicit checklist (the release-notes test), a one-paragraph soft length ceiling of about 100 words, and a second worked example of the diff-inventory failure mode. The existing per-work-type examples and the original Bad/Good pair are preserved.

- Codify design priorities: correctness over convenience (#493)

  Codifies a design-priorities principle for shared agent guidance: when ranking design options, prioritize the right decision over the most convenient one. Correctness considerations — behavioral correctness, API quality, architectural soundness, testability, maintainability — rank options. Convenience considerations — level of effort, blast radius, consistency with existing code, scope minimization — are secondary, a tiebreaker among correctness-equivalent options at most. Adds the principle as a single source of truth under skill data, with thin cross-references from the recommendation-gradient, software-engineering, design-and-plan, and plan skills so the rule is encountered wherever skills present design alternatives.

- Add merge-pr skill family and rename merge config section (#495)

  Adds a `/merge-pr` skill that composes a merge-commit message and executes a GitHub PR merge through `gh`, removing the need to hand-type `gh pr merge` flags. The skill resolves scope and type from PR labels (or commit majority when labels aren't conclusive), composes the merge-commit body from the live PR description's `## What` section, and aways requests approval before invoking the API.

- Add advisability dimension to /assess-ticket (#498)

  Adds an Advisability dimension to the `/assess-ticket` skill, capturing the agent's recommendation on whether to implement a ticket as written.

  The dimension synthesizes four shared evaluation facets — problem reality, scope correctness, solution soundness, and title accuracy — into one of three verdicts: `advisable`, `questionable`, or `inadvisable`.

  Non-baseline verdicts surface follow-up actions: `questionable` prompts a "Revise ticket" option that coexists with the existing "Update ticket" option as a separate next step, and `inadvisable` prompts "Close as inadvisable".

- Mark skips and successes in install/uninstall output (#499)

  Adds emoji prefixes to the output of `agents-files install` and `agents-files uninstall`: every skip and "no … directory" warning now starts with `⚠️ `, and the per-platform `Installed N items …` and `Removed N items, skipped N modified items` summary lines start with `✅ `. Skipped items — such as a hand-modified file the installer leaves untouched, or a missing source directory — now stand out from surrounding progress lines instead of blending into them. Section headers, `Manifest updated.`, dry-run preview lines, and `agents-files status` output are unchanged.

- Canonicalize finding icons; switch Suggestion to ☝️ (#500)

  Adopts canonical icons for finding categories so code-review output, wrap-up inventories, and review responses render the same severity cue. The Suggestion icon changes from 💡 to ☝️, and 💡 becomes the canonical Insight icon shared by wrap-up and chat summaries. The duplicate finding-scheme table that lived in the review-criteria skill is removed in favor of a link to the canonical scheme, so the table has one source of truth.

- Resolve merge-pr scope and type via a tested script (#502)

  Replaces ~30 lines of prose pseudocode in the `merge-pr` skill with a tested bash script that resolves scope and type deterministically across agent invocations. The script reports each dimension as resolved (with a value) or ambiguous (with a candidates list), so different agents running the skill against the same branch now produce identical resolutions where they previously could drift on tie-breaking, prefix-matching, and breaking-change marker handling.

- Show pros and cons in a list instead of inline (#503)

  Improves the readability of clarifying-question option lists. When the agent presents a numbered list of options with pros and cons, each `➕` and `➖` item now appears on its own line indented three spaces under the option title, rather than running inline after the title separated by semicolons. The rule applies uniformly to every option — including those with only a single pro or con — so the prompts have predictable shape regardless of how many items each option carries.

- Add preferences.yaml schema and normalize default_remote (#509)

  Adds a JSON Schema for `.agents/preferences.yaml` so editors can autocomplete and validate the configuration that drives the agents toolchain, and so the schema's shape is published for downstream tools that depend on it. Top-level sections are strictly typed (typos in section names are caught), user-keyed maps (integrations, model overrides, artifact paths) remain extensible, and the orchestration severity-threshold fields are constrained to known values. Also normalizes `repository.default_remote` from a single-element list to a singular object — the configured shape now matches what every consumer in the repo actually reads.

- Pre-load reviewer context for unfamiliar third-party APIs (#517)

  Adds reviewer-context pre-loading to the `orchestrate` skill. Before each reviewer dispatch — Phase 4 core, all aspect reviewers, Phase 4a simplifier, Phase 4b holistic, plus every re-review — a tested bash helper assembles a context block from two independent sources: a coder-emitted sidecar artifact for branch-specific API gotchas, and a static lookup table for known-confusing packages (seeded with `@hyperjump/json-schema`). When non-empty, the block is inlined as `## Reviewer context` in the reviewer's prompt. Reviewers stop burning their `max_turns` budget re-investigating the same third-party API surface the coder just explored.

- Have reviewers write findings incrementally for interruption resilience (#523)

  Reviewer subagents now write their findings incrementally as they discover them, leaving a partial artifact on disk if a dispatch is interrupted by max-turns exhaustion or a harness pause. The orchestrator detects the partial artifact at the canonical path, treats the dispatch as failed-with-context for flow control, and retains the partial findings list for continuation dispatches and the run summary — replacing the previous all-or-nothing failure mode where an interrupted reviewer produced no artifact at all and forced a redispatch with inferred partial context.

### 🐛 Bug fixes

- Restore platform-specific skill handling and prompts.yml generation (#144)

  Adds a `content/skills/_platforms/{platformId}/` directory convention for platform-specific skills, modifies `installSkills()` to filter underscore-prefixed directories and separately install platform-specific skills, and adds `generatePromptsYml()` to produce Rovo Dev's skill discovery file. Migrates three skills from configs.macos: `review-permissions` (Claude-only), `brainstorming` and `systematic-debugging` with 9 supporting files (Rovo-only).

- Fix wrap-up skill action menu and summary narrative (#146)

  Fixed two UX flaws in the `wrap-up` skill: eliminated the hidden dependency between insight recording and devlog saving by routing each insight to the action it depends on, and replaced the vague session summary placeholder with session-type-specific guidance that steers the agent toward describing the code change outcome.

- Fix inconsistent artifact logging (#154)

  Fixes four regressions in the MCP `init-run` tool introduced by PR #133: aligns the local run directory path with the global export structure, removes the redundant project slug from run IDs, adds `sanitizeTicketId()` to strip leading `#` characters, and updates skill documentation for bare numeric branch handling.

- Fix silent logging failure when MCP is unavailable to orchestrate engine (#158)

  Adds an MCP availability guard to the orchestrate engine that detects when MCP tools are unavailable at `init_run` time and applies a preference-controlled policy (`required`/`prompt`/`optional`) to determine whether to abort, ask the developer, or continue without MCP tracking. Includes fallback local context generation, a unified MCP call policy for skipping all tracking calls when unavailable, and mid-run disconnection handling. Also fixes a kebab-case variable mismatch in the fallback context generation path.

- Resolve artifact base directory from preferences instead of hardcoding project path (#168)

  Replaced the hardcoded `join(projectRoot, '.ai', ...)` in the MCP `init_run` tool with a preference cascade resolver that defaults to `~/.ai`. Added a new `resolve-base-dir.ts` utility, an optional `baseDir` parameter to the MCP schema, 15 new tests for the resolver, and updated existing tests for hermeticity. Updated orchestrate skill and artifact conventions documentation.

  Model: claude-opus-4-6
  Workspaces: agents, mcp

- Guard against zero parsed steps in high-trust plan conversion (#278)

  Adds a zero-steps guard to the "High-trust plan conversion" section of the orchestrate skill. When the resolved plan (from either a JSON companion or markdown parsing) has an empty `steps` array, the guard emits a corrective `phase_decision` event, downgrades `{planTrust}` to `"medium"`, and aborts the conversion so Phase 2 runs the planner in adoption mode.

- Improve adherence to commit conventions (#283)

  Replaces the non-user-invocable `git-commit-conventions` skill with a new `commit` skill that is user-invocable and includes body formatting rules. Adds body formatting conventions to `_data/commit-format.md` as the single source of truth, and updates all cross-references across subagents and skills.

- Remove ticket ID from condense-branch commit format

  The commit format template included `{TICKET}` in the title, contradicting
  the `commit` skill rule that ticket IDs belong only at merge time.

  Also strengthened the `summarize-change` caveat to explicitly reference
  the `commit` skill rule.

- Clean up PR and review output conventions (#285)

  Adds explicit output rules to four agent skills: no automated checks in test plans (`summarize-change`, `prepare-pr`), descriptive labels instead of raw finding IDs in PR comments (`review-criteria`), and a common-mistakes entry for finding IDs used out of context. Also strengthens the no-hard-line-breaks rule in `commit` and `common-mistakes` with inline emphasis and a concrete wrong/right example.

- Replace 24-hour active-run heuristic (#314)

  Replaces the 24-hour wall-clock heuristic for detecting active runs with structural signals from `run-index.json`. In `review-change`, an active run is now identified by matching `context.branch` to the current branch and verifying `completedAt` is absent. In `orchestrate`, the time-based "unknown (recent)" / "unknown (stale)" freshness sub-categories are collapsed into a single "unknown" category mapped to the **medium** trust tier.

- Install _data support files and filter dotfiles (#347)

  The install command now deploys the `skills/_data/` support directory alongside skill directories, and filters dotfiles (`.DS_Store`, etc.) from both the install and build pipelines. Previously, all underscore-prefixed directories were skipped during installation, which prevented 20+ skills from accessing their referenced data files.

- Replace symlinks before writing generated files

  When `prompts.yml` or subagent files exist as symlinks (e.g., from an older dotfiles-managed setup), writeFile follows the symlink and writes into the dotfiles repo, making its working tree dirty.

  Add `unlinkIfSymlink` helper and call it before writing `prompts.yml` and merged subagent files so they become real files at the target path.

- Fix broken _data/ relative paths in skill files (#352)

  Fixes broken `_data/` relative paths in 15 skill files so shared reference documents (artifact conventions, naming conventions, next-steps rules) are correctly resolved at runtime. Also normalizes 3 backtick-only references to markdown link syntax for consistent auto-resolution, deletes the redundant `case-conventions.md`, and consolidates `~/.claude/CLAUDE.md` content into `~/.agents/AGENTS.md`.

- Fix next-steps-after-plan over-recommending refinement (#354)

  Restructures the recommendation rules in `next-steps-after-plan.md` so orchestration is the default and refinement is a special case with concrete, self-filtering criteria. Updates all three consuming skills (`design-and-plan`, `save-plan`, `refine-plan`) to provide accurate recommendation context and use dynamic recommendation placeholders instead of hardcoded markers.

- Replace plugin code-simplifier with standalone reviewer (#361)

  Replaces the external `pr-review-toolkit:code-simplifier` plugin dependency in the orchestrate pipeline with a standalone `code-simplification-reviewer` subagent defined in `content/subagents/`. Updates all references across the orchestrate skill, sibling entry-point skills, and shared artifact conventions. Also tightens the `next-steps-after-plan` recommendation heuristic to prevent recommending direct implementation for cross-cutting renames.

- Rewrite relative Markdown paths to absolute during skill install (#368)

  Adds a path-rewriting transform to the agents CLI install pipeline that converts relative Markdown link targets to absolute `~`-prefixed paths during copy-mode skill installation. A new `path-rewriter.ts` module provides a pure content-transform function and a recursive directory walker, integrated into `installSkillEntry` after `copyItem` for directory entries in copy mode only.

- Add bin wrappers to eliminate pnpm install warnings (#394)

  Point `bin` entries at committed wrapper scripts in `bin/` instead of directly into `dist/esm/`. pnpm creates bin symlinks during install, before lifecycle scripts run, so the `dist/` target doesn't exist in a fresh worktree and `pnpm install` emits confusing "Failed to create bin" warnings.

  Each wrapper dynamically imports the build output at runtime. If the build output is missing, the wrapper detects `ERR_MODULE_NOT_FOUND` and tells the user to run `pnpm run build`.

  Adds `packages/run-core/README.md` documenting the package's exports, CLI, and the wrapper pattern convention.

- Resolve script paths at install time via template variable (#395)

  Replaces `{skills_root}/../scripts/` with `{platform_home_dir}/scripts/` in skill source files. The installer rewrites `{platform_home_dir}` to the absolute platform path (e.g., `~/.claude`) during install, so agents never see the template variable or navigate relative paths.

  Skills are now always copied and rewritten during install, even in `--link` mode. This mirrors the existing subagent behavior (frontmatter merging requires copy). `--link` continues to symlink guidance files and scripts.

- Escalate test gaps for pipeline-authored code to F-level (#396)

  Replace the AC-dependent test-gap classification from #379/#380 with authorship-aware rules. The prior approach hedged with "do not infer a test requirement where none was stated," which gave reviewers an escape hatch to classify untested pipeline-authored behavior as T (deferred at medium effort).

  The new approach is binary: if we wrote the code (`orchestrate-dev`), untested branch-authored behavior is F; if we didn't (`orchestrate-review` / standalone), it's T.

- List at-risk files in symlink safety error message (#397)

  `checkSymlinkSafety` now lists the contents of the symlinked directory (up to 5 entries, with an overflow count) in its error message, so users can see exactly what files are at risk before removing the symlink. Falls back gracefully if the directory can't be read.

- Filter stale entries from manifest on partial uninstall (#399)

  Fix both the shared guidance and platform uninstall paths to filter out successfully removed entries from the manifest when some entries are skipped due to user modifications. Previously, both paths returned the original manifest unchanged, causing `codeassembly-agents status` to report deleted files as `missing`.

- Replace hardcoded artifact paths with placeholder in examples (#401)

  Renames the default `artifact_base_dir` from `~/.ai` to `~/ai-artifacts` across all skill documentation. Replaces the hardcoded `/Users/william/.ai` path in 11 of 12 worked examples in `get-session-context` with the placeholder `"{artifact_base_dir}"`, and updates the relative-path example to use `ai-artifacts` instead of `.ai`.

- Add documentation coverage convention to plan-producing skills (#405)

  Adds a documentation coverage convention to all plan-producing skills and the plan reviewer, parallel to the existing test coverage convention. Plan steps that add, remove, or rename user-facing surface now require corresponding documentation updates in their acceptance criteria.

- Eliminate relative Markdown links in installed guidance (#439)

  Fixes an issue where agents following `~/.agents/AGENTS.md` could not locate the `artifact-conventions.md` file its "Plan files" section referenced. The link was a bare-relative target that standard Markdown resolution looked for under `~/.agents/` — where it does not exist. Shared guidance now references skills by name instead of by path, so no convention is required for an agent to reach the canonical source. Platform guidance additionally gains install-time path rewriting, preventing the same failure class from reappearing as new links are added.

- Prevent backtick over-escape in agent-authored GitHub bodies (#445)

  Fixes an issue where agents creating GitHub issues, pull requests, or comments via skill guidance could backslash-escape backticks inside the body, causing GitHub to render `` \`foo\` `` and ``\`\`\`ts`` literally. Every affected skill now writes the body to a scratch file and invokes `gh` with `--body-file`, removing the bash context in which the over-escape habit took hold.

- Have orchestrated-coder write change-summary incrementally (#453)

  Fixes a failure mode where orchestrated-coder interrupted mid-dispatch — most commonly on `max_turns` exhaustion for a multi-task plan — produced no change-summary artifact, forcing the orchestrator to reconstruct state by inspecting the working tree. Partial summaries are strictly more useful than missing ones; the orchestrator now always has a structurally-complete artifact to read, regardless of whether the coder ran to completion. The same guarantee extends to the coder's review-response mode.

- Make subagent guidance refs apply on Rovo Dev (#472)

  Fixes subagent definitions that referenced `CLAUDE.md` directly. The same definitions install into both `~/.claude/agents/` and `~/.rovodev/subagents/`, but Rovo Dev does not load `CLAUDE.md`, so the "read project guidelines" step pointed Rovo Dev subagents at a file that did not apply.

  Subagents now reference `~/.agents/AGENTS.md` and `.agents/PROJECT.md` — files that work on both platforms. Subagents do not have these files injected automatically; pointing to them explicitly is what gives a subagent any awareness of project rules, persona, and conventions.

- Default merge-pr to remote-only branch deletion via tristate flag (#504)

  Replaces the binary `--delete-branch yes/no` flag on the `merge-pr` skill with a tristate `--delete {both|remote|none}` and changes the default to `remote`. The new default deletes only the remote branch (via a direct GitHub refs API call) and leaves the local branch and worktree alone, so PR merges now succeed in worktree-based workflows where `main` is held by another worktree. The legacy `both` behavior remains available as an explicit opt-in. When the post-merge remote deletion fails (branch protection, transient network, race), the skill prints a warning, exits zero, and records the failure in the merge artifact rather than masking the successful merge.

- Extract Jira-style ticket IDs from author-prefixed branches (#528)

  Fixes an issue where `get-ticket-id` failed to extract Jira-style ticket IDs from branches with an author prefix (e.g., `wt/COMPPLAN-795`) or with the ticket embedded inside a longer slug (e.g., `feat/COMPPLAN-795-add-foo`). Both shapes now resolve correctly. Also fixes latent bugs in the `ticket_ref_prefix` lookup so commented-out preference lines are skipped and absent or comment-only values resolve to empty rather than returning comment text.

### 🏗️ Internal features

- Migrate work-types to a JSON SSOT with schema validation (#516)

  Replaces the work-types markdown table with a structured JSON SSOT validated by a JSON Schema, expands the vocabulary from 11 types in PRIMARY/SECONDARY/TERTIARY tiers to 15 types in public/internal/process tiers, and introduces a per-type `breakingPolicy` field (`forbidden | optional | required`) that decouples the breaking-marker rule from tier. The taxonomy now includes `drop`, `deprecate`, `sec`, and `perf` as first-class public-tier types alongside the existing `feat` and `fix`, aligning with conventional-changelog ecosystems and unblocking downstream tooling that needs to derive constants from this list.

### ♻️ Refactoring

- Deduplicate finding scheme from reviewer agents into shared skill (#134)

  Enhanced the `review-criteria` skill to include the full F/W/T/R/S/L finding scheme (category table, criteria definitions, criticality mapping, escalation rule) and updated all 4 reviewer agents to reference the skill instead of inlining the scheme. Net reduction of ~80 lines across 5 files, eliminating ~240 lines of duplicated content.

- Rename get-branch-context to get-session-context, centralize artifact resolution (#322)

  Renames the `get-branch-context` skill to `get-session-context` and extends the manifest schema with `artifact_base_dir` (resolved absolute path) and `artifact_paths` (relative category suffixes). Removes `get-project-slug` and `get-default-branch` as standalone skills, subsuming their functionality into the manifest. Updates all 18 consuming skills, 4 subagents, and reference documentation to use the manifest instead of inlining the 3-step preference cascade.

- Remove stale get-session-context references from reviewers (#327)

  Removes three stale references left behind by the get-branch-context to get-session-context rename (#319): a `get-ticket-id` reference in artifact-conventions.md, unused `get-session-context` skill dependencies in three aspect reviewer subagents, and a dead fallback path in orchestrated-reviewer for computing merge-base-sha.

- Rename parse/resolve_prefix to title_format names (#481)

  Aligns the internal helper names in `describe-change.sh` with the `title_format` YAML schema they parse, removing a vocabulary mismatch carried over from the schema rename in #466.

### 🧪 Tests

- Add tests for describe-change.sh and installScripts (#398)

  Add comprehensive test coverage for two components introduced in #383: the `describe-change.sh` prefix-resolution script (34 ShellSpec examples) and the `installScripts` function in `install.ts` (7 Vitest cases). Also add shell formatting scripts and fix a directory-handling gap in `installScripts`.

### ⚙️ Tooling

- Migrate to nmr script runner (#378)

  Replace hand-rolled `scripts/run-workspace-script.ts` and custom utility scripts with `@williamthorsen/nmr`. Root `package.json` scripts reduced from 35 to 4 (lifecycle hooks + repo-specific). Workspace packages no longer define a `ws` script — nmr serves as the workspace script runner directly.

  Replace hand-rolled consistency tests (`nodejs-version.app.test.ts`, `pnpm-version.app.test.ts`, and their helpers) with `runConsistencyChecks()` from `@williamthorsen/nmr/tests`.

  Remove orphaned root devDependencies: `@williamthorsen/toolbelt.objects`, `js-yaml`, `@types/js-yaml`.

- Automate replacement of dashed separator comments with headings or region folds (#451)

  Removes the noisy boxed and rulered comment separators that had accumulated across the codebase and replaces every occurrence with simpler forms or folding-region markers. Introduces a reusable sweep script to automate this process. Documents the convention in the `code-patterns` skill so future agent-generated TypeScript follows the same rule.

### 📚 Documentation

- Document optional fields in artifact-conventions

  Add `tokens?`,` toolUses?`, `durationMs?` to the event types table for `phase_completed`, `reviewer_completed`, `coder_fix_completed`, and `re_review_completed`. These optional fields are populated by the orchestrator when capturing Task result metrics; older runs omit them.

## 0.1.0 — 2026-03-01

### 🎉 Features

- Add agents workspace with CLI for skill and subagent installation (#66)

  Create packages/agents — a self-contained workspace that ships 37 skills, 8 subagent definitions, and a TypeScript CLI (codeassembly-agents) for installing them into ~/.claude/ and ~/.rovodev/ platform directories.

  Core capabilities:
  - Per-item copy-based installation with manifest tracking (SHA-256 content hashing)
  - Platform-specific subagent frontmatter merging (TypeScript port of sync-agent-files.sh)
  - Drift detection: install skips user-modified files unless --force is set
  - Development mode: --link creates symlinks for instant feedback during authoring
  - Symlink safety: refuses to install if target directory is a symlink

  CLI commands: install [--platform --link --force --dry-run], uninstall [--force], status

  Package structure: content/ (skills + subagents), src/lib/ (types, platform, frontmatter-merger, manifest, installer, content-resolver), src/commands/ (install, uninstall, status), src/cli.ts (entry point)

  68 tests across 9 test files covering frontmatter merging, manifest operations, file installation, platform detection, and full command pipelines.

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
