# Changelog

All notable changes to this project will be documented in this file.

## 0.2.0 — 2026-10-23

### 🎉 Features

- Replaces the list of ideas to adopt in the `comparison` artifact written by `prepare-prototype-brief` with an idea table that lists every distinctive idea of the round, those of rejected and losing prototypes included, with the prototypes that have it and the requirement that it answers. (#2027)
- Adds a step to `prepare-prototype-brief`, reached also from the verdict read-back of `index-prototypes`, which takes the developer through a keep, adapt, defer, or drop decision on each row of the idea table, accepts new ideas that the developer states while judging, and saves the result as a ticket-level `idea-decisions` artifact. (#2027)
- Requires, in the product-development stages of the `williamthorsen-workflow-preferences` rulebook, a decision on every prototype idea before the end vision, which cites the `idea-decisions` artifact, and a record of each decision in the design doc. (#2027)
- Adds a `number` to each `index-prototypes` manifest entry, assigned at a slug's first registration and kept by its later versions, and leads each index card title and the winner summary with it, as in "3. Catalog first". (#2030)
- Numbers a manifest written before this change in order of each slug's first registration when it is read, and writes those numbers to it at the next registration. (#2030)
- Updates `index-prototypes` and `prepare-prototype-brief` to name each prototype to the developer as `{number}. {title}` in reports, the comparison, the idea table, and the idea decisions, and to accept a bare number as a reference to a prototype, asking when no prototype has that number. (#2030)
- Adds the `ui-copy-conventions` rulebook, delivered as the `consult-ui-copy-conventions` skill, which sets rules for labels, buttons, helper text, errors, register, and case, and a copy budget for each page, and which defers to a project's own content guidelines where the two conflict. (#2032)
- Adds `ui-copy-conventions` to the `recommended` collection, and directs plans to name its copy rules and copy budget in the key decisions of any task that writes interface text or builds a page, a prototype, or a UI component. (#2032)
- Changes `prepare-prototype-brief` to forbid builders from quoting the brief into the page, to require the demo chrome inside an element marked `data-demo`, and to judge each prototype's product copy against `ui-copy-conventions`. (#2032)
- Adds the `copy-probe` command to the `index-prototypes` helper, which prints a function for the Playwright MCP's `browser_evaluate` that lists a page's strings of four or more words and skips everything inside `data-demo`. (#2032)
- Adds the `index-prototypes describe-set` command, which reads a set summary (`shared`, `changes`, `try`) from a JSON file into the manifest; the index page shows that summary below its title, with `try` as a numbered list. (#2034)
- Adds a repeatable `--note "<label>: <value>"` flag to `index-prototypes register`, which stores each note on the prototype's entry and shows the notes on its card as a definition list in the order given. (#2034)
- Directs the agent in the `index-prototypes` and `prepare-prototype-brief` skills to choose one list of note labels for the set, to collect a value for each label from every builder, and to write the set summary in a new "Describe the set" step each round. (#2034)
- Adds drafted titles to `groom-backlog`, which shows a replacement title from the `ticket-assessor` subagent in the digest, applies it with `gh issue edit --title`, and lists "Title" among the parts that the ticket comment reports as revised. (#2038)
- Adds the `project.maturity` (`hobby`, `early`, `production`), `project.sensitivity` (`low`, `personal`, `confidential`), and `project.audience` (`owner`, `team`, `public`) keys to `.agents/preferences.yaml`, which `derive-session-context` reports as `project_maturity`, `project_sensitivity`, and `project_audience`, or as `null` for a key that the project file does not declare. (#2044)
- Directs `design-and-plan` and `plan` to treat the declared project stage as the premise of every security, availability, and infrastructure decision, to add machinery beyond that stage only for a named asset or need, and to ask for each undeclared value and then declare it in the project's preferences file. (#2044)
- Adds the project's declared stage to the design-doc contents that the `williamthorsen-workflow-preferences` rulebook lists for a product's end vision. (#2044)
- Adds the `check-preferences.mjs` script, which validates a preferences file against the bundled schema, prints its findings as JSON, and exits 1 on an invalid value or a missing required key, reporting an unrecognized key as a warning that names the nearest known key. (#2044)
- Adds the `refine-prototype` skill, which applies the developer's commands to one prototype page with the development gates off, carries the round's kept and adapted ideas onto it, snapshots each accepted version into the ticket's prototype set, and records every accepted change in a `refinement-log` artifact that the end vision reads. (#2040)
- Gives each prototype version an id, `{number}.{version}`, that leads the index card and the first line of the page's `data-demo` band, with a `resolve-ids` command on the `index-prototypes` helper that resolves the ids before the prototypes are built and a `--number` flag on `register` that refuses a registration whose number disagrees with the manifest. (#2040)
- Adds the `assess-usability` skill, available on the Claude harness only, which dispatches a `usability-assessor` subagent for each of three to five lenses in turn and merges their reports into a `usability-findings` artifact that ranks the findings by effect and reach and that `triage-spike-findings` takes as input. (#2045)
- Adds the `triage-spike-findings` skill, which grades the confidence and value of every item that a findings artifact leaves undisposed, has the new `disposition-challenger` subagent argue against each grade, and then creates the `confidence:`- and `value:`-labelled child tickets under an umbrella ticket and posts every disposition on the triage ticket, on GitHub repositories that have both label families. (#2049)
- Adds a `--label` argument to `create-ticket`, which applies the given labels on GitHub in addition to the resolved scope and type labels and reports them as skipped on Jira. (#2049)
- Stops `create-ticket` from asking for confirmation of a relationship supplied through `--parent`, `--blocked-by`, or `--blocking`, and lists that relationship in the completion output. (#2049)
- Adds the `check-site --target <url-or-host>` subcommand to `manage-jira-ticket.mjs`, which prints `acli`'s active site and the ticket's site as JSON and, when they differ, exits non-zero and names the `acli jira auth switch` command that makes the ticket's site active. (#2052)
- Adds the `jira-clients` guidance hook to `update-jira-ticket`, through which a machine adds its own Jira client, with the sites that it reaches and its rank, to the clients that the Jira skills read and create through. (#2052)
- Adds an "External programs" section to the `testing-conventions` skill, which directs that code reach git or another external program through an adapter received as a dependency, that tests of that code pass a fake adapter, and that only the adapter's own test run the real program. (#2055)
- Adds an "External programs" section to the `typescript-testing-conventions` skill, with an example of an adapter type, a real adapter used as a parameter default, and a test that passes an object literal as the fake, and states a preference for that parameter over `vi.mock`. (#2055)
- Rewrites the description of the `testing-conventions` skill to name how a test reaches git and other external programs, and to direct agents to consult the skill before writing or changing a test. (#2055)
- Move kb's git calls behind an injectable adapter (#2077)

  Adds an optional `git` parameter to `check`, `enumerateNotes`, and `enumerateNotePaths` in `@williamthorsen/kb/check`, which takes a `KbGit` adapter so that a consumer's tests can run these functions without a real git repository. The change also routes every git call inside kb through one such adapter and replaces the repositories that kb's tests built with a fake adapter.

- Changes the next-steps menus of the planning, implementation, and review skills to name each skill in the harness's own invocation syntax, such as `/refine-plan` on Claude Code and `!refine-plan` on Rovo, so that a user can paste an option line without retyping it. (#2084)
- Adds a "Where a test goes" section to the `testing-conventions` skill, which directs each case to the cheapest tier that can observe it, limits an expensive tier (one that spawns a process, starts a runtime, or builds a full fixture) to one smoke example per entry or verb, and requires a change to delete the higher-tier examples that its cheaper coverage supersedes and to justify each expensive-tier example that it adds. (#2086)
- Adds a "Test placement" section to the `review-criteria` skill, which classes as a Warning an added expensive-tier example that a cheaper tier could observe, and also a higher-tier suite that the change superseded but kept. (#2086)
- Changes the test criterion in `ticket-criteria-conventions` and `plan-template` to ask for coverage at the cheapest tier that observes the behavior, rather than for coverage by tests alone. (#2086)
- Changes the `accessibility-conventions` and `shared-data-conventions` rulebooks to `skill` delivery alone, so that they no longer appear in every session's guidance file and are reached through `consult-accessibility-conventions` and `consult-shared-data-conventions`, and adds an "Interfaces" criterion to `review-criteria` that points a review of colour tokens, text styles, pages, or UI components to `accessibility-conventions`. (#2087)
- Adds an "Always-loaded context" section to `review-criteria`, which classifies a change as a Warning when it makes a rulebook ambient or grows an `AGENTS.md`, a `CLAUDE.md`, or another file loaded at session start, unless nearly every session needs the content. (#2087)
- Updates `codeassembly-content-specification` to version 30, which states that `delivery` is required and that `ambient` fits only content that nearly every session needs. (#2087)
- Adds a rule to `prepare-prototype-brief` that directs the brief's author to describe an audience-facing view by what the audience sees, and adds a line to the brief check that has the author rewrite phrases such as "mystery" and "unknown to" without the withheld information. (#2089)
- Makes `create-gh-pr` assign each pull request that it creates to the authenticated `gh` user, record the applied assignee in the `pull-request` artifact, and report the assignee as skipped when GitHub does not apply it. (#2090)
- Adds setup rules to the `testing-conventions` skill that count a database engine as an expensive tier, call for the cheapest setup that fits the time budget, keep setup cost independent of the number of test files, and reject a raised hook timeout as a fix. (#2092)
- Adds a "Code that uses a database" section to the `testing-conventions` skill, which limits database tests to code whose subject is SQL, directs logic that only passes through SQL to a fake client or a mocked module boundary, and rules out a test per constraint. (#2092)
- Adds four Warnings to the `review-criteria` skill for database and setup defects in tests that the change adds, splits, or modifies, and changes the split that it proposes for a grown test file to share the file's expensive setup first. (#2092)
- Adds the `cli-conventions` rulebook, delivered as the `consult-cli-conventions` skill, which states that a CLI printing a doc as a help topic renders a link to another topic as the `<bin> help <topic>` command, renders any other link as its absolute URL, and accepts the doc's file stem as a name for the topic. (#2093)
- Adds `cli-conventions` to the `recommended` collection, so that a project declaring that collection receives the rulebook. (#2093)
- Adds `--repo OWNER/REPO` to `/create-ticket`, which files the ticket in that GitHub repository and resolves its title format, reference prefix, scope, and labels from the configuration on that repository's default branch. (#2094)
- Adds `--project-root <dir>` to `describe-change render-titles` and `resolve-labels`, which then read `.agents/preferences.yaml` and `.meta/label-map.json` from that directory in place of the invoking repository's root. (#2094)
- Makes `describe-change resolve-labels` warn on stderr about each type or scope that a configured label map does not define, where it previously omitted the label without a message. (#2094)
- Adds a `medium` input to `assess-usability`. When set to `cli`, each `usability-assessor` lens runs the built binary in its own scratch git repository and saves text transcripts as evidence, and the styling-and-access lens is replaced by an output-and-access lens that checks `NO_COLOR`, piped output, 80-column width, and help and error text. (#2095)
- Orders the `ticket` items of `triage-spike-findings` by value, then confidence, with record order breaking ties, when the skill creates the child tickets and when it lists them in the checkpoint table, the dispositions comment, and the report, so that the children's issue numbers follow that order. (#2096)
- Adds a rule to the "Technical recommendations" guidance that directs an agent to name the best-practice solutions to a design problem and the conditions under which each one fits before it weighs options, to label an option that departs from all of them as non-standard with the reason that none fits, and to recommend revising an existing API rather than an addition that works around its contract. (#2098)
- Includes the "Technical recommendations" guidance in the `ticket-assessor` subagent, which validates a ticket's proposed approach. (#2098)
- Extends the `cli-conventions` rulebook from help topics to the whole interface of a command-line tool in any language, adding rules for `--help` on every command and subcommand, an exit-code table, error messages that name the fix, and step and outcome reports for commands that change state. (#2099)
- Reduces the `shell-conventions` rulebook to how a bash script implements the `cli-conventions` rules, and changes its `show_usage` template to write requested help to stdout and to exit 2 on an unknown command. (#2099)
- Adds a "DOM environment" section to the `typescript-testing-conventions` skill, which directs a TypeScript test that renders into a DOM to run under happy-dom and allows jsdom only at an opt-in whose comment names the behavior that happy-dom lacks. (#2101)
- Adds the `codeassembly-validate-preferences` bin to `codeassembly-guidance`, which validates each named preferences file against the bundled schema without network access, reports a missing or unparsable file as an error, prints text or one JSON object per file under `--json`, and treats warnings such as an unrecognized key as failures under `--strict`. (#2103)
- Renames the deployed `check-preferences.mjs` helper to `validate-preferences.mjs` and gives it the bin's behavior: several files per run, text output by default, and the `--json`, `--strict`, and `--help` options. (#2103)
- Directs the agent, in the `williamthorsen-collaboration-preferences` rulebook and the option-format rule, to start each line that states a decision awaiting the checkpoint with ⏳, in a turn's narrative as well as in the plan and spike templates' `## Decisions taken` section, where the marker replaces the `(provisional)` parenthetical. (#2104)
- Extends `triage-spike-findings` to have the agent decide the blockers of each ticket that it creates, create every blocker before the tickets that it blocks, link them through `create-ticket --blocked-by`, and list them in a "Blocked by" column of the dispositions comment. (#2105)
- Adds to `williamthorsen-ticketing-preferences` a rule to record a blocker whenever there is some probability that one ticket affects another and should land first, including when one ticket's design takes another ticket's outcome as an input. (#2105)
- Adds a directive to the "Handoffs" section of `williamthorsen-collaboration-preferences` that tells the agent to hand over a check of more than one command as one paste-ready script, which cleans up after itself and prints only the facts that the agent needs, and to confirm which machine its commands run on, such as by comparing `hostname`, before it runs or hands over a check of a GUI application. (#2106)
- Adds to `accessibility-conventions` the states that every clickable element shows (a pointer cursor, a hover change, and a focus indicator that meets 3:1 non-text contrast), and requires a browser check of each change to a visible component, with a report that the check did not run when a browser is unavailable. (#2109)
- Directs `implement-plan` to run that browser check for any change to a visible component, whether or not the plan lists it, and to report what the check found, and adds the interaction states and the check to the plan template's interface guidance. (#2109)
- Directs `review-criteria` to check each new or changed interactive element in a browser rather than by reading the diff alone, and adds the outcome of that check to the technical assessment in both `review-branch` report templates. (#2109)
- Makes `design-and-plan`, `plan`, and `refine-plan` report each open blocker of the resolved GitHub or Jira ticket by reference and title, and then continue. (#2113)
- Makes `implement-plan` ask the user to confirm before it starts the first task when the governing ticket has an open blocker. (#2113)
- Extends the blocker check to a ticket artifact, which the skills check against the remote ticket named by its `ticket_ref` frontmatter. (#2113)
- Lets `refine-plan` resolve a Jira ticket by URL or key through the Jira clients that the ticket source resolution ranks, where it previously fetched a Jira URL as a web page. (#2113)
- Adds a rule to `williamthorsen-tooling-preferences` that directs an agent to log into a local instance of the app under work without asking the developer, and to set a development credential in an untracked local config file when the app needs one, which the rulebook does not count as minting a credential. (#2115)
- Limits the login that the handoff ladder in `williamthorsen-collaboration-preferences` names among the resources that an agent asks the developer to supply to a login to a remote service, which excludes an app's local development login. (#2115)
- Adds a step to `design-and-plan`, `plan`, `refine-plan`, and `implement-plan` that checks the branch against the remote's default branch before the work starts, fast-forwarding a branch that lacks commits and uncommitted changes of its own and otherwise listing the gained commits and asking whether to bring them in. (#2119)
- Adds the `check-branch-currency.mjs` script, which fetches the remote's default branch and reports as JSON how far the checked-out branch is behind and ahead of it, whether its tree is clean, and which gained commits touch the paths passed with `--path`. (#2119)
- Adds an "Authorship" section to the shared `AGENTS.md`, which states that a creator, reporter, or author field shows the account that made an item rather than who wrote it, and forbids inferring from that field that the developer wrote the item. (#2120)
- Changes `ticket-evaluation.md` to tell the agent to treat a ticket's content as unsourced, whichever account created the ticket, until the agent traces the content to a source. (#2120)
- Adds a "Subcommand names" section to the `cli-conventions` rulebook, which requires a subcommand that acts to name its action and its object, prescribes a flat verb-object name such as `show-instance-page` while the object has one action and a noun group such as `instance-page show` once it has several, and rejects an existing name that breaks these rules as precedent. (#2121)
- Makes `kb-curate` report `missing-destination` when `--kb` is absent and no `.kb/` is discoverable, and `no-default` when `--kb @default` is given without a configured `default_kb`, where both cases previously returned `no-kb-resolvable`. (#2122)
- Makes `kb-edit` report a note outside any discoverable `.kb/` as `missing-destination` instead of `no-kb-resolvable`, the code that `kb-add` uses for the same condition. (#2122)
- Rewrites the `.editorconfig` bullet in the shared "Style" guidance to direct agents to follow `.editorconfig` and to fill new comments to the `max_line_length` that it sets. (#2123)
- Adds rules to `cli-conventions`, each with an example, on when a behavior is a subcommand rather than an option, standard option names such as `--config`, `--dry-run`, and `--write`, the order in which settings resolve, which commands write by default, `--json` output, color, error messages that suggest the nearest valid name and never take a secret as an argument, and keeping a command's logic apart from its presentation. (#2134)
- Changes the exit code that `cli-conventions` assigns to a usage error, such as bad input or an unknown command or option, from 1 to 2, and adds exit code 1 for a check that ran and found problems. (#2134)
- Changes the default exit code of the `show_usage` template in `shell-conventions` from 1 to 2, so that a bare `show_usage` call covers every usage error, including an unknown command. (#2134)
- Makes `select-lede-exemplars.mjs` act on the breaking marker, which it previously discarded: An unmarked request no longer returns a breaking record, and a request marked by a `!` on `--type` returns breaking records before non-breaking ones within each widening step. (#2136)
- Adds a `--breaking` flag to `select-lede-exemplars.mjs`, which marks a `--type` or `--tier` request as breaking, and adds a `breaking` field to the JSON output, which reports whether the request was marked. (#2136)
- Changes the `entry-drafter` subagent to request exemplars once per pair of work type and breaking marker, passing `--breaking` for a breaking entry, rather than once per work type. (#2136)
- Defines the members of the `triage` collection with `'@unclaimed'`, so that `codeassembly` deploys a newly added library artifact through `triage` until the artifact is promoted to another collection or declares `standalone:`. (#2137)
- Adds the `overused-word` rule to the `revise-prose` sweep, which reports one candidate per sentence that contains a word from the plain-speech calibration's "Words to look for" list or an inflection of one, lists the matched words, and leaves `prose-reviser` to repair the site or reject a use in a sense that the list keeps. (#2139)
- Adds the `check-prose.mjs` script, which runs every `revise-prose` detector over one Markdown file at any path without reading or writing the sweep record, and exits 1 when it reports candidates and 2 when it cannot read the file. (#2141)
- Adds a writing-rules check to step 6 of `summarize-change`, which runs `check-prose.mjs` over the lede, each entry's `text` and `migration`, and the "Why" section, and directs the session to redispatch the `entry-drafter` with the new `writing-rule` rejection code for a confirmed violation in a drafted passage. (#2141)
- Extends `revise-comments` to add a missing description to each function, method, class, and component, test helpers included, and to rewrite a description that misstates its code, with an instruction to ask the user first when the code rather than the description could be wrong. (#2146)
- Adds a "Test data" section to the `testing-conventions` skill, which requires each test to use the smallest data that proves its behavior and requires code that reads data from a module-level singleton to take it as a parameter or from a context whose default is the real value. (#2167)
- Extends the "Fix the design, not the timeout" rule in `testing-conventions` from a hook's timeout to a test's and a tier's timeout, set in a test or in config, and permits a raise only when smaller data, injection, and shared setup do not apply and the plan or the pull-request description states why. (#2167)
- Adds a Warning to `review-criteria` for a raised hook, test, or tier timeout, which a stated reason does not exempt, and a Warning for a test that renders or builds production-scale data, replacing the narrower "A raised hook timeout" item. (#2167)

### 🐛 Bug fixes

- Fixes the issue that `summarize-change` reported a branch's own steps and a ticket's backstory as what the change did, by having the `entry-drafter` subagent and the summary's audit accept only the diff against the default branch as evidence of what changed. (#2029)
- Fixes the issue that the `## Why` section of a `summarize-change` summary retold how the need for a change arose, by defining that section as the purpose that the change serves. (#2029)
- Fixes the issue that `entry-drafter` wrote where code or values were copied from, or why the work is split across pull requests, into the lede and the entries, including when a ticket's `## Problem` section stated it. (#2031)
- Fixes the issue that `summarize-change` accepted how the work is staged across pull requests as the purpose stated in a change summary's `## Why` section. (#2031)
- Fixes the issue that `groom-backlog collect` selected a ticket again when its only update was the decision that the sweep itself had applied, because GitHub records that update a moment after the sweep's comment. (#2038)
- Fixes the issue that `create-ticket` and `design-and-plan`'s Jira write did not direct the agent to flatten task-list syntax before submitting through a Markdown or HTML Jira client, which Jira stores as bullets reading `\[ \]`, on any deployment without `update-jira-ticket`. (#2050)
- Fixes the issue that `manage-jira-ticket.mjs create` created a Jira work item on `acli`'s active site when that site differed from the host of `ticket.base_url`, and makes it exit with the fallback `wrong-site` or `site-unreadable` without writing to Jira, reading `ticket.base_url` from the repository's preferences or the global file. (#2052)
- Fixes the issue that ticket resolution, `update-jira-ticket`, and `create-ticket` reported a Jira ticket on another site as missing, by directing each to run `manage-jira-ticket.mjs check-site` before calling `acli` and to report the wrong site and the `acli jira auth switch` command instead. (#2052)
- Fixes the issue that the `live-worktree-policy` rulebook named the removed `list-repos --tag live` command for listing the repos tagged `live`, and replaces it with `thor-repo list --tag live`. (#2053)
- Fixes the issue that a `summarize-change` redispatch did not send `entry-drafter` the type corrected by the audit, which left the drafter to rewrite the entry in the form of the old type. (#2058)
- Fixes the issue that the artifact guidance never stated what the artifact directory is for, by stating that it is the developer's audit trail rather than a source of truth, directing durable instructions to the repository or to a skill or rulebook, and telling the agent to verify what a search of artifacts returns against the repository, the tickets, and the pull requests. (#2070)
- Fixes the issue that `williamthorsen-workflow-preferences` did not say that the branch and worktree for a ticket's work are settled, which left agents asking the developer which one to use. (#2082)
- Fixes the issue that `design-and-plan` ended a session that split a ticket without a launch prompt for each resulting ticket, and that its `Next action` menu could offer to implement an umbrella's child in the umbrella's worktree. (#2083)
- Fixes the issue that the `triage-spike-findings` helper's `check-labels` command crashed with "e is not a function" instead of running `gh label list`, which stopped the skill before triage began. (#2085)
- Fixes the issue that `williamthorsen-collaboration-preferences` and the `action-items` and `option-format` partials stated many directives in the indicative, which hid whether the agent was to act, by restating them as imperatives addressed to the agent. (#2106)
- Documents in the `kb-add` skill the `readonly-kb` error code, which its helper already returned, and tells the agent to have the user choose a writable KB. (#2122)
- Fixes the issue that the rulebooks, skills, subagents, and partials in `codeassembly-guidance` contained sentences that the library's own current writing rules flag, such as figurative verbs, "no" used as a determiner, and reduced object relatives, and keeps each rulebook's `version` because the repairs do not change what it asks. (#2130)
- Fixes the issue that messages printed by `describe-change`, `index-prototypes`, `resolve-review-run`, `revise-prose`, and `triage-spike-findings` broke the writing rules, for example by saying `no manifest in` a directory rather than that the directory does not contain a manifest, and keeps each message's error code. (#2132)
- Fixes the issue that the artifact conventions told agents to run `export-ai-artifacts.sh`, which has been deleted, and called a git-ignored `base_dir` the default when the documented default is `~/ai-artifacts`. (#2135)
- Fixes the issue that `revise-prose` reported a file as swept after its prose was edited, by recording a hash of each file's extracted prose in `.agents/revise-prose.yaml` and reporting the file as unswept when the current hash differs. (#2143)
- Fixes the issue that the leader check in the option-format contract and the `williamthorsen-collaboration-preferences` rulebook did not cover gated decisions, and adds a first step that searches each alternative for a disqualifying cost, including one that follows from the work's constraints and acceptance criteria. (#2145)

### ⚡ Performance

- Shortens the `index-prototypes` skill by 675 bytes, cutting explanations that a neighboring sentence restated, and leaves its behavior unchanged. (#2040)

### 🏗️ Internal features

- Replaces the per-CLI entry-point checks in the helper CLIs, `derive-session-context`'s `isMain` among them, with one shared `isEntryPoint(moduleUrl, programName)`, which writes a warning to stderr naming the program and returns `true` when it cannot resolve the real paths, so that a helper CLI invoked through a stale link runs instead of doing nothing. (#2144)

### ♻️ Refactoring

- Moves every git invocation in the streamline-guidance helper into the `StreamlineGit` adapter in `git.ts`, which the `runCheck`, `runRecord`, `runResolve`, and `runCommand` entry points take as a parameter that defaults to the real adapter. (#2069)
- Adds the `SharedGit` adapter in `packages/guidance/src/shared/git.ts` and routes the shared helpers' and `derive-session-context`'s git calls through it, which lets the helpers' tests and the CLI tests of `derive-session-context`, `capture-event`, and `capture-lede-decision` use the fake adapter from `makeFakeGit` and move from the `tool` tier to the `unit` tier. (#2072)
- Moves the `describe-change` helper's git calls (the commit-existence check, the commit listing, and the working-tree root lookup) into a `DescribeChangeGit` adapter in `describe-change/git.ts`, which `runDescribe` reads from an optional `DescribeInput.git` that defaults to the adapter that runs git. (#2073)
- Routes the git queries of the `revise-prose`, `groom-backlog`, and `pull-from-backlog` helpers through typed git adapters and narrows `CommandRunner` to `gh`, which lets those helpers' in-progress, ledger-path, file-listing, and CLI tests run in the unit tier against a fake adapter rather than against real repositories. (#2075)
- Derives the KB-resolution error codes and messages of `kb-add`, `kb-curate`, and `kb-edit` from one shared resolver and formatter in `kb-shared`, with a discovery-only resolver for `kb-edit`. (#2122)
- Restructures code across the packages and the catwalk demo to satisfy the new `unicorn` rules, mostly by turning trailing `if` blocks into early returns and `continue` guards, and adds `ESNext.Array` to the root `tsconfig.json` `lib` so that `Array.fromAsync` typechecks. (#2152)
- Converts property accesses on index signatures to bracket notation in every package, as `noPropertyAccessFromIndexSignature` requires. (#2153)
- Splits the `describe-change` and `revise-prose` source files that exceeded the `max-lines` ceiling into modules by concern, such as argument parsing, merge-message composition, record parsing, prose extraction, and the object-relative detector's word lists and head analysis. (#2164)
- Splits `groom-backlog/cli.ts`, `index-prototypes/cli.ts`, `kb-edit/cli.ts`, and `streamline-guidance/resolve.ts` into modules for argument parsing, subcommand runners, and their other separate concerns, which brings each file under the `max-lines` ceiling and leaves the helpers' behavior as it was. (#2165)

### 🧪 Tests

- Runs the streamline-guidance `resolve`, `check`, `record`, and working-tree listing tests against a fake git adapter in the unit tier, leaving `git.tool.test.ts` and the bundle smoke test as the only ones that build real repositories. (#2069)
- Moves the in-process CLI tests and the commit-reading tests of `describe-change` to the unit tier on a fake git adapter, `make-fake-git`, and keeps real repositories only for the adapter's own tests and the bundle smoke test. (#2073)
- Adds `ambient-delivery-pins.unit.test.ts`, which fails when a library rulebook declares `ambient` delivery without an entry in `AMBIENT_PINS` stating why nearly every session needs it. (#2087)
- Moves the `factory` DOM tests and the `index-prototypes` page-script tests in `guidance` from jsdom to happy-dom, and removes the `ResizeObserver` stub that the `factory` setup file installed for jsdom. (#2101)
- Rewords the test titles, assertion messages, and comments in the `codeassembly-guidance` content tests against the current writing rules, and re-pins the body hashes in `rulebook-version-pins.unit.test.ts` to the reworded rulebooks. (#2130)
- Splits the oversized test files of both helpers by subcommand or aspect, and moves the fixtures shared by several of the new files into `test-utils`. (#2164)
- Splits the CLI tests of `capture-event`, `groom-backlog`, `kb-add`, and `kb-edit` by subcommand or aspect, moves their shared fixtures into each helper's `test-utils`, and runs the in-process `kb-add` cases under the unit tier instead of the tool tier, which leaves `cli.tool.test.ts` with only the subprocess smoke test. (#2165)

### ⚙️ Tooling

- Makes `install-launchers.sh` exit 2 on a usage error and print requested help to stdout rather than stderr. (#2134)
- Deletes the `extract-plugin-skills.sh` script, which failed on every run because it sourced a `functions/colors.sh` file that the repository does not contain. (#2134)

### 📦 Dependencies

- Replaces `jsdom` 30.1.1 with `happy-dom` 21.0.1 in the workspace catalog and the `factory` and `guidance` manifests, drops `@types/jsdom`, and prunes the jsdom package tree from `pnpm-lock.yaml`. (#2101)
- Applies patch and minor upgrades to the root and `factory` dependencies, among them `react` and `react-dom` 19.3.1, `zod` 4.6.7, and pnpm 12.13.0, and rebuilds the `guidance` helper bundles that bundle `zod`. (#2163)

### 🤖 Agentic support

- Sweep kb, run-core, and root files against the current writing rules (#2127)

  Repairs prose in `packages/kb`, `packages/run-core`, and the repository files outside `packages/` against the current versions of the writing rules, covering READMEs, design docs, code comments, test titles, and the repository's agent guidance.

### 📚 Documentation

- Revise the agents package's prose against the current writing rules (#2128)

  Revises the comments, docs, test names, and printed messages of `packages/agents` against the current writing rules, which completes the `revise-prose` sweep of the package. The CLI's warnings now say that a guidance template or a script "is provided by more than one content root" instead of "is shipped by more than one content root".

- Rewrites the comments, test titles, `README.md`, and `docs/` helper guides of `packages/guidance` to follow the current writing rules. (#2132)

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
- 🚨 **Breaking:** Remove the codeassembly-mcp server (#1945)

  Removes the `codeassembly-mcp` server and its `codeassembly` registration in `.claude/settings.json`, because its five run-management tools served only the orchestration engine, which has been retired. Keeps the v3 run format in `codeassembly-run-core` as a read-only format, so that existing v3 runs stay readable after the removal of the only tool that wrote them.

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
