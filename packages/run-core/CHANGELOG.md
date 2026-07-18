# Changelog

All notable changes to this project will be documented in this file.

## 0.2.1 — 2026-07-18

### ♻️ Refactoring

- Deduplicate the isRecord type guard across factory and run-core (#707)

  Consolidates a duplicated type guard onto a single shared definition per package. The unified guard also rejects malformed array data, so such data can no longer surface bogus reviewer names in the rendered run visualizations.

- Replace js-yaml with the yaml library (#743)

  Consolidates all YAML parsing on a single library, removing a redundant YAML dependency that overlapped with it.

### 🧪 Tests

- Use full timestamps in test fixtures, not bare dates (#826)

  Test fixtures now seed date fields with full-precision UTC timestamps, the same form real notes carry, instead of bare day-only dates that no writer actually produces. Fixtures that deliberately exercise legacy day-only date parsing and validation keep their bare dates.

### ⚙️ Tooling

- Exclude generated files from Prettier formatting
- Fix type resolution in the published kb and run-core packages (#975)

  Fixes the published form of `@codeassembly/kb` and `@codeassembly/run-core`: Installing either package previously delivered no usable type declarations, and a packed copy carried no build output at all. Types now resolve correctly for consumers of both packages, which unblocks the pending `nmr` upgrade.

- Migrate build to nmr-compile and give mcp an entry point (#1001)

  Building the monorepo's TypeScript packages is now a single compile step that emits both JavaScript and type declarations, so the separate typings pass and a repo-local build script are both gone. When the MCP server is started before the build has run, it now reports that the build output is missing instead of failing with a cryptic module-resolution error, and when a package's command-line tool fails to start, it now reports the real cause instead of always advising a rebuild.

## 0.2.0 — 2026-05-04

### 🎉 Features

- Create @codeassembly/mcp server with run-data tools (#96)

  Creates the `@codeassembly/mcp` package — a custom MCP server providing 5 domain-specific tools for orchestrated run data management via stdio transport. The server validates all inputs against Zod schemas from `@codeassembly/run-core` and persists run state as a v3 header (`run-index.json`) plus an append-only event log (`run-log.jsonl`).

  Note: Vitest with `environment: 'node'` uses Vite's SSR environment, which has its own resolve conditions separate from the client environment. The `source` condition must be set in both `resolve.conditions` (client) and `ssr.resolve.conditions` (SSR/node) for workspace packages to resolve from TypeScript source during testing without a prior build step.

- Add React Flow foundation and visualization switcher (#109)

  Adds `@xyflow/react` to the factory package and introduces a flow-diagram visualization alongside the existing Excalibur-based factory view. A `VisualizationSwitcher` component provides a toggle between views, a `FlowDiagram` shell wraps React Flow with pan/zoom/minimap, and a `run-to-flow.ts` mapper transforms `CanonicalRunStatus` into positioned nodes and edges representing the orchestration pipeline.

- Propagate failure reason from run_failed event to CanonicalRunStatus (#167)

  Threads the `reason` field from `run_failed` events through the entire canonical run status pipeline — from `CanonicalRunStatus` type definition through event folding, data parsing, and into the Factory StatusBar UI.

- Add run directory scanning and refactor ProjectScanner (#221)

  Adds run directory scanning infrastructure to `run-core` — a scanner (`discoverRunDirectories`), validator (`validateRunDirectory`), and CLI tool for checking and archiving invalid runs. Refactors `factory`'s `ProjectScanner` to delegate to these new shared scanners and introduces a central configuration module.

  Model: claude-opus-4-6
  Workspaces: factory, run-core

- Create find-orchestration-savings skill to identify token waste (#232)

  Add a `find-orchestration-savings` skill and supporting infrastructure for analyzing completed orchestrated runs to identify token waste, suggest efficiency improvements, and surface resource misallocation. Extends the run-log event schema with optional usage metrics (`tokens`, `toolUses`, `durationMs`) on four event types and folds them into `CanonicalRunStatus`. The savings analyzer is auto-triggered on Haiku during Phase 5 of the orchestrate pipeline.

  Model: claude-opus-4-6
  Workspaces: agents, run-core

- Show waiting-for-input state in factory visualization (#292)

  Adds end-to-end visibility for when an orchestrated run pauses for user input (permission prompts, elicitation dialogs, idle prompts). New `waiting_for_input` and `input_received` events flow through run-core's event log and Zod schemas into the canonical status model. The factory catwalk visualization derives a `waiting` state for the orchestrator, rendering a concerned animation at reduced opacity. Claude Code hooks detect input-waiting states and emit events to the run log automatically.

- Enable playback of completed orchestrated runs (#344)

  Adds the ability to replay any completed v3 orchestrated run as an animation in the Factory visualization. A new server endpoint returns raw run events, client-side snapshot generation produces intermediate states via fold-to-cursor, and a redesigned player UI separates source selection from transport controls following a streaming-app mental model.

- Add `pick-demo-runs` script to rank archived runs (#436)

  Adds a script that scans the artifact archive and ranks orchestrated runs by their suitability for a demo recording. Each run is scored against seven weighted signals — run completion, parallel reviewer count, workflow completeness, review criticality, presence of usage metrics, event-count window, and recency — with weights totaling 100.

### 🐛 Bug fixes

- Fix diagram view crash on undefined reviewers (#138)

  Fix a `TypeError: Cannot read properties of undefined` crash when switching to diagram view. The `ParallelReviewPhase.reviewers` field was declared as required in the TypeScript interface but could be `undefined` at runtime due to Zod `.partial().loose()` parsing of V2 run data. The fix makes the type optional to match runtime reality, then uses standard optional chaining at all access sites.

- Add bin wrappers to eliminate pnpm install warnings (#394)

  Point `bin` entries at committed wrapper scripts in `bin/` instead of directly into `dist/esm/`. pnpm creates bin symlinks during install, before lifecycle scripts run, so the `dist/` target doesn't exist in a fresh worktree and `pnpm install` emits confusing "Failed to create bin" warnings.

  Each wrapper dynamically imports the build output at runtime. If the build output is missing, the wrapper detects `ERR_MODULE_NOT_FOUND` and tells the user to run `pnpm run build`.

  Adds `packages/run-core/README.md` documenting the package's exports, CLI, and the wrapper pattern convention.

### ⚙️ Tooling

- Migrate to nmr script runner (#378)

  Replace hand-rolled `scripts/run-workspace-script.ts` and custom utility scripts with `@williamthorsen/nmr`. Root `package.json` scripts reduced from 35 to 4 (lifecycle hooks + repo-specific). Workspace packages no longer define a `ws` script — nmr serves as the workspace script runner directly.

  Replace hand-rolled consistency tests (`nodejs-version.app.test.ts`, `pnpm-version.app.test.ts`, and their helpers) with `runConsistencyChecks()` from `@williamthorsen/nmr/tests`.

  Remove orphaned root devDependencies: `@williamthorsen/toolbelt.objects`, `js-yaml`, `@types/js-yaml`.

- Automate replacement of dashed separator comments with headings or region folds (#451)

  Removes the noisy boxed and rulered comment separators that had accumulated across the codebase and replaces every occurrence with simpler forms or folding-region markers. Introduces a reusable sweep script to automate this process. Documents the convention in the `code-patterns` skill so future agent-generated TypeScript follows the same rule.

## 0.1.0 — 2026-03-02

### 🎉 Features

- Create @codeassembly/run-core shared types package (#90)

  Creates `packages/run-core/` (`@codeassembly/run-core`) as the single source of truth for run data types, Zod schemas, and event processing. The package extracts canonical types, domain constants, v1/v2/v3 schemas, the `foldEvents()` event folder, and the `parseRunData()` parser from Factory into a standalone package that both the MCP server (producer) and Factory (consumer) will import.

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
