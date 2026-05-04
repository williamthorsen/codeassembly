# Changelog

All notable changes to this project will be documented in this file.

## [agents-v0.2.0] - 2026-05-04

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

- Install \_data support files and filter dotfiles (#347)

  The install command now deploys the `skills/_data/` support directory alongside skill directories, and filters dotfiles (`.DS_Store`, etc.) from both the install and build pipelines. Previously, all underscore-prefixed directories were skipped during installation, which prevented 20+ skills from accessing their referenced data files.

- Replace symlinks before writing generated files

  When `prompts.yml` or subagent files exist as symlinks (e.g., from an older dotfiles-managed setup), writeFile follows the symlink and writes into the dotfiles repo, making its working tree dirty.

  Add `unlinkIfSymlink` helper and call it before writing `prompts.yml` and merged subagent files so they become real files at the target path.

- Fix broken \_data/ relative paths in skill files (#352)

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

## [agents-v0.1.0] - 2026-03-01

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

<!-- generated by git-cliff -->
