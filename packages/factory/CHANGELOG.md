# Changelog

All notable changes to this project will be documented in this file.

## 0.2.2 — 2026-08-04

### ♻️ Refactoring

- Rename packages to publishable names (#1157)

  Renames CodeAssembly packages in preparation for their initial publication. The package responsible for deploying and syncing agent guidance is now called `codeassembly`.

### ⚙️ Tooling

- Migrate Vitest to nmr's centralized model (#1154)

  Changes Vitest configuration so that test suites are selected by project ("unit", "integration", and "app"), eliminating the need for category-specific configuration files. Every package keeps a single Vitest config file, which composes the repo's shared settings rather than carrying its own copy. The nmr fmt command now formats shell scripts as well, and the corresponding package-file scripts have been removed as redundant.

- Run every test in the default gate, classified by what it reaches (#1155)

  Upgrades `nmr` to 0.24, which changes Vitest configuration so that test suites are selected by a tier ("unit", "tool", "localhost", and "remote") corresponding to the services they use. `nmr test:unit` and `nmr test:tool` each run one of these; `nmr test:all` runs every suite. All tests are covered by the default run. `nmr test:integration` no longer exists, and no tests carry the `.int.` infix. The upgraded `nmr` includes a caching feature that skips checks that already succeeded against an identical working tree.

## 0.2.1 — 2026-07-18

### ♻️ Refactoring

- Deduplicate the isRecord type guard across factory and run-core (#707)

  Consolidates a duplicated type guard onto a single shared definition per package. The unified guard also rejects malformed array data, so such data can no longer surface bogus reviewer names in the rendered run visualizations.

### 🧪 Tests

- Use full timestamps in test fixtures, not bare dates (#826)

  Test fixtures now seed date fields with full-precision UTC timestamps, the same form real notes carry, instead of bare day-only dates that no writer actually produces. Fixtures that deliberately exercise legacy day-only date parsing and validation keep their bare dates.

### ⚙️ Tooling

- Exclude generated files from Prettier formatting

### 📚 Documentation

- Remove local-only references from design docs (#944)

  Removes local-machine file paths or unresolved internal-only references (ticket numbers, branch numbers, pointers to material outside the repo) from design and planning docs.

## 0.2.0 — 2026-05-04

### 🎉 Features

- Scaffold orchestration visualizer foundation (Phases 0–3) (#1)

  Scaffolds the CodeAssembly Factory package — a retro-styled orchestration visualizer built with Excalibur.js, React, and Express. Removes all template packages from the monorepo and replaces them with a single `factory` workspace that reads `status.json` run data from `~/.ai/projects/`, serves it via an Express API, and renders it as an interactive game scene with stations, agents, artifacts, and gates.

- Support run-index.json (v2) in status adapter (#4)

  Add parseRunData unified entry point that tries v2 (run-index.json) first, falls back to v1 (status.json). Normalize both formats to flat CanonicalRunStatus shape with new fields: mode, model, artifacts. Add ArtifactEntry type with v2 validation covering context, config, and artifact entries. Convert completedAt null to undefined for v1/v2 consistency.

  Rename phaseDecision to phaseDecisions across all types, consumers, and test fixtures. Update project scanner and route handlers to use parseRunData instead of hardcoded status.json paths. Deduplicate shared validators and simplify normalizeV1 with destructure-and-spread.

- Implement role-type architecture and all-phase agent mapping (#8)

  Introduces a `RoleType` abstraction layer (5 visual types: orchestrator, analyst, planner, author, reviewer) that decouples agent appearance from individual role names, and extends the mapper to create agents for all 7 orchestration phases. Also adds v2 `run-index.json` support to the status adapter with proper validation and v1 backward compatibility.

- Implement sprite infrastructure and basic animations (#9)

  Replaces the flat colored rectangles used for agent actors with sprite-based character animations. Introduces a new `sprites` module containing animation definitions, an SVG placeholder sprite generator, and a caching sprite loader that integrates with Excalibur's `ImageSource`, `SpriteSheet`, and `Animation` APIs. Agents now render as color-coded stick figures (circle head, rectangle body, line arm) with idle bobbing animation.

- Add agent movement and status-driven animation transitions (#14)

  Adds incremental agent lifecycle management to the factory scene: agents are dynamically added, removed (with fade-out), and repositioned as run status changes. Each agent's animation state (idle, walking, working, celebrating, concerned) is resolved from the run phase status. Agents at the same station are arranged in a grid layout, and the camera auto-zooms to fit all 7 stations within the viewport.

- Persist URL selections and reorder status bar (#15)

  Add a `useSelectionParams` hook that persists project/ticket/run dropdown selections as URL query parameters via `history.replaceState`. `RunSelector` initializes its state from URL params on mount, validates them against loaded data, and syncs changes back on every dropdown interaction. The status bar field order is also corrected from Run/Status/Branch/Duration to Project/Ticket/Run/Status/Duration.

- Add RunList component with clickable run list in sidebar (#29)

  Adds a `RunList` component to the Factory sidebar that displays all orchestration runs in a flat, scrollable list sorted by most recent. Each item shows a CGA-16 color-coded status indicator, is clickable to select the run for viewing, and has a dismiss button. A "Clear all" button dismisses all visible runs at once. The `fetchProjects` call is lifted from `RunSelector` to `App.tsx` so both components share the same `ProjectIndex` data.

- Multi-level platforms and agent positioning (#31)

  Replaces the single-platform horizontal layout with a multi-level assembly line where parallel reviewers occupy separate vertical floors connected by ladders. Introduces a pure layout engine that computes all scene geometry, add orchestrator positioning at the active phase station, and make agent diffing level-aware.

- Auto-refresh projects list with file watching (#32)

  Add automatic detection of new tickets and surface them in the Factory dropdown within seconds, without requiring a server restart. The server watches the filesystem for changes and rescans; the client polls for updates every 5 seconds.

  - Expose basePath from ProjectScanner
  - Add ProjectWatcher for filesystem change detection
  - Start ProjectWatcher after initial scan
  - Poll for project updates every 5 seconds
  - Restore process.exit in shutdown handler to prevent hang

  Custom SIGINT/SIGTERM handlers override Node's default termination.
  Without process.exit(0), the Express listening socket keeps the event
  loop alive and the process hangs on Ctrl+C. Also extract polling
  interval to a named constant and guard ProjectWatcher against double
  start() calls.

- Add orchestrator walk transitions along assembly line (#33)

  Replace the orchestrator's instant position-snap with animated walk transitions. The orchestrator now walks horizontally between stations along level 0 as the active phase changes, and transitions between levels at the review area via ladder waypoints (horizontal to ladder, vertical teleport, horizontal to station). During multi-reviewer review phases, the orchestrator is positioned at the highest reviewer level to visually "oversee from above."

- Add Zod schema validation for run-index.json (#43)

  Replace ~170 lines of hand-rolled type-guard validation in status-adapter.ts with Zod schemas. Define V2 run-index.json and V1 status.json schemas with forward-compatible `.loose()` for unknown keys, `.nullish()` for null-tolerant fields, and enum validation for status/criticality values. Refactor parseRunIndex and parseStatusFile to use `.safeParse()` while preserving the public API and error messages.

  Add a CLI validation script (`pnpm run validate:run-index`) that accepts a file or directory, recursively finds run-index.json files, validates each against the V2 schema, and reports per-field Zod errors with meaningful paths.

  New schemas: run-index-schema.ts (13 exported validators), status-json-schema.ts (V1 reusing shared enums). New tests: 161 tests covering all enum values, nullable/optional fields, forward-compatible phase entries, artifact entries, CLI directory scanning, and error differentiation.

- Show agents as soon as their phase is current (#45)

  Adds phase inference to the Factory visualization so agents appear at their stations as soon as their phase becomes current, rather than waiting until phase data is written to `run-index.json`. A new `findCurrentPhase` utility infers the active phase from sequential phase ordering and `phaseDecisions`, then threads the result through station activation, agent creation, orchestrator positioning, and animation state resolution.

- Persist local user settings (#47)

  Adds server-side persistence for dismissed-run state in the Factory sidebar. A new `SettingsStore` service reads and writes `settings.json` to a configurable directory, exposed via `GET/PATCH /api/settings` endpoints. The `useDismissedRuns` hook is rewritten to sync with the server using optimistic updates, and dismissals now record the run's status so that re-executed runs automatically reappear.

- Add agent spawning and artifact-carrying visuals (#48)

  Agents now spawn at their station only when their phase begins (not from run start), the orchestrator displays a colored artifact indicator while walking between stations, and a brief 300ms hand-off pause occurs upon arrival. Null-safety guards (`isPresent()`) replace `!== undefined` checks throughout phase evaluation, fixing a runtime bug where Zod's `null` phase values slipped past TypeScript's `| undefined` type.

- Improve run listing readability in sidebar (#50)

  Restructures the Factory sidebar's `RunList` component to prioritize project/ticket identity over raw run IDs, adds human-readable timestamps, improves color legibility, and adds timing tooltips. Threads `completedAt` from the server-side scanner through to the client UI.

- Add resting animations for idle agents (#54)

  Adds a `resting` animation state — a relaxed arm-sway — that plays when an agent has completed its work and is waiting. This visually distinguishes "done and waiting" agents from "not yet started" agents, which remain in the `idle` bob animation. The orchestrator also uses `resting` as its default in-progress state while waiting at a station.

- Position orchestrator to left of delegatee (#56)

  Add `approaching?: boolean` to `AgentConfig` so the orchestrator stands one agent-spacing (36px) to the left of the leftmost agent at the target station instead of occupying a grid slot past the delegatee. Propagate the flag through the layout system (`agentPosition` early-return for level-0 and upper-level approach positions), the agent differ (`hasPositionChanged` helper with `?? false` coalescing), and both `FactoryScene` call sites.

  Remove the now-unused `agents` parameter from `buildOrchestratorAgent` and the `existingAtStation` computation since the orchestrator always uses `stackOffset: 0` when approaching. Extract a `leftmostSlotOffset` intermediate in the layout for geometric clarity.

  Follow-up: CODY-55 tracks directional sprite facing (`scaleX = -1`) so the orchestrator and delegatee visually face each other.

- Add directional sprite facing for approaching orchestrator (#61)

  Adds a `setFacing(direction)` method to `AgentActor` using Excalibur's `graphics.flipHorizontal` property, and calls it from `FactoryScene` when agents are added or after the orchestrator finishes walking. When the orchestrator approaches a delegatee (`approaching: true`), its sprite now faces right toward the delegatee instead of facing left like all other agents.

- Improve representational quality of gates (#64)

  Rewrite `GateActor` as a stateful, animated actor so that nonblocking gates are visually low (2px vs 40px blocking) and the transition is animated over 1 second. The orchestrator waits at a gate until the animation completes before walking through.

  - GateActor uses `Rectangle` graphic with `onPreUpdate` frame-by-frame height interpolation, bottom-edge pinned to the platform surface.
  - Gates persist across `rebuildStaticElements` via `gateMap` (mirrors the existing `agentMap` pattern), with diffing in `updateGates`.
  - `waitForOpen()` promise coordination lets the orchestrator await gate transitions; resolvers flush unconditionally on animation completion to prevent leaks on direction reversal.

- Update run-index.json incrementally during parallel review (#69)

  Updates the orchestrate skill's review-cycle module and the factory visualization to support incremental `run-index.json` writes at every state transition during the review cycle. Adds per-phase `startedAt`/`completedAt` timestamps, an iteration-level structure for `parallelReview`, and fixes a phase-inference bug where `isPhaseEvaluated()` conflated "data present" with "phase completed."

- Move station labels to platform (#70)

  Reposition station labels from inside the station rectangle to the platform bar below, centered horizontally using `TextAlign.Center`. Display the role name (e.g., "architect") instead of the phase name (e.g., "architecture") for readability.

  Add PHASE_ROLE constant mapping phases to display role names, add role field to StationConfig, and update `StationActor` to accept role as its first parameter with the new label offset `vec(50, 25)`.

  Fix label Y offset from 25 to 45 so text centers vertically within the main platform rather than inside the station rectangle. The GraphicsGroup offset origin is the group's top-left, so reaching the platform center requires STATION_HEIGHT + PLATFORM_HEIGHT/2 - 5 (40 + 10 - 5 = 45), not STATION_HEIGHT/2 + PLATFORM_HEIGHT/2 - 5.

  Also use spaces in display names ("holistic reviewer") instead of hyphens for readability.

- Render individual artifact boxes with configurable layout (#77)

  Replaces the one-box-per-phase artifact rendering with per-artifact visual boxes arranged horizontally at each station. Adds configurable layout constants for artifact size, gap, and offset. Implements a dual-source data strategy that uses the top-level `artifacts` array when populated and falls back to phase-specific fields for backward compatibility. Adds rendering support for `codeSimplifier` and `holisticReview` phases.

- Add demo playback mode with event-sourced run replay (#81)

  Adds a demo playback mode to Factory that replays orchestrated runs using an event-sourced architecture. A new v3 `run-index.json` header-only format paired with `run-log.jsonl` append-only event stream enables any completed run to be replayed without conversion. The playback system produces `CanonicalRunStatus` — the same type consumed by live visualizations — so the UI is data-source-agnostic.

  Details:

  - Data layer: `RunHeader`/`RunEvent` types and Zod schemas for `run-log.jsonl` validation, v3 `run-index.json` header-only schema.
  - Event folder: shared `foldEvents(header, events)` function that reconstructs `CanonicalRunStatus` from header + event array, used by both server and client.
  - Server: status adapter v3 path with v2/v1 backward compatibility fallback chain.
  - Playback: `PlaybackController` with play/pause/stop, step forward/backward, variable speed (0.25x–128x), and timeline normalization (caps inter-event gaps at 10s).
  - React hooks: `usePlayback` (wraps controller) and `useDemoMode` (coordinates live/demo data source switching).
  - UI components: `DemoStatusLight` (pulsing color indicator) and `DemoControlPanel` (transport controls, speed controls, recording selector, timeline indicator).
  - Demo data: bundled recording of a moderately complex run exercising all 7 phases, 3 parallel reviewers, fix cycle, code simplifier, holistic review.
  - Integration: `App.tsx` seamlessly switches between live and demo data — the visualization never knows which data source it's using.

- Show tooltip on hover over artifact boxes (#91)

  Adds hover tooltips to artifact boxes in the Factory visualization, displaying metadata (filename, role, agent, phase, timestamp) when the user hovers over an artifact. Establishes the first Excalibur→React communication channel — a callback pattern from game actors through the scene to React state — that future interactive features will reuse.

  Details:

  Threads tooltip metadata (filename, role, agent, phase, timestamp) from `ArtifactEntry` through `ArtifactConfig`, `FactoryScene`, and `ArtifactActor` into React via a new callback-based communication channel. Pointer events on `ArtifactActor` fire up to `GameCanvas`, which manages hover state and renders a fixed-position `ArtifactTooltip` component. This establishes the first Excalibur-to-React communication path in the codebase.

- Add React Flow foundation and visualization switcher (#109)

  Adds `@xyflow/react` to the factory package and introduces a flow-diagram visualization alongside the existing Excalibur-based factory view. A `VisualizationSwitcher` component provides a toggle between views, a `FlowDiagram` shell wraps React Flow with pan/zoom/minimap, and a `run-to-flow.ts` mapper transforms `CanonicalRunStatus` into positioned nodes and edges representing the orchestration pipeline.

- Create custom node components for flow diagram (#112)

  Adds 6 custom React Flow node types (OrchestratorNode, PhaseAgentNode, ReviewerNode, CoderShadowNode, SkippedPhaseNode, PhaseGroupNode) with a shared StatusDot sub-component and CSS. Extends the run-to-flow mapper to set `type` fields and populate phase-specific metadata on nodes. Registers all custom node types in FlowDiagram.

- Add custom edge components with packet animation (#118)

  Adds custom React Flow edge components (`DispatchEdge`, `ReturnEdge`, `SpineEdge`) with a reusable `PacketAnimation` system for the Factory flow diagram. Edges visually distinguish completed from pending dispatches, carry criticality badges on return edges, and animate with network-style packet effects when new edges appear.

- Implement review-cycle visualization and iteration tracking (#129)

  Extends the Factory flow diagram to visualize the orchestration system's parallel review cycle — reviewer fan-out, criticality badges, selective re-review with dimming, iteration counters, coder shadow nodes, edge accumulation, and staggered animations. All 13 acceptance criteria from CODY-100 are implemented across 11 files with 47 new/modified tests.

- Persist visualization mode in query string parameter (#142)

  Adds a `useVisualizationParam` hook that persists the Factory/Flow visualization mode toggle in a `visualization` query string parameter. The `VisualizationSwitcher` component swaps its bare `useState` for this hook, so the selected view survives page refreshes and can be shared via URL.

- Propagate failure reason from run_failed event to CanonicalRunStatus (#167)

  Threads the `reason` field from `run_failed` events through the entire canonical run status pipeline — from `CanonicalRunStatus` type definition through event folding, data parsing, and into the Factory StatusBar UI.

- Gracefully handle invalid log files in orchestrated-run directories (#174)

  Introduces a structured `RunDataParseError` class in `run-core` that distinguishes known parse failures (corrupt JSON, schema mismatches, missing companion files) from unexpected errors. The Factory server's `ProjectScanner` now catches these specifically and logs actionable `console.warn` messages with fix suggestions instead of alarming `console.error` stack traces.

  Model: claude-opus-4-6
  Workspaces: factory, run-core

- Scaffold catwalk visualization with empty scene (#189)

  Add a new "Catwalk" visualization to the factory package, scaffolding the `CatwalkCanvas` React component and `CatwalkScene` Excalibur scene with a dark background. The `VisualizationSwitcher` is extended with a third tab, and the `useVisualizationParam` hook now supports `'catwalk'` as a valid view. A separate commit updates the agents artifacts directory configuration.

- Integrate CatwalkScene with config-driven actor management (#201)

  Implements the milestone 1 integration scene for the catwalk visualization — wiring layout, mapper, and actors together into a working Excalibur scene. `CatwalkScene` receives `CanonicalRunStatus` updates, derives visual state via `mapRunToCatwalk` and `computeCatwalkLayout`, and creates all actor types (stations, agents, orchestrator, gates, chutes, artifacts) at layout-computed positions. The catwalk is now the default visualization tab.

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

- Implement catwalk config differ (#211)

  Adds a pure-function structural differ that compares two `CatwalkSceneConfig` snapshots and produces typed change descriptors. Four sub-differs (`diffOrchestrator`, `diffAgents`, `diffGates`, `diffArtifacts`) are composed into a top-level `diffCatwalkConfig` function that returns a `CatwalkDiff` with a `hasChanges` boolean.

- Add run directory scanning and refactor ProjectScanner (#221)

  Adds run directory scanning infrastructure to `run-core` — a scanner (`discoverRunDirectories`), validator (`validateRunDirectory`), and CLI tool for checking and archiving invalid runs. Refactors `factory`'s `ProjectScanner` to delegate to these new shared scanners and introduces a central configuration module.

  Model: claude-opus-4-6
  Workspaces: factory, run-core

- Add animated state transitions to catwalk actors (#225)

  Replace the tear-down-and-rebuild pattern in `CatwalkScene.updateStatus()` with diff-driven animation dispatch. Each actor type gains targeted animation methods — walk, pulse, fade, scale — driven by `CatwalkDiff` computations on each status update. A new `deactivated` agent state preserves visual history of completed agents at low opacity.

- Create sprite-loading infrastructure for catwalk (#228)

  Replaces the catwalk visualization's geometric primitives (circles + text for station agents, rectangles + text for the orchestrator) with pixel art sprites loaded from PNG sprite sheets. Introduces a sprite loading/caching module, placeholder SVG sprite sheet assets, a Vite static import mapping layer, and refactors both actor classes to render via `Animation` + `GraphicsGroup`.

- Pulse scale instead of opacity; extract opacity constants (#240)

  Replaces the catwalk visualization's opacity-based working pulse with a scale-based pulse, extracts all hardcoded opacity and scale values into named constants in a shared animation module, and removes baked-in opacity from the placeholder SVG sprites so the game engine has full control over actor visibility.

- Add chute animations, carried artifacts, and code badge (#241)

  Adds a promise-based choreography system that sequences artifact delivery animations through station chutes, renders carried-artifact badges trailing the orchestrator during walks, and displays a code-iteration badge (v2, v3) below the orchestrator sprite when implementation has been re-entered.

- Generate block-robot pixel art sprites (#249)

  Replace the placeholder colored-rectangle sprite sheets in the catwalk visualization with composable block-robot pixel art silhouettes. A new multi-file module under `scripts/sprites/` defines reusable body parts, color palettes, and a renderer that composites 12 animation poses per robot type into 128×96 SVG sprite sheets. Both subagent (compact metallic worker) and orchestrator (taller gold command unit with antenna) are visually distinct and produce state-appropriate poses across idle, walking, working, resting, celebrating, and concerned animations.

- Generate HTML preview page for sprite sheets (#254)

  Adds a self-contained HTML preview page generator for sprite sheets. Running `pnpm run generate-sprites` from `packages/factory/` now produces both SVG sprite sheets and a timestamped HTML preview at `.local/sprites/`. The preview displays all 12 frames in a labeled 4x3 grid with animated previews for both subagent and orchestrator robot sprites.

- Expand block-robot sprites and improve palette contrast (#268)

  Replace hardcoded hex palettes with an HSL-based parametric generator and scale both robot sprite characters to fill their 32×32 cells. The subagent shifts from blue-grey to cyan/teal for contrast against the dark catwalk background, and the orchestrator gold gets a saturation/lightness boost. Sprite bottom-padding constants are renamed with explicit `_PX` units and updated from 6/10px to 1px to match the new geometry.

- Add progressive artifact reveal to catwalk demo replay (#272)

  Artifacts in the catwalk scene now appear progressively during demo playback — outputs fade in when produced, inputs are delivered by the orchestrator via a sequenced chute animation (ascend → walk → descend → land). The demo data model is simplified from event-folding to direct snapshot stepping, and all non-catwalk visualizations are removed.

- Redesign orchestrator sprite (#286)

  Replaces the orchestrator robot's visual design: swaps leg-based locomotion for tank treads, replaces the antenna with a 3-state beacon lamp, widens the torso, and introduces per-sprite-type animation configuration. The scale-pulse mechanism (`onPreUpdate`) is removed in favor of sprite-driven visual states.

- Add three-zone factory-floor visualization (#291)

  Adds an alternative "factory-floor" visualization to the Factory web app, rendering orchestration runs as a three-zone layout: upper tier (architect, planner), rail (coder, orchestrator, summary), and lower tier (reviewers, simplifier, holistic). Includes a visualization abstraction layer with a `vis` URL parameter to switch between the existing catwalk and the new factory-floor view. The layout features coder and orchestrator work rooms delineated by vertical lines, role-colored labels beneath each agent, and adaptive spacing that compresses lower-zone agents when reviewer count is high.

- Show waiting-for-input state in factory visualization (#292)

  Adds end-to-end visibility for when an orchestrated run pauses for user input (permission prompts, elicitation dialogs, idle prompts). New `waiting_for_input` and `input_received` events flow through run-core's event log and Zod schemas into the canonical status model. The factory catwalk visualization derives a `waiting` state for the orchestrator, rendering a concerned animation at reduced opacity. Claude Code hooks detect input-waiting states and emit events to the run log automatically.

- Add ?format=html param to artifact content endpoint (#300)

  Extends the `GET /runs/:projectSlug/:runId/artifacts/:filename` endpoint with an optional `?format=html` query parameter that renders markdown artifacts to HTML server-side using `marked`. The client API function `fetchArtifactContent()` gains a corresponding `options` parameter to request HTML-formatted content.

- Shared logical scene state for visualizations (#304)

  Extracts a visualization-agnostic `LogicalSceneState` layer into `packages/factory/src/client/visualizations/shared/` that interprets `CanonicalRunStatus` into present-tense workflow state — what each agent is doing, what state each artifact is in, what the orchestrator is carrying — independent of any visualization's spatial layout.

- Replace geometric placeholders with tileset rendering (#332)

  Replaces colored geometric primitives (circles for agents, rectangles for zones/artifacts) in the office visualization with LimeZu tileset sprites. Adds a full sprite asset pipeline — 23 PNGs, Vite imports, singleton sprite loader, furniture manifest, and character-role mapping — and rewrites `OfficeScene`'s rendering layer to draw tiled floors/walls, place 26 furniture sprites, and render directional character idle poses. Introduces `OfficeCanvas.tsx` as the React wrapper and registers the `office` visualization in the registry.

- Animate office transitions (#336)

  Wires `OfficeScene` to consume `TransitionPlan` as animations instead of teleporting entities via `applyFullState()`. A new transition executor bridges the pure-data plan to Excalibur's action queue, handling all six transition types (walk, fade_in, fade_out, state_change, artifact_appear, artifact_deliver) with staggered timing and clean cancellation support.

- Use slot-based positioning for orchestrator (#340)

  The orchestrator character is now positioned at specific workstation and standing slots instead of geometric zone centers. Standing slots were added at the prep and workshop door tiles, `slotId` was threaded through the full state → assignment → position → transition pipeline, resting direction now uses slot-facing metadata, and walk waypoints are deduplicated to eliminate zero-length segments.

- Enable playback of completed orchestrated runs (#344)

  Adds the ability to replay any completed v3 orchestrated run as an animation in the Factory visualization. A new server endpoint returns raw run events, client-side snapshot generation produces intermediate states via fold-to-cursor, and a redesigned player UI separates source selection from transport controls following a streaming-app mental model.

- Add `pick-demo-runs` script to rank archived runs (#436)

  Adds a script that scans the artifact archive and ranks orchestrated runs by their suitability for a demo recording. Each run is scored against seven weighted signals — run completion, parallel reviewer count, workflow completeness, review criticality, presence of usage metrics, event-count window, and recency — with weights totaling 100.

### 🐛 Bug fixes

- Accept no-reason phase decisions in run-index validator (#13)

  Makes the `reason` field optional in `PhaseDecision` validation, fixing a schema mismatch that caused newer orchestration runs to silently disappear from Factory dropdowns.

- Accept null phases and criticality in status-adapter (#37)

  Relaxes status-adapter validation to accept `null` phase entries and `null` values for criticality-related fields within phase objects. Adds an `isNullOrValid` helper that wraps existing validators, and updates `isValidPhasesObject` to skip `null` entries alongside `undefined`.

- Correct structural element positioning in the factory scene (#44)

  Remove `useAnchor: false` from StationActor's GraphicsGroup so stations render centered on their position, aligning with upper review platforms.

  Compute gate, ladder, and station y-positions relative to the platform surface (`baseY - platformHeight/2`) instead of the platform center.

  Move the ladder to the left side of upper platforms and reduce upper platform width to 100px to avoid overlapping the gate.

- Sync RunList selection with URL params and RunSelector dropdowns (#51)

  Lifts selection state (project, ticket, run) from `RunSelector` to `App`, establishing a single source of truth that both `RunSelector` and `RunList` share. `RunSelector` is converted from an uncontrolled component with internal state to a controlled component that receives selection values as props. A `useEffect` in `App` drives URL param updates whenever selection changes.

- Fix avatar & artifact positions and left-align labels
- Handle newer parallelReview schema shapes in scene mapper (#102)

  The orchestrate skill evolved its run-index.json format, producing three
  shapes for the parallelReview phase: flat `reviewers` record, `iterations[].perReviewer`
  records, and top-level `reviewerDetails`. The scene mapper only handled the first shape,
  crashing with TypeError on newer runs.

  Extract reviewer names via a unified `extractReviewerNames()` helper that normalizes
  all three shapes, used by both `buildReviewerAgents()` and `computeOrchestratorLevel()`.
  Falls back to a generic reviewer agent when no known sub-properties are found.

- Fix canvas scaling to be width-driven with FitContainer (#125)

  Switches the Factory canvas from viewport-driven scaling (`DisplayMode.FitScreen`) to container-driven scaling (`DisplayMode.FitContainer`) and restructures the CSS layout so the canvas width fills available space, height derives from a 2:1 aspect ratio, and natural browser scrolling activates when content overflows. The visualization toggle is repositioned above the canvas in normal document flow.

  Move the `.canvas-container` wrapper from App.tsx into `VisualizationSwitcher` so the toggle sits above the canvas in normal document flow.

  Change `.main` overflow from hidden to auto to enable natural browser scrolling when the min-width constraint causes content to exceed the viewport.

  Give flow view an explicit min-height (600px) so `ReactFlow` gets a bounded parent height when `.main` has overflow: auto.

- Fix diagram view crash on undefined reviewers (#138)

  Fix a `TypeError: Cannot read properties of undefined` crash when switching to diagram view. The `ParallelReviewPhase.reviewers` field was declared as required in the TypeScript interface but could be `undefined` at runtime due to Zod `.partial().loose()` parsing of V2 run data. The fix makes the type optional to match runtime reality, then uses standard optional chaining at all access sites.

- Skip interactive run directories in project scanner (#208)

  Adds a guard in the project scanner's `scanTicket` method to skip directories ending with `-interactive` before attempting to read run data. This eliminates noisy ENOENT warnings that appeared on every scan for interactive session directories.

- Guard against negative orchestrator station index (#242)

  Added a guard in `CatwalkScene.applyDiff()` to handle the -1 sentinel station index that `buildOrchestrator()` returns for terminal run states (failed, needs_manual_review). When the orchestrator moves to a negative station, it now fades out gracefully via a new `fadeOut()` method on `OrchestratorActor` instead of passing the invalid index to `orchestratorPosition()`, which threw a `RangeError`.

- Fix canvas not scaling up on viewport resize (#243)

  The Excalibur game canvas scaled down correctly when the viewport shrank but did not scale back up when the viewport expanded. The root cause was twofold: the catwalk container lacked an explicit aspect-ratio (making its height content-dependent and locked to the canvas's previous pixel dimensions), and Excalibur's internally set inline pixel dimensions on the canvas prevented the container from growing.

  Added a `useContainerResize` hook that observes the canvas container, resets inline dimensions to fluid CSS sizing, and triggers Excalibur's resize handler. Also added aspect-ratio: 2/1 to the catwalk container CSS.

- Subagent sprites are not centered on station x position (#250)

  Fixes horizontal misalignment of station subagents relative to the orchestrator and chute by offsetting the `StationAgentActor` `GraphicsGroup` members by `-SPRITE_SIZE / 2` on the x-axis. The original ticket described the orchestrator as misaligned, but investigation of the screenshot confirmed the orchestrator and chute were correctly positioned — the subagents were shifted 16px to the right.

- Fix catwalk layout geometry, actor rendering, and artifact positioning (#262)

  Overhauls the catwalk visualization layout system to use a single source of truth (`GROUND_LINE_Y`, `RAIL_Y`) for all spatial positioning, moves artifact/divider/label layout computations into the pure `computeCatwalkLayout()` function, fixes sprite floating caused by transparent padding in the pixel art sprite sheets, fixes station label double-centering, and adds comprehensive test coverage for the mapper, layout, and choreography modules.

### 🏗️ Internal features

- Create 3-zone adapter for office visualization (#309)

  Adds a complete spatial adapter pipeline that maps `LogicalSceneState` to the 3-zone office facility layout (prep area, workshop, governor's office). The pipeline spans 18 new files (10 source, 8 test) implementing types, zone definitions, layout with corridor paths, agent/artifact-to-zone mapping, structural diffing, pixel-space position resolution, transition planning, and an Excalibur `OfficeScene` with geometric placeholders.

### ♻️ Refactoring

- Move FlowDiagram to visualizations/flow/ (#244)

  Relocate the Flow diagram visualization from `components/FlowDiagram/` to `visualizations/flow/`, matching the directory structure already established by the catwalk visualization. Edge tests are co-located alongside their source files in `edges/__tests__/`.

### 🧪 Tests

- Silence console noise in test output (#147)

  Introduces a `silencedConsole()` disposable utility and applies it across all factory test files that trigger expected console output during error-handling paths. This eliminates noisy console output from test runs while preserving the ability to assert on console calls.

- Add catwalk differ boundary tests for agent (#212)

  Adds three boundary tests to the catwalk config differ test suite, pinning behavioral contracts for agent add/remove propagation through `diffCatwalkConfig` and the empty-array identity case in `diffAgents`.

- Add edge-case tests for input deferral, playback, rebuild (#273)

  Cover four behavioral boundaries identified during #259 review:
  - Deferred input derivation: inputs withheld when orchestrator hasn't reached station, appear after advance.
  - `PlaybackController` `play()` from paused: re-emits current snapshot before scheduling next advance.
  - `PlaybackController` with empty snapshots: transitions to ended without emitting.
  - `CatwalkScene` `resetScene()` during active choreography: rebuilds correctly and accepts forward diffs.

- Require explicit method selection in silencedConsole (#326)

  Made the `methods` parameter required in `silencedConsole` so callers must specify which console methods to silence. The generic signature narrows the return type to only the requested methods, giving compile-time errors if a caller accesses a method it didn't silence. Updated all 21 call sites across 8 test files and added dedicated type-narrowing and runtime behavior tests.

### ⚙️ Tooling

- Migrate to nmr script runner (#378)

  Replace hand-rolled `scripts/run-workspace-script.ts` and custom utility scripts with `@williamthorsen/nmr`. Root `package.json` scripts reduced from 35 to 4 (lifecycle hooks + repo-specific). Workspace packages no longer define a `ws` script — nmr serves as the workspace script runner directly.

  Replace hand-rolled consistency tests (`nodejs-version.app.test.ts`, `pnpm-version.app.test.ts`, and their helpers) with `runConsistencyChecks()` from `@williamthorsen/nmr/tests`.

  Remove orphaned root devDependencies: `@williamthorsen/toolbelt.objects`, `js-yaml`, `@types/js-yaml`.

- Add readyup and default kit (#403)

  Add `readyup` as a dev dependency and configure it via `.config/rdy.config.ts` to resolve internal kits from `.rdy/kits/internal/`. The initial kit at `.rdy/kits/internal/default.ts` contains two diagnostic checks: `.agents/PROJECT.md` is non-empty, and `.claude/CLAUDE.md` references `@.agents/PROJECT.md` via Claude's raw-link convention. Invoke with `rdy run` from the repo root.

  Rename the `factory` workspace package from `factory` to `@codeassembly/factory` for scope consistency with `@codeassembly/run-core`, `@codeassembly/mcp`, and `@codeassembly/agents`. No other workspace package depends on `factory`, so the rename is confined to `packages/factory/package.json`.

  Add `.rdy/**/*.ts` to the `include` arrays of `tsconfig.json` and `tsconfig.eslint.json` alongside the existing `.config/**/*.ts` entry so kit files are covered by the same tooling as the repo's other root-level scripts.

- Automate replacement of dashed separator comments with headings or region folds (#451)

  Removes the noisy boxed and rulered comment separators that had accumulated across the codebase and replaces every occurrence with simpler forms or folding-region markers. Introduces a reusable sweep script to automate this process. Documents the convention in the `code-patterns` skill so future agent-generated TypeScript follows the same rule.

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
