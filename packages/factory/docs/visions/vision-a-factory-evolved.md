# The living factory: where every pixel works

## Elevator pitch

The factory metaphor is not decoration -- it is the interface. Push the catwalk-and-stations layout from a passive animation into a fully interactive production floor where every conveyor belt, chute, station platform, and gantry rail is a navigational element backed by real data. Artifacts are not colored rectangles that drop and land; they are clickable documents that open inline, with diffs, findings, and summaries readable without ever leaving the factory scene. The orchestrator on its gantry rail does not merely walk -- it carries visible cargo, and hovering over that cargo shows what is being delivered and why. The pixel-art aesthetic earns its keep: it keeps the scene readable at any zoom level, it makes the spatial hierarchy obvious, and it creates a world that developers genuinely enjoy watching. This is a factory you can inspect.

---

## Layer 1: Metaphor and theme

### The production floor as information space

The factory floor is a top-to-bottom reading experience with three spatial zones, evolving the existing catwalk layout into a fully realized production environment:

**Zone 1 -- Gantry rail (top).** The orchestrator rides a motorized gantry crane along a gold rail. The rail spans the full width of the pipeline. The orchestrator does not just move left-to-right -- it pauses at each station, lowers cargo via chutes, picks up completed work, and advances. When it reaches the final station and the run completes, confetti particles rain down. During waiting-for-input states, the gantry arm flashes amber and a speech bubble appears above the orchestrator showing the reason (permission prompt, elicitation dialog, or idle prompt).

**Zone 2 -- Station platforms (middle).** Seven station platforms are arranged horizontally, each corresponding to a pipeline phase. Each platform is a self-contained workbench with:

- A **station sign** hanging from the rail, showing the phase name and role type.
- One or more **agent sprites** standing at the workbench, animating based on state (idle, working, resting, celebrating, concerned).
- An **output shelf** to the right of each agent, where completed artifacts stack up as small colored tiles.
- An **input tray** to the left of the station, where incoming artifacts from the previous phase are visible.
- **Conveyor belts** connecting adjacent stations, with artifacts visibly sliding along them when the orchestrator delivers materials.

At the review station (phase 4), the platform expands to accommodate 2-4 parallel reviewer agents, each with their own chute and output shelf. The parallel nature of review is spatially obvious: multiple agents work side-by-side at one wide station.

**Zone 3 -- Artifact vault (bottom).** Below the ground line, a structured document area displays artifact content. This is the "inspection floor" -- when the user clicks any artifact tile anywhere in the scene, the vault opens a panel showing the artifact's actual content. The vault uses a split layout: artifact metadata on the left (type, phase, agent, iteration, timestamp), rendered content on the right (markdown for plans, syntax-highlighted diffs for code, structured finding lists for reviews). The vault is not a separate page -- it slides up from below the factory floor, maintaining spatial continuity.

### Why this metaphor works

The production floor metaphor maps naturally to the orchestration pipeline because both are **sequential processes with parallel branches, visible intermediate products, and a clear flow direction**. Manufacturing is:

1. **Linear with exceptions** -- parts flow left-to-right, but the review station is a parallel processing step (multiple inspectors), just like the pipeline's parallel aspect reviewers.
2. **Observable** -- in a real factory, you can see what is being worked on at each station. Artifacts as physical objects on shelves make the abstract concept of "what has been produced" visually scannable.
3. **Traceable** -- every product has a history. Clicking an artifact and seeing its provenance (which agent, which phase, which iteration) maps to factory quality-control inspection.
4. **Rhythmic** -- factories have a cadence. The orchestrator walking, chutes activating, conveyor belts moving, and agents animating create a rhythm that tells you "the system is working" without requiring you to read text.

### Visual language

