# Changelog

All notable changes to this project will be documented in this file.

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
