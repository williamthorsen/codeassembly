# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 — 2026-10-10

### 🎉 Features

- Moves the CodeAssembly library and its helpers from the `codeassembly` package into the new `codeassembly-guidance` package at `packages/guidance`, whose support files deploy under `_sources/codeassembly-guidance/`. (#1933)
- Adds the Claude-only `prepare-prototype-brief` skill, which composes and checks the shared brief for a round of competing prototypes, dispatches one builder per lens, and writes a comparison of the prototypes after `index-prototypes` builds the index page. (#1936)
- Adds the ambient rulebook `command-output-conventions` to the `recommended` collection, which directs an agent to print only the fact that a step needs from a large or repeated command's output, and, for a repeated evaluation, to print one line per case from a single scorer. (#1938)
- Adds a "Procedures in helpers" section to the `codeassembly-content-specification` rulebook, which directs an author who edits a skill or subagent to move a step whose result is fixed by its inputs into a helper that emits JSON, extending an existing helper when one already performs the step. (#1952)
- Makes `create-ticket` resolve a new ticket's labels by running `describe-change.mjs resolve-labels`, which now accepts a call without `--body-file` and labels the record from `--type`, `--scope`, and `--breaking` alone. (#1952)
- Adds the `manage-jira-ticket.mjs` helper, which `create-ticket` now runs to resolve the project key and issue type from the repository's `.agents/preferences.yaml`, check a parent reference, and run `acli jira workitem create` exactly once. (#1955)
- Directs the `acli` path of `update-jira-ticket` to convert a Markdown body to ADF with the helper's `convert-body` subcommand, which turns GFM task lists into Jira task items. (#1955)
- Adds the `describe-change render-details` subcommand, which renders a change summary's `## Details` body from an entries file, with its headings, subsection order, and breaking prefix taken from `work-types.json`. (#1957)
- Adds a launch prompt for each ticket that keeps work to the "Split the ticket" report of `design-and-plan`, `plan`, `refine-plan`, and `save-plan`, which starts the session at `design-and-plan`, `plan`, `refine-plan`, or `implement-plan`, depending on how much of the ticket's design and plan is already settled, and lists the ticket's plan path, scope notes, and blockers. (#1961)
- Adds a launch prompt for each piece to the "Split the branch" report of `implement-plan`, which starts the session at `review-branch` with the piece's diff base, names the piece's branch and worktree, and shows each later piece as blocked until its predecessor merges. (#1961)
- Adds the `--related-to <#>` option to the `groom-backlog` skill, which assesses the open tickets related to a closed ticket in place of the backlog: the tickets that mention it or its closing pull request, the tickets that it blocked, its parent and the parent's other open children, and the tickets that name a file touched by the closing pull request. (#1966)
- Adds the `pending-ripples` command to the `groom-backlog` helper, which lists the closed tickets that a ripple has not yet assessed, since a given date or else since the last pull or the last groom that was not a dry run. (#1966)
- Adds the `related` command to the `groom-backlog` helper, which returns a ripple's related set with its counts by tier without writing anything. (#1966)
- Directs the `ticket-assessor` subagent to examine a ripple's closed ticket and pull request first, and to recommend `close-complete` when the pull request met the ticket's motivation or when the ticket is a parent whose children are all closed. (#1966)
- Extends the `groom-backlog` issue fetch to request each ticket's parent, blockers, sub-issue counts, assignees, and milestone, which requires `gh` 2.100 or later. (#1966)
- Adds a final step to `merge-pr` that reads the open tickets related to the ticket that the merge commit closes and asks for consent before running `groom-backlog --related-to` on them, or records an empty ripple when the merged ticket does not have any related tickets. (#1967)
- Adds a "Ripple merged ticket #N" action to `wrap-up`, which it offers for a ticket closed by a PR merged in the session when `pending-ripples` reports that the ticket has not been rippled yet. (#1967)
- Adds the `pull-from-backlog` skill, which presents the current milestone's umbrellas, in-progress tickets, and blocked tickets with the backlog's warnings, offers the unblocked and unassigned tickets as a ranked menu with the reasons for each rank, and assigns the picked ticket to the user on consent. (#1969)
- Adds the `ticket.pull` project preferences, which set the milestone that `pull-from-backlog` treats as current, the prefix of the priority labels, the thresholds at which a branch or a groom counts as stale, and whether a pick assigns the user without asking. (#1969)
- Adds a "Product development" section to the `williamthorsen-workflow-preferences` rulebook, which states the stages from idea to increments, with a usable MVP before further features, and the shape to propose once the developer approves the end vision: an epic whose iterations are its sub-issues, with only the current one specified in detail. (#1973)
- States which artifact holds what: a design doc in the repo holds the vision, the epic points to it and lists the iterations in order, the milestone marks the current iteration, and each later iteration stays a one-line outcome until its work starts. (#1973)
- Names the winning prototype as the baseline for the finished product, the floor on quality and feel against which it is judged, with a feature reduced in one iteration recorded as a one-line sub-issue and a feature settled below that bar recorded in the design doc with its reason. (#1973)
- Makes `create-commit` take the paths to stage and a one-line purpose as arguments, compose the body from the diff alone when no purpose is passed, and report the new commit's short SHA and title or the reason that nothing was committed. (#1979)
- States in `codeassembly-content-specification` that the deploy writes every skill frontmatter key other than `supported-harnesses` to every harness unchanged, so a key that only one harness reads, such as Claude's `context` or `model`, reaches the others, which ignore it. (#1979)
- Adds a step to `merge-pr` that offers to close the parent ticket when the merge closed its last open child, and lists any of the parent's own unchecked acceptance criteria beneath the question. (#1980)
- Names `clients/<library>/` in place of `integrations/` in the `williamthorsen-code-layout-preferences` rulebook as the directory for code that talks to a third-party service or library or maps to its data shapes, and directs code that uses a client to a directory named for its domain. (#1982)
- Changes `groom-backlog` to keep an in-progress ticket open without commenting on it or presenting it in a digest when its assessment is a `keep` whose verdicts are all baseline; previously, `groom-backlog` presented every in-progress ticket to the user for a decision. (#1983)
- Counts `partial` progress as baseline for an umbrella ticket, which is a ticket that has open children and whose only unchecked criterion is "Every child is closed", so that `groom-backlog` keeps such a ticket silently when its assessment is a `keep` and its other verdicts are baseline, and does not post a comment when the user decides to keep it. (#1983)
- Adds a `post` field to the result of the `groom-backlog` helper's `comment` command, which states whether the decision's comment is posted and leaves `--out` unwritten when it is `false`, replacing the skill's own check of the verdicts. (#1983)
- Replaces the per-group bulk question and the per-entry decision in `groom-backlog` with one proposed action per digest entry, which the skill applies to the whole page after one confirmation, with overrides named per entry. (#1984)
- Adds the `--close-not-planned <reason>` option to `groom-backlog`, which closes the selected tickets as not planned without assessing them, requires `--scope` or `--older-than`, and lists the tickets in one confirmation before it closes any. (#1984)
- Makes `groom-backlog` apply the edit that `ticket-assessor` drafts for a confirmed `update`, `revise`, or `split`, replacing the rewritten body sections, creating and linking a split's child tickets, and naming the rewritten sections in its comment, and skipping a draft when the ticket changed after its assessment or when the draft would rewrite the Problem, Context, or Proposed solution of an in-progress ticket. (#1984)
- Adds an instruction to the umbrella criterion convention, which `create-ticket`, `design-and-plan`, and `align-ticket-with-implementation` include, to create a child ticket for every planned piece once the split is decided and to defer a piece by closing its child as not planned, so that the criterion "Every child is closed" cannot hold while a planned piece lacks a ticket. (#1987)
- Adds an instruction to the `williamthorsen-workflow-preferences` rulebook to create every iteration's sub-issue when the epic is created. (#1987)
- Directs `assess-ticket` to count the `partial` progress of an umbrella (a ticket that has open children and whose only unchecked criterion is "Every child is closed") as baseline, recognized from the ticket's child counts, and not to offer an update or close action for it. (#1989)
- Adds a test-file length rule to the `testing-conventions` skill, which directs an agent to split a test file by aspect before adding tests that would leave it past the project's `max-lines` setting for test files, or past 500 lines when the lint does not set one, and to move shared fixture builders into a `test-utils/` module beside the tests. (#1991)
- Adds a rule to the `review-criteria` skill that classifies a test file that the change adds to and leaves past that ceiling as a Warning, except in a project whose lint already applies `max-lines` to test files. (#1991)
- Adds the `shared-data-conventions` rulebook, which forbids writes to shared state from unmerged code and requires each expand, migrate, or contract step of a data-shape change to be merged and deployed before the next begins, to the `recommended` collection. (#1992)
- Directs `create-ticket`, `design-and-plan`, and `plan` to scope a ticket or plan that changes the shape of persisted data to one step of that sequence, and bars every planned task and verification check from writing to shared state before merge. (#1992)
- Directs `implement-plan` to treat a step or verification check that writes to shared state from the branch as material divergence, to be reported rather than run even when the plan directs it. (#1992)
- Adds a "Data changes" item to `review-criteria`, which flags a change that removes or renames data still read by deployed code, or that depends on a migration run before merge. (#1992)
- Adds a "Subagent models" section to the Claude harness `CLAUDE.md`, which directs a session to pass `haiku` to a subagent that only searches for files or code, to pass `sonnet` to one that only reads, runs checks, or reports, and to leave the model unset for one that writes code or prose. (#1996)
- Changes the model declared for the `plan-reviser` subagent from `sonnet` to `inherit`, so that the subagent, which rewrites plans, runs on the session's model. (#1996)
- 🚨 **Breaking:** Publishes the `preferences` and `work-types` JSON Schemas in `codeassembly-guidance` as `schemas/preferences.v1.json` and `schemas/work-types.v1.json`, each with an `$id` of the form `https://unpkg.com/codeassembly-guidance@<version>/schemas/<name>.v<N>.json`, so that one `$id` always names the same schema. (#2000)
- Adds the `ticket.pull.excludeLabels` preference, which lists the labels that make a ticket ineligible for `pull-from-backlog`, matches them without regard to case, and defaults to `["status:blocked", "status:on-hold"]`. (#2002)
- Makes `pull-from-backlog` report when the Now milestone has no eligible open tickets left, with a suggestion to close it or plan a new one, and state how many open tickets an excluded label kept off the menu. (#2002)
- Adds a stderr warning from `describe-change.mjs`, issued when preferences load, for each configured `title_format` that loses a token for some record shape, such as a flat `[{scope}|{type}: ]` group that drops the type when the scope is absent or `*`, while the run still renders. (#2006)
- Adds the `supported-harnesses:` rulebook frontmatter field, which restricts the rulebook's ambient region, rulebook skill, and hook fill to the named harnesses under both `sync` and content-root rendering, and makes `sync` retract what it previously deployed to a harness that the rulebook now excludes. (#2009)
- Moves the subagent-model guidance from the Claude harness `CLAUDE.md` into the new ambient rulebook `williamthorsen-subagent-model-preferences`, which declares `claude` as its only supported harness and is added to the `williamthorsen` collection. (#2010)
- Adds a rule to `testing-conventions` that a passing test prints nothing beyond the runner's report, directing each test to capture output that is the behavior, silence output that is incidental, and intercept only the channels that it expects to fire. (#2015)
- Adds a section to `typescript-testing-conventions` that names `silenceConsole` and `listConsoleLines` from `@williamthorsen/toolbelt.vitest/candidate` and `captureStdio` from `@williamthorsen/toolbelt.testing/candidate` for applying that rule, with a `vi.spyOn` or `jest.spyOn` fallback for a project that does not depend on those packages. (#2015)
- Widens the description of `typescript-testing-conventions` from Jest-based projects to Vitest- and Jest-based projects, so that the skill is also selected in a Vitest project. (#2015)
- Adds a "Noisy tests" section to `review-criteria`, which classifies a test that the change adds and that writes output on a passing run as a Suggestion whose proposed change is the interception described in `testing-conventions`. (#2015)
- Makes the builders' write allowance in `prepare-prototype-brief` a default of the output file alone, which the developer's ask can extend to a repository directory that keeps the prototypes or to a dependency install, and directs the agent to state the allowance in the brief's rules of engagement. (#2018)
- Adds an assessment step to `upgrade-dependencies` that checks the working tree for uncommitted manifest or lockfile changes, because the outdated report omits an upgrade already applied there, and that requires verifying those changes through the quality gate before planning new upgrades. (#2019)
- Sets the `@types/node` target in `upgrade-dependencies` to the major of the project's Node floor rather than the latest major listed by the outdated report. (#2019)
- Limits the security fast-track in `upgrade-dependencies` to actionable advisories, and directs the agent to check whether re-resolving a transitive package within its parent's range, or upgrading the direct dependency that pulls it in, resolves the advisory, and to record one without an upstream fix as a known issue in the PR body rather than force a version with an override. (#2019)
- Extends the downstream-support check that `upgrade-dependencies` runs before a major upgrade to shared configs and the plugins that they pull in transitively, and directs holding the upgrade at its ceiling when one of them does not support the new major and a maintained fork does not exist. (#2019)
- Defines a major upgrade together with the code and config adaptations that it requires as one logical change in the commit guidance of `upgrade-dependencies`. (#2019)

### 🪦 Removed

- 🚨 **Breaking:** Removes the skills `orchestrate`, `orchestrate-dev`, `orchestrate-review`, `plan-orchestrable-steps`, and `find-orchestration-savings`, together with the subagents that only those skills dispatched, such as `orchestrated-coder`, `planner`, and the `aspect-*` reviewers. (#1943)
- Removes the `orchestration` block (review rounds, severity thresholds, MCP policy, and per-role model overrides) from the `preferences.yaml` schema, which sets `additionalProperties: false`, so an editor that validates the file now reports an `orchestration` key as unknown. (#1943)
- Removes the parts of the surviving skills that served only engine runs: the `--run-id` argument of `create-devlog`, the `--role` argument and run-artifact path of `plan`, the orchestrated session type of `wrap-up`, the JSON-companion plan format of `refine-plan`, and the reuse of an active run directory by `review-branch`, which now always creates a new `{timestamp}-interactive` run directory. (#1943)
- Removes the post-merge ripple, `groom-backlog --related-to`, which assessed the open tickets related to a merged ticket, along with the offers to run it from `merge-pr`, `wrap-up`, and `pull-from-backlog`. (#1980)

### 🐛 Bug fixes

- Fixes the issue that a next-steps menu could recommend an option by what the session holds, such as a table "already in context": `option-format` now names any pro or con that cites the conversation as one to cut, and `next-steps-after-plan` states that the saved ticket and plan are the complete handoff, with a fact found only in the session added to the artifact instead. (#1939)
- Corrects the context-clearing rationales in `implement-plan`, `next-steps-after-plan`, and `next-steps-after-review` that justified staying in the session by what the session remembers, so that each names the branch's commits and diff, the saved plan, or the saved review as its source. (#1939)
- Fixes the issue that `review-gh-pr` could select a different ticket on each run when a pull request body referenced several issues, by adding a `select-pr-ticket` helper that takes the first `closingIssuesReferences` entry or else the earliest reference in the body outside code. (#1954)
- Fixes the issue that `williamthorsen-collaboration-preferences` did not state when an agent may hand a step to the developer, by adding a "Handoffs" section that directs the agent to perform every step, verification included, and to hand over only the part that it cannot perform, with the reason. (#1956)
- Fixes the issue that `williamthorsen-tooling-preferences` read as licence to hand a sandbox-refused command to the developer, by rewriting the rule to direct the agent to retry the command through the permission gate or to ask once for the grant that clears it. (#1956)
- Fixes the issue that the plan template let a plan name the developer as the actor of a task or verification check: Every step now names the agent, a part that only the developer can perform is written as a `**Residue:**` line with its reason, and `plan-reviewer` and `handoff-reviewer` report a developer-assigned step that lacks one. (#1956)
- Fixes the issue that `implement-plan` turned a plan's developer-assigned verification step into a request for the developer to run it, by revising its steps to direct the agent to run every check itself, through a debug browser where one is provided, and to raise only the ask that a `**Residue:**` line states. (#1956)
- Fixes the issue that the action-items sweep let an agent fill the block with checks and commands that it could resolve itself, by naming those forms in the sweep and directing the agent to run such an item rather than ask it. (#1956)
- Fixes the issue that `summarize-change` headed the `## Details` subsections with labels of the agent's own, such as `🔧 Tooling` for `⚙️ Tooling`, rather than with the headings declared in `work-types.json`. (#1957)
- Fixes the issue that `review-branch` and `review-pr` created a new run directory for every review, so a re-review neither read nor joined the run that holds the earlier review and the author's response. (#1958)
- Fixes the issue that `respond-to-review` could select a run directory written by the retired orchestration engine when it looked for the newest review. (#1958)
- Addresses the issue that commit titles composed with `create-commit` contained backticks, which `title-voice.md` forbids, by directing step 3 of the skill to strip any backticks from the title text. (#1970)
- Fixes the issue that the rulebook's existing rules read as claims about the world rather than as instructions, by opening each with an imperative addressed to the agent. (#1973)
- Fixes the issue that `derive-session-context` returned a cached branch manifest after a preference change, which left `ticket_id`, `ticket_ref`, `artifact_base_dir`, and the other preference-derived fields at their original values until the file was deleted by hand. (#1993)
- Fixes the issue that `resolve-frontmatter.sh` read the manifest file directly and stamped artifacts with a stale `ticket_id` and `ticket_ref`, by taking the manifest from the deriver on every call. (#1993)
- Fixes the issue that `artifact-conventions.md` did not state that a `ticket_ref_prefix` other than `#` is part of `ticket_id` and names the artifact directory, such as `tickets/ABC-100/` for branch `100` under `ABC-`, and that changing the prefix sends later artifacts to a different directory. (#1994)
- Fixes the issue that `ticket-source-resolution.md` told the agent to join a numeric `ticket_id` to a Jira-style prefix read from `.agents/preferences.yaml`, a case that the session-context deriver never produces because it already includes that prefix in `ticket_id`. (#1994)
- Fixes the issue that `resolve-frontmatter.sh` looked for the `derive-session-context` helper in `skills/derive-session-context/`, where `sync` does not deploy it, by making the script search every source namespace under `skills/_sources/` and exit non-zero with the searched path when it finds no match or several. (#1999)
- Fixes the issue that `resolve-frontmatter.sh` reported a missing bundled helper when the path set by `RESOLVE_FRONTMATTER_BUNDLE_PATH` was not readable. (#1999)
- Fixes the issue that `pull-from-backlog` offered shelved tickets as candidates and counted them when choosing the Now milestone, which could produce a Now set made up only of shelved work. (#2002)
- Fixes the issue that `pull-from-backlog` showed a short or empty menu when the Now milestone held fewer eligible tickets than the menu limit, by filling the remaining slots with the highest-ranked eligible tickets from outside Now and marking each one `(outside Now)`. (#2002)
- Fixes the issue that `entry-drafter` and `title-voice.md` stated their doctrine in figures forbidden by the plain-speech rule, such as "earns its place", "the count is the tell", and "a ceiling, not a target", by replacing each with a literal statement. (#2005)
- Fixes the issue that `prepare-prototype-brief` stated its instructions as aphorisms and agentless statements, such as "Settled intent stays settled", rather than as imperatives that name the action. (#2018)
- Fixes the issue that `entry-drafter` and `summarize-change` stated that the lede reaches the changelog and the release notes, which `release-kit` renders from the change entries without the lede. (#2023)

### ⚡ Performance

- Declares `context: fork`, `model: sonnet`, and `background: false` on `create-commit`, so that Claude runs each commit in a fresh Sonnet subagent and waits for it, instead of running every commit step against the invoking session's whole context on the session's model. (#1979)

### 🏗️ Internal features

- Replaces the `create` subcommand of `resolve-review-run.mjs` with `open`, which returns the ticket's active run and creates a `{timestamp}-interactive` run directory only when the ticket directory does not contain one. (#1958)

### ♻️ Refactoring

- Moves review run-directory creation and lookup from the `review-branch` and `respond-to-review` instructions into the `resolve-review-run` helper so that every run follows one procedure, which selects the newest run and review by the timestamps in their names. (#1953)
- Replaces the inline `ENOENT` checks in `run-core`'s `resolve-base-dir.ts` and in `read-dir-entries.ts` and `list-markdown-files.ts` under `packages/guidance/content/test-utils/` with each package's existing `isEnoent`, and removes the private copy of the guard from the test utilities. (#2004)
- Moves `describe-change`, `capture-lede-decision`, and the work-types reader onto `@williamthorsen/change-grammar` and deletes the local engine in `packages/guidance/src/change-grammar/`, together with its release-kit parity test and its ESLint boundary rules. (#2007)

### 🧪 Tests

- Replaces the hand-rolled `process.stderr` spies and the console output rebuilt from spy call records in the repo's tests with `captureStdio` from `@williamthorsen/toolbelt.testing`, which restores the stream when the test scope exits and buffers console output into `stdout` and `stderr`. (#2003)

### ⚙️ Tooling

- Makes the `guidance` build generate `content/skills/_data/work-types.json` from the package's `CANONICAL_TAXONOMY`, and makes `check:content` fail when the committed copy differs from the generated one. (#2007)

### 🤖 Agentic support

- Adds a "Model declarations" section to the `codeassembly-repo-conventions` rulebook, which permits a skill to declare `model` only together with `context: fork` and limits every declared model to a Claude Code alias or a full `claude-` model ID, and adds `model-declarations.unit.test.ts`, which fails on a declaration that breaks either rule. (#1996)

### 📚 Documentation

- Adds `docs/schemas.md` to `codeassembly-guidance`, which lists the published schemas with their import paths and states which schema changes bump a schema's major version. (#2000)
- Changes the example template in `packages/guidance/docs/preferences.md` to the nested `[[{scope}|]{type}: ]` form, so that the example output for a change without a scope keeps the type. (#2006)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