- **CGA-16 palette** for all structural elements (rails, platforms, conveyors) -- muted, functional.
- **Role-type colors** for agent sprites and accent bars -- bright, attention-drawing.
- **Artifact pastel colors** for artifact tiles -- soft, scannable, grouped by type.
- **Pixel-art at 32px base** for sprites, scaled with `ImageFiltering.Pixel` for crispness.
- **Scanline-shader overlay** (very subtle, 2-3% opacity) on the game canvas to reinforce the arcade aesthetic without compromising readability.
- **Dark background** (#1a1a2e) with lighter platform surfaces (#2a2a3e) for depth.

---

## Layer 2: Information architecture

### Three levels of detail

**Level 1 -- Glance (no interaction needed).** The factory floor itself communicates:

- **Pipeline progress**: which stations have agents working (pulsing), which are complete (resting agents, stacked output artifacts), which are pending (dim/idle agents).
- **Current phase**: the orchestrator's position on the gantry rail.
- **Run health**: agent animation states (celebrating = done, concerned = failed). Gates between stations open sequentially as phases complete.
- **Iteration count**: a version badge (v2, v3) on the orchestrator and on implementation-station artifacts when fix cycles occur.
- **Waiting state**: amber flash on gantry + speech bubble when the run is blocked on user input.

**Level 2 -- Hover (tooltips and highlights).** Hovering over any interactive element reveals metadata:

- **Agent hover**: role name, current state, phase timing (started/completed/duration).
- **Artifact tile hover**: filename, type, agent, phase, iteration number, creation time. The artifact tile highlights with a glow effect.
- **Station sign hover**: phase decision (run/skip, reason), aggregate phase status.
- **Orchestrator hover**: run metadata (project slug, ticket, branch, task summary), overall run status, elapsed time.
- **Gate hover**: "open" or "closed" with the gate's transition timing.
- **Conveyor belt hover**: last delivery direction and timestamp.

**Level 3 -- Click (deep inspection).** Clicking opens the artifact vault or detail panel:

- **Artifact click**: opens the vault with the artifact's full content. Plans render as markdown. Code change-summaries render as syntax-highlighted diffs. Review findings render as structured lists with severity badges (F/W/T/R/S/L) using the existing finding scheme, color-coded by severity. Summary artifacts render as formatted markdown.
- **Agent click**: opens a detail drawer showing the agent's full activity log for this run: which artifacts it produced, timing breakdown, usage metrics (tokens, tool uses, duration).
- **Station click**: shows all artifacts produced at this station in a chronological list, with a mini-timeline of the phase's lifecycle.

### Artifact versioning and comparison

When an artifact has multiple iterations (fix cycles), the artifact tile shows a small version indicator. Clicking it opens the vault with a **version carousel**: tabs labeled v1, v2, v3 across the top of the vault panel. The user can view any version, or click a "Diff v1 vs v3" button to see what changed between iterations. This uses a side-by-side or unified diff view rendered directly in the vault.

### Review findings hierarchy

Review artifacts from parallel reviewers render in the vault with a structured layout:

1. **Summary row**: total findings by severity (e.g., "0 Fatal, 2 Warning, 1 Test gap, 3 Refactor, 1 Style, 0 Low").
2. **Per-reviewer panels**: each reviewer's findings in a collapsible section, with the reviewer name and criticality badge.
3. **Finding cards**: each finding shows severity icon, description, file location (clickable), and resolution status (if re-review data exists).

### Navigation

- **Arrow keys** or **scroll** to pan the factory floor horizontally.
- **Mouse wheel** or **pinch** to zoom in/out (min: full pipeline in view, max: single station fills viewport).
- **Minimap** in the bottom-right corner shows the full pipeline as a tiny schematic with a viewport rectangle. Clicking the minimap jumps to that position.
- **Phase tabs** above the factory (in the React chrome layer) allow jumping directly to a station.
- **Keyboard shortcuts**: `1-7` jump to stations, `Escape` closes the vault, `[` / `]` navigate between artifacts within the vault.

---

## Layer 3: Interaction model

### Primary interaction: click to inspect

The fundamental interaction is click-to-inspect. Every visible element in the scene is clickable and opens a contextually appropriate detail view. This keeps the factory floor clean and uncluttered while making deep information accessible in one click.

**Click targets and their behaviors:**

| Element        | Click behavior                |
| -------------- | ----------------------------- |
| Artifact tile  | Opens vault with full content |
| Agent sprite   | Opens agent detail drawer     |
| Station sign   | Opens station summary panel   |
| Orchestrator   | Opens run overview panel      |
| Gate           | Opens phase transition detail |
| Conveyor belt  | Highlights the delivery chain |
| Minimap region | Pans camera to that location  |

### Secondary interaction: hover to preview

Hovering shows a tooltip anchored to the mouse position with the most relevant 2-3 lines of information. Tooltips appear after 200ms delay and dismiss immediately on mouseout. Tooltips never occlude the element being hovered -- they position intelligently above/below/beside based on available space.

### Tertiary interaction: keyboard navigation

For power users during post-mortem analysis:

- `Tab` cycles through stations left-to-right.
- `Enter` on a station selects it and shows its artifacts.
- `1-7` jump directly to a station.
- `Space` pauses/resumes playback (for live or recorded runs).
- `+`/`-` adjust playback speed.
- `Escape` closes any open panel.

### The vault interaction model

The artifact vault is the richest interaction surface. When opened:

1. It slides up from below the ground line, pushing the factory floor up (or overlaying with a semi-transparent backdrop).
2. The vault header shows: artifact type icon, filename, producing agent, phase, iteration.
3. The vault body renders the content appropriate to the artifact type:
   - **Plan artifacts (.md)**: rendered markdown with clickable step numbers.
   - **Code change-summaries**: syntax-highlighted diff view with file tree on the left.
   - **Review findings**: structured finding list (see Layer 2).
   - **Run summary**: formatted markdown with key metrics highlighted.
4. **Version navigation** (when iterations exist): tab strip across the top. Each tab shows the version number and a tiny diff-size indicator (e.g., "+12 -3"). A "Compare" button opens a two-pane diff view between any two versions.
5. **Cross-references**: findings that reference specific files link to the relevant section of the code change-summary. Clicking a file reference in a review finding opens the code diff scrolled to that file.

### Live vs. post-mortem modes

**Live mode (in_progress):**

- The factory floor updates in real-time as events arrive.
- New agents appear with a fade-in effect.
- Artifacts appear with the existing chute animation.
- The camera follows the orchestrator unless the user has manually panned.
- A "Follow orchestrator" toggle appears when the user pans away.

**Post-mortem mode (completed/failed):**

- The full factory floor is visible immediately (no animation).
- A **timeline scrubber** appears at the bottom, showing all events as dots on a horizontal line.
- Dragging the scrubber replays the run at any speed, with the factory animating between states.
- Clicking a specific event dot jumps to that state.
- The existing PlaybackController is extended to support scrubbing (jump to arbitrary cursor position).

---

## Layer 4: Delight and engagement

### Why developers keep this open

1. **Ambient awareness without cognitive load.** The factory floor is a peripheral display. When an agent starts working (pulse animation begins), when an artifact drops through a chute, when a gate opens -- these are visible in the corner of your eye. You do not need to read anything to know that progress is happening.

2. **The satisfaction of watching a production line complete.** There is a visceral pleasure in seeing a sequential process finish. Each station lighting up, each artifact landing, each gate opening -- it builds anticipation. When the orchestrator reaches the final station and the celebration animation plays, it feels like something was accomplished. This is the same psychology that makes progress bars and build logs compelling.

3. **The reward of inspection.** When you hover over an artifact and see its provenance, when you click through to read the actual diff, when you compare v1 to v3 and see what the review cycle changed -- you are learning about your code. The visualization is not a distraction from work; it is a window into the work being done on your behalf.

### Specific delight moments

**Chute delivery animation.** When the orchestrator delivers artifacts to the next station, the flying-artifact animation is enhanced:

- Artifacts rise up the origin chute with a slight wobble (not perfectly vertical).
- They attach to the orchestrator's gantry arm as small trailing badges.
- The orchestrator slides along the rail to the destination.
- Artifacts detach and descend the destination chute with a satisfying "landing" bounce (Excalibur's `Ease.easeOutBounce`).
- The receiving agent's working animation triggers immediately.

**Conveyor belt particles.** Active conveyor belts between stations show tiny pixel-art particles moving along them at a constant rate. This creates ambient motion that communicates "the pipeline is flowing." When the pipeline stalls, the particles stop.

**Review station expansion.** When the review phase activates, the review station smoothly expands from a single-agent width to accommodate all parallel reviewers. New chutes descend from the gantry rail. Reviewer agents appear with a fade-in. This spatial expansion communicates "something parallel is happening" without text.

**Iteration escalation visuals.** When a fix cycle occurs (code goes to v2, v3):

- The implementation station gets a subtle amber border on v2 and orange border on v3+.
- A small "loop" arrow appears between the implementation and review stations.
- The conveyor belt between them reverses direction briefly.
- This visually communicates the review-fix-review cycle without requiring the user to read log output.

**Completion celebration.** When the run completes successfully:

- All agents transition to celebrating (bounce animation).
- Confetti particles rain down from the gantry rail.
- The orchestrator does a small victory dance.
- A summary card fades in above the factory showing key metrics: total duration, artifacts produced, review iterations, finding counts.
- A subtle two-note chime plays (optional, via Web Audio API synthesis as described in the pixel-agents analysis).

**Failure indication.** When the run fails:

- The failed station's platform flashes red.
- The affected agent transitions to concerned state.
- A warning icon appears on the gantry rail.
- The factory's ambient lighting shifts to a darker red-tint.
- The summary card shows the failure reason prominently.

---

## User-flow examples

### Flow 1: "How's the run going?"

The developer glances at the factory while working in their IDE. They see:

1. The orchestrator is at station 4 (review) -- three reviewer agents are working (pulsing).
2. Stations 1-3 have resting agents with output artifacts on their shelves.
3. Stations 5-7 have idle agents.
4. The gate between stations 3 and 4 is open; gates 4-5, 5-6, 6-7 are closed.

**Interpretation without reading anything**: the run is in the review phase. Architecture, planning, and implementation are done. Review is underway. No failures visible.

The developer wants slightly more detail. They hover over the orchestrator: a tooltip shows "Run R-20260313-001 | In progress | 4m 32s elapsed | Phase: review." Good enough -- they return to their IDE.

### Flow 2: "What did the reviewer find?"

The run is complete. The developer opens the factory and sees all agents celebrating. They want to understand what the reviewers found.

1. They click the review station sign. A panel opens showing: "3 reviewers, 1 review round, aggregated criticality: low."
2. They see three artifact tiles on the review station's output shelf: `code-review`, `silent-failure-review`, `test-review`. Each is red-tinted (the review artifact color).
3. They click `code-review`. The vault opens showing:
   - Summary: "0F 1W 0T 2R 1S 0L"
   - One warning finding: "Unbounded array growth in event log -- consider a ring buffer." File: `src/shared/event-folder.ts`, line 42.
   - Two refactor findings, one style finding.
4. They click the file reference in the warning finding. The vault navigates to the code change-summary artifact, scrolled to `event-folder.ts`, with the relevant lines highlighted.

### Flow 3: "What changed between code v1 and v3?"

The run had two review-fix cycles. The developer wants to see what the fix cycles changed.

1. In the factory, they notice the implementation station has three artifacts stacked: `code v1`, `code v2`, `code v3`. The v2 artifact has an amber tint, v3 has orange.
2. They click the `code v3` artifact. The vault opens showing the v3 change-summary.
3. They see the version carousel at the top: tabs for v1, v2, v3.
4. They click v1 to see the original code changes.
5. They click "Compare" and select v1 vs v3. A two-pane diff view appears showing exactly what changed across the fix cycles: files that were modified, additions and removals.
6. They can see that the v2 fix addressed the code-review warning about unbounded array growth, and the v3 fix addressed a test gap identified by the test reviewer.

### Flow 4: "Why was architecture skipped?"

The developer notices that the architecture station is dimmed (absent/skipped). They hover over the station sign: tooltip shows "Skipped: impact classified as none." They click for more detail and see the phase decision: "Architecture phase skipped because the orchestrator classified the change impact as 'none' -- this is a documentation-only change."

### Flow 5: "I want to replay what happened at 2x speed"

Post-mortem mode. The developer clicks the play button. The timeline scrubber starts moving. The factory animates through each state transition: agents appear, start working, artifacts fly through chutes, gates open. At 2x speed, the entire run replays in under a minute. They notice something interesting at the review phase and click pause. They drag the scrubber back a few events to re-watch the review station expansion. They click the timeline dot labeled "review-started" and the factory snaps to that exact state.

---

## Risks and mitigations

### Risk 1: Performance at scale

**Risk**: With 5-10 agents, 20-50 artifacts, chute animations, conveyor belt particles, and a vault rendering markdown/diffs, the scene could become slow -- especially on lower-end machines or when multiple artifact panels are transitioning simultaneously.

**Mitigation**: The existing Excalibur architecture already handles this concern partially through its built-in actor management and frame-rate throttling. Specific additional mitigations:

1. **Artifact tiles are static after landing** -- no per-frame update cost. Only the 1-2 active chute animations and the orchestrator's movement require per-frame computation.
2. **Conveyor belt particles use a pooled particle system** -- a fixed pool of 20-30 particles recycled across all belts, not individually allocated.
3. **The vault renders outside Excalibur** -- it is a React component layered over the canvas. React's virtual DOM diffing handles content updates efficiently. Syntax highlighting and markdown rendering use lazy loading (only parse when the vault is opened).
4. **Zoom-level-based LOD (level of detail)**: when zoomed out to see the full pipeline, artifact labels are hidden and tiles are simplified rectangles. Tooltip hit testing is disabled below a zoom threshold. At maximum zoom (single station), full detail is shown.
5. **Sprite caching is already implemented** -- animations are cached per role type in module-level maps, avoiding recomputation.

### Risk 2: The vault could fragment the experience

**Risk**: Opening the artifact vault creates a mode switch -- the user goes from "watching the factory" to "reading a document." This could feel jarring, as if the visualization and the content are two separate applications stapled together.

**Mitigation**: The vault is designed to maintain spatial continuity with the factory:

1. **Spatial anchoring**: the vault slides up from below the specific station where the artifact was produced. A thin colored line connects the artifact tile to the vault header, visually linking them.
2. **Factory remains visible**: the vault occupies the bottom 60% of the screen, pushing the factory up but keeping it visible at the top. The user can still see the overall pipeline state.
3. **Dismissal is fast**: `Escape` or clicking outside the vault closes it immediately. There is no navigation required to "get back" to the factory.
4. **Consistent visual language**: the vault uses the same CGA-16 palette, the same artifact type colors, and the same role-type colors as the factory scene. It does not look like a different application.
5. **Progressive disclosure**: tooltips handle the first level of inspection (hover for metadata). The vault is only needed for deep reading. Most interactions stay at the hover level.

### Risk 3: Excalibur canvas click handling vs. React overlays

**Risk**: Click targets in the Excalibur canvas (artifact tiles, agents, stations) and React overlays (vault, drawers, tooltips) need to coexist without interference. Pointer events must route correctly to canvas actors when the vault is closed, and to React components when overlays are open.

**Mitigation**:

1. Canvas click handling uses Excalibur's built-in `pointer.on('pointerdown')` on individual actors. The game engine manages its own hit testing.
2. React overlays use `pointer-events: auto` and standard DOM event handling. When the vault is open, the canvas area above it gets `pointer-events: none` to prevent accidental clicks on canvas actors through the overlay.
3. The communication boundary is a simple callback: canvas actors dispatch events upward via a shared event emitter (not React state), and the React layer subscribes to these events to open/close panels. This matches the existing architecture where "Excalibur owns the game canvas and all visual state. React owns UI chrome."

---

## Assumptions

1. **Artifact content is available via the API.** The current server reads `run-index.json` files, which contain artifact metadata (filename, type, phase, etc.) but not artifact content. This vision assumes a new API endpoint (e.g., `GET /runs/:runId/artifacts/:filename`) that serves the actual artifact file content. Without this, the vault cannot render real diffs, plans, or review findings.

2. **The CanonicalRunStatus type will be extended** to include optional timing data per phase (startedAt, completedAt) and per-artifact usage metrics (tokens, tool uses). Some of these fields already exist on the type but are not consistently populated. The vision assumes they will be reliably present for all phases.

3. **5-10 agents and 20-50 artifacts is the realistic ceiling** for a single run. The layout system does not need to handle 50+ agents or 200+ artifacts. If runs grow significantly larger, the architecture would need virtualization (only rendering visible stations).

4. **Review findings use the F/W/T/R/S/L scheme consistently.** The vault's structured finding display depends on this scheme being reliably present in review artifacts. If review artifacts use free-form text instead, the vault falls back to plain markdown rendering.

5. **The existing Excalibur.js engine is retained.** This vision builds on the current tech stack (Excalibur + React + Express) rather than proposing a migration. Excalibur handles the factory scene rendering, React handles the vault and UI chrome, Express serves data. No new rendering libraries are needed.

6. **Playback speed controls and timeline scrubbing** extend the existing `PlaybackController` class, which already supports play/pause/step/speed adjustment. The scrubber adds a `seekTo(cursor: number)` method and exposes snapshot timestamps for timeline dot rendering.

7. **The factory visualization is viewed in a browser window** at least 1200px wide. The layout is not designed for mobile screens. At narrower viewports, the factory would degrade to a horizontally scrollable view, but vault panels and detail drawers may not render well below 1024px width.
