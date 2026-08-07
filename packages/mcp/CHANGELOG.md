# Changelog

All notable changes to this project will be documented in this file.

## 0.2.4 — 2026-08-07

### ♻️ Refactoring

- Retire fleet's lint deferrals (#1211)

  Fixes deferred lint violations in the `fleet` package and restores the severity of the associated rules to "error" when a strict-lint check is run.

### ⚙️ Tooling

- Retire mcp's lint deferrals and prune the dead root entries (#1205)

  Fixes deferred lint violations in the MCP package and restores the severity of the associated rules to "error" when a strict-lint check is run.

## 0.2.3 — 2026-08-05

### 🧪 Tests

- Name every test file's isolation tier (#1185)

  Every test file now embeds the name of its tier (unit or tool), each of which can be run separately (`nmr test:unit` or `nmr test:tool`). Git isolation settings that had previously been removed from the root-level test configurations are now restored.

## 0.2.2 — 2026-08-04

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

## 0.2.1 — 2026-07-18

### ⚙️ Tooling

- Exclude generated files from Prettier formatting
- Migrate build to nmr-compile and give mcp an entry point (#1001)

  Building the monorepo's TypeScript packages is now a single compile step that emits both JavaScript and type declarations, so the separate typings pass and a repo-local build script are both gone. When the MCP server is started before the build has run, it now reports that the build output is missing instead of failing with a cryptic module-resolution error, and when a package's command-line tool fails to start, it now reports the real cause instead of always advising a rebuild.

## 0.2.0 — 2026-05-04

### 🎉 Features

- Migrate orchestrator to MCP and v3 events (#133)

  Rewrite orchestrate SKILL.md and review-cycle module to drive run state via MCP tool calls (init_run, emit_event, register_artifact, complete_run, get_run_state) instead of direct JSON file reads/writes. Replace all run-index.json state writes with emit_event calls, replace artifact array management with register_artifact calls, and replace final status write with complete_run.

  Add get_run_state calls at 5 decision points in the review cycle for cumulative state decisions with MCP-unavailable fallback. Formalize strict subagent return contracts across all 7 subagent files — omitting fields or unrecognized values now cause phase failure with no fallback parsing. Add v3 event-sourced format specification to artifact-conventions.md documenting all 13 event types, the run-log.jsonl format, and the new run directory layout.

  Extract the repeated `get_run_state` fallback clause (6 occurrences across SKILL.md and review-cycle.md) into a single policy statement in each file's preamble section. Remove the duplicate version-mapping sentence from artifact-conventions.md's v3 backward compatibility subsection. Add a reader note at the top of the v2 Schema section directing to the v3 section for new runs.

  Run directories are now stored at `.ai/runs/{ticketId}/{runId}/` instead of `.ai/runs/{runId}/`. When no ticket ID is provided to `init_run`, one is auto-generated in the format `{YYYYMMDD}-{4 hex chars}`.

- Warn when compiled output is stale if using development MCP code (#166)

  Adds a one-time-per-session staleness warning when the MCP server's compiled output is older than its TypeScript source files. A new `staleness.ts` module recursively compares `src/**/*.ts` mtimes against `dist/esm/cli.js`, and `server.ts` wraps all 5 tool handlers to prepend the warning as a separate content item on the first tool call when the build is stale.

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

### 🐛 Bug fixes

- Fix inconsistent artifact logging (#154)

  Fixes four regressions in the MCP `init-run` tool introduced by PR #133: aligns the local run directory path with the global export structure, removes the redundant project slug from run IDs, adds `sanitizeTicketId()` to strip leading `#` characters, and updates skill documentation for bare numeric branch handling.

- Resolve artifact base directory from preferences instead of hardcoding project path (#168)

  Replaced the hardcoded `join(projectRoot, '.ai', ...)` in the MCP `init_run` tool with a preference cascade resolver that defaults to `~/.ai`. Added a new `resolve-base-dir.ts` utility, an optional `baseDir` parameter to the MCP schema, 15 new tests for the resolver, and updated existing tests for hermeticity. Updated orchestrate skill and artifact conventions documentation.

  Model: claude-opus-4-6
  Workspaces: agents, mcp

### 🧪 Tests

- Add catwalk differ boundary tests for agent (#212)

  Adds three boundary tests to the catwalk config differ test suite, pinning behavioral contracts for agent add/remove propagation through `diffCatwalkConfig` and the empty-array identity case in `diffAgents`.

### ⚙️ Tooling

- Migrate to nmr script runner (#378)

  Replace hand-rolled `scripts/run-workspace-script.ts` and custom utility scripts with `@williamthorsen/nmr`. Root `package.json` scripts reduced from 35 to 4 (lifecycle hooks + repo-specific). Workspace packages no longer define a `ws` script — nmr serves as the workspace script runner directly.

  Replace hand-rolled consistency tests (`nodejs-version.app.test.ts`, `pnpm-version.app.test.ts`, and their helpers) with `runConsistencyChecks()` from `@williamthorsen/nmr/tests`.

  Remove orphaned root devDependencies: `@williamthorsen/toolbelt.objects`, `js-yaml`, `@types/js-yaml`.

- Automate replacement of dashed separator comments with headings or region folds (#451)

  Removes the noisy boxed and rulered comment separators that had accumulated across the codebase and replaces every occurrence with simpler forms or folding-region markers. Introduces a reusable sweep script to automate this process. Documents the convention in the `code-patterns` skill so future agent-generated TypeScript follows the same rule.

## 0.1.0 — 2026-03-02

### 🎉 Features

- Create @codeassembly/mcp server with run-data tools (#96)

  Creates the `@codeassembly/mcp` package — a custom MCP server providing 5 domain-specific tools for orchestrated run data management via stdio transport. The server validates all inputs against Zod schemas from `@codeassembly/run-core` and persists run state as a v3 header (`run-index.json`) plus an append-only event log (`run-log.jsonl`).

  Note: Vitest with `environment: 'node'` uses Vite's SSR environment, which has its own resolve conditions separate from the client environment. The `source` condition must be set in both `resolve.conditions` (client) and `ssr.resolve.conditions` (SSR/node) for workspace packages to resolve from TypeScript source during testing without a prior build step.

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
