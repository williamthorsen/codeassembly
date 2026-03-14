# Vision C: The mission timeline

## Elevator pitch

The mission timeline synthesizes NASA mission control's channel-strip telemetry, music DAW multi-track timelines, and Figma's multiplayer presence indicators into a horizontally scrolling, time-anchored visualization where each pipeline phase is a "track" and artifacts are events on that track. The result is a living document that feels like watching a recording session unfold -- you see who is working, what they produced, and when, all in a single scannable view that rewards both glancing and deep inspection. Time is the first-class axis: left is past, right is future, and the playhead is now.

## Sources and synthesis

### Source 1: Music DAW multi-track timelines (Ableton Live, Logic Pro)

**What I'm borrowing:** The horizontal multi-track layout where each track represents a distinct voice/instrument (here: a pipeline phase), events are blocks on that track with variable width proportional to duration, and a playhead sweeps left-to-right showing the current moment. The transport bar (play/pause/scrub/speed) is directly lifted.

**Why it works here:** CodeAssembly's pipeline is inherently sequential-with-parallelism -- exactly like a multi-track recording. Architecture runs first, then planning, then implementation, then multiple reviewers fire simultaneously (like a chord across tracks), then simplification, holistic review, and summary. A DAW layout makes this temporal structure immediately legible. Parallel reviewers appear as stacked sub-tracks within the "review" track group, just as a DAW groups drum tracks.

### Source 2: NASA/SpaceX mission control telemetry

**What I'm borrowing:** The concept of "channels" with live status indicators, the Go/No-Go gate ceremony, and the calm-but-information-dense aesthetic of flight controller screens. Each phase has a status badge (idle / active / passed / failed) reminiscent of a controller's station readout. The phase-transition "gates" from the existing Factory codebase map perfectly to Go/No-Go calls.

**Why it works here:** An orchestrated development run IS a mission. There's a sequence of critical phases, gates between them, a central coordinator (orchestrator), and a real possibility of abort. The mission-control metaphor gives weight to the process without being silly -- it says "this matters, we're tracking it carefully."

### Source 3: Figma's multiplayer presence and cursor indicators

**What I'm borrowing:** Named, color-coded presence indicators that show who is active and where they're working. In Figma, you see labeled cursors moving across the canvas. Here, each agent gets a small avatar pill on its track that pulses when active, with a tooltip showing the agent's role and current status. The orchestrator's presence moves between tracks, visually delivering artifacts -- like watching a Figma collaborator jump between frames.

**Why it works here:** The run involves 5-10 agents, each with a role type that maps to a color. Seeing their presence on the timeline makes the abstract pipeline feel alive and inhabited. It answers "who is doing what right now?" at a glance.

### The synthesis

None of these three metaphors alone would work. A pure DAW gives you time but not operational status. Pure mission control gives you status but no temporal context. Pure Figma presence gives you "who" but not "what happened." The mission timeline layers all three: the DAW provides the spatial backbone (time x tracks), mission control provides the status semantics (gates, Go/No-Go, phase health), and Figma presence provides the human(oid) element (agents moving, working, producing).

---

## Layer 1: Metaphor and theme

**Visual world:** The user inhabits a mission control room watching a multi-channel timeline recorder. The overall aesthetic is dark-background, high-contrast, with the CGA-16 palette providing the accent colors. Think "retro-futurism" -- CRT green/amber glows on a dark field, monospaced type for data, but with modern layout and interaction polish.

**How the metaphor maps to the pipeline:**

| Pipeline concept              | Metaphor element                                      |
| ----------------------------- | ----------------------------------------------------- |
| Pipeline phases               | Horizontal tracks (rows) stacked vertically           |
| Phase sequence                | Left-to-right temporal flow                           |
| Parallel reviewers            | Sub-tracks within the "review" track group            |
| Artifacts                     | Event blocks on tracks, color-coded by type           |
| Gates between phases          | Vertical "Go/No-Go" markers between track regions     |
| Orchestrator                  | A roving presence indicator that moves between tracks |
| Run status                    | A master status panel (mission clock + outcome badge) |
| Review findings (F/W/T/R/S/L) | Severity-coded pins on review track events            |

**Why it makes data legible:** Time is the most natural axis for understanding "what happened during this run." By anchoring everything to a timeline, the user immediately grasps sequence, duration, parallelism, and bottlenecks. The track structure groups related information (all review activity lives in adjacent sub-tracks) while maintaining phase ordering.

---

## Layer 2: Information architecture

### Hierarchy of information (overview to detail)

**Level 0 -- Glance (mission status bar):**
A persistent top bar shows: project name, ticket ID, run ID, total elapsed time, current status badge (with animated pulse for in-progress), and a miniature progress indicator showing which phases are complete / active / pending. This is the "can I ignore this?" layer.

**Level 1 -- Scan (timeline overview):**
The main view is the multi-track timeline. Each track is a horizontal lane labeled with its phase name and role-type color. Completed phases show filled blocks; the active phase shows an animated block growing rightward; future phases show ghosted placeholder blocks. Gates appear as thin vertical dividers between phase regions with a checkmark (passed) or lock (pending) icon.

Artifacts appear as small labeled chips within or below their phase's track block. Color-coded by artifact type (using the existing `ARTIFACT_COLORS` mapping). Hovering shows a tooltip with artifact metadata; clicking opens the artifact drawer.

**Level 2 -- Focus (artifact drawer):**
Clicking any artifact chip slides open a right-side drawer (like VS Code's secondary sidebar) showing the artifact's full content. For code diffs: a syntax-highlighted diff view. For review findings: a structured list with severity badges (F=red, W=orange, T=yellow, R=blue, S=gray, L=dim). For plans: rendered markdown. The drawer has tabs if multiple artifacts are selected for comparison.

**Level 3 -- Deep dive (diff comparison):**
Within the artifact drawer, a "Compare versions" control appears when an artifact has multiple iterations (v1, v2, v3). Selecting two versions shows a side-by-side or unified diff. This surfaces directly from the `version` field on `StationArtifactConfig`.

### How artifacts surface

Artifacts are not hidden behind menus. They appear directly on the timeline as visible, clickable elements:

- **Plans** (architecture, planning): Blue-green chips with a document icon
- **Code** (change-summary): Yellow chips with a code icon
- **Reviews** (reviewer findings): Red/orange chips with severity indicator dots (showing count and max severity at a glance)
- **Summary**: White chip at the end of the timeline

Review findings are especially important. Each review artifact chip shows a "severity strip" -- a thin bar with colored segments proportional to finding counts (F|W|T|R|S|L), so you can see at a glance whether a review produced fatals or just style nits.

### Comparing code across iterations

When the implementation phase has been re-entered (v2, v3+), the timeline shows stacked artifact chips at the implementation track. These chips are offset vertically and connected with a thin line showing the iteration sequence. Clicking any two chips and pressing "Compare" opens the diff comparison view. The iteration badge from the existing `codeBadge` system is preserved and displayed prominently.

---

## Layer 3: Interaction model

### Primary interaction: Timeline navigation

- **Scroll horizontally** to move through time (trackpad, scroll wheel with shift, or drag on the timeline ruler)
- **Click on any track block** to highlight that phase and show its details in a summary popover
- **Click on any artifact chip** to open the artifact drawer with full content
- **Drag the playhead** to scrub through time (for completed runs in playback mode)

### Secondary interaction: Transport controls

A transport bar at the bottom provides DAW-style controls for completed runs:

- Play / Pause / Stop
- Step forward / backward (one event at a time)
- Speed control (0.25x to 32x, matching existing `PlaybackController`)
- Scrub bar (click anywhere on the timeline ruler to jump)

For live runs, the playhead auto-advances and the view auto-scrolls to keep the current activity visible (with a "pin to live" toggle, like a log viewer).

### Hovering

- **Track label:** Shows agent details (role, role type, current state)
- **Artifact chip:** Shows artifact metadata (type, phase, agent, iteration, filename)
- **Gate marker:** Shows gate status and which phases it separates
- **Severity strip on reviews:** Shows finding count breakdown

### Keyboard shortcuts

- Space: play/pause
- Left/Right arrows: step forward/backward
- +/-: speed up/slow down
- Escape: close artifact drawer
- 1-7: jump to phase by number

### Zoom

- **Zoom in/out** on the timeline to see more or less temporal detail. At maximum zoom-out, the entire run fits on screen (overview). At maximum zoom-in, individual events and their timing are visible with sub-second precision.

### Tracing a finding to its resolution

The user clicks a review finding with severity "F" (fatal). The artifact drawer opens showing the finding detail. A "Trace" button follows the finding through iterations: it highlights the implementation v2 artifact that addressed this finding, and the re-review artifact that cleared it. Lines connect the related artifacts across tracks, showing cause-and-effect flow.

---

## Layer 4: Delight and engagement

### What makes it fun to watch

**The playhead sweep:** During a live run, the playhead moves smoothly rightward. Phase blocks grow in real-time, like audio being recorded. There's a subtle glow effect around the active track -- a CRT-phosphor-style bloom that makes the active phase visually magnetic without being distracting.

**Agent presence animations:** Agent presence pills on tracks have subtle idle animations -- a gentle breathing pulse when working, a celebratory sparkle when their phase completes, a warning flash when something goes wrong. These use the existing animation state vocabulary (idle/working/celebrating/concerned) but expressed as micro-animations on pill-shaped indicators rather than full sprite characters.

**Gate ceremonies:** When a phase completes and a gate opens, there's a brief satisfying animation: the gate marker transitions from a locked state (dim, with a lock icon) to an open state (bright, with a checkmark) with a small radial burst in the phase's role-type color.

**Artifact arrivals:** When a new artifact appears on the timeline, it doesn't just pop in -- it slides in from the left edge of the next phase's track (representing the orchestrator delivering it), with a brief luminous trail. This mirrors the existing "carried artifacts" and "chute" choreography from the catwalk visualization but translates it to the timeline metaphor.

**Sound design (optional):** Subtle synthesized audio cues: a soft click when a gate opens, a gentle chime when a phase completes, a low tone for fatal findings. All togglable. This borrows from pixel-agents' synthesized audio feedback approach.

### What makes a developer want to keep it open

**Information density without noise:** Unlike the purely decorative current visualizations, the timeline always shows useful information. The developer can glance at it and know: how far along the run is, whether there are problems, and how long each phase took. It earns its screen real estate.

**The "recording studio" feel:** Watching agents work on tracks feels like watching a collaborative recording session. There's an inherent satisfaction in watching the timeline fill up with completed work -- like watching a progress bar, but one that tells a story.

**Post-mortem value:** For completed runs, the timeline is a genuine analysis tool. You can see which phase was the bottleneck, how many review iterations occurred, what findings were raised and how they were resolved. This makes it worth opening even after the run is done.

---

## User-flow examples

### Flow 1: "How's the run going?"

The developer has a run in progress and wants a quick status check.

1. They glance at the mission status bar: "in_progress, 4m 32s elapsed, phase: review"
2. They see the timeline: architecture, planning, and implementation tracks have filled blocks. The review track has three sub-tracks (parallel reviewers) with growing blocks -- reviewers are active.
3. The orchestrator presence pill is visible on the review track region, pulsing to indicate it's coordinating.
4. Future phases (simplifier, holistic, summary) show ghosted placeholders.
5. Total time investment: 2 seconds of looking.

### Flow 2: "What did the reviewer find?"

The developer wants to inspect review findings after a completed run.

1. They scroll to the review region of the timeline (or press "4" to jump to the review phase).
2. They see three reviewer sub-tracks, each with an artifact chip. One chip has a red severity strip (indicating a fatal finding).
3. They click that chip. The artifact drawer slides open showing:
   - Finding: "Missing error handling in payment processor" [F - Fatal]
   - Finding: "Test coverage gap for edge case" [T - Test gap]
   - Finding: "Variable naming inconsistency" [S - Style]
4. They click the [F] finding to expand it. Full details render: description, affected files, suggested fix.
5. They click "Trace resolution" to see how it was addressed. The timeline highlights the implementation v2 chip and the re-review chip, connected by a trace line.

### Flow 3: "What changed between code v1 and v3?"

The developer wants to understand the evolution of the implementation across review cycles.

1. They look at the implementation track. Three artifact chips are visible: v1, v2, v3, stacked with connecting lines showing the iteration sequence.
2. They click v1, then shift-click v3. The artifact drawer opens in comparison mode.
3. The drawer shows a side-by-side diff: left is v1's change-summary, right is v3's change-summary.
4. Below the diff, a "delta summary" shows what changed between the two: files added/modified/removed, net lines changed.
5. They can also click the review artifacts between v1 and v3 to see which findings drove the changes.

### Flow 4: "Which phase was the bottleneck?"

The developer wants to analyze run performance for a completed run.

1. They zoom out to see the entire timeline on screen.
2. Phase blocks are proportional to their duration. Implementation is clearly the widest block, followed by review (which shows three parallel sub-tracks running concurrently).
3. They hover over the implementation block: tooltip shows "Implementation: 8m 42s (3 iterations)".
4. They hover over the review block: tooltip shows "Review: 3m 15s (3 parallel reviewers, 2 iterations)".
5. The gate between review and simplifier shows "Opened after iteration 2" -- indicating one review cycle was needed.

---

## Risks and mitigations

### Risk 1: Timeline becomes too dense with many artifacts

With 20-50 artifacts across 7 phases and potentially 3+ review iterations, the timeline could become visually cluttered.

**Mitigation:** Implement a semantic zoom system. At low zoom levels, artifacts collapse into summary indicators (just the severity strip and count badge). At medium zoom, individual chips appear with labels. At high zoom, chips expand to show metadata. Additionally, track groups (like the reviewer sub-tracks) can be collapsed to a single summary row, expanding on click. The timeline ruler provides navigational context at all zoom levels.

### Risk 2: Departure from the existing game-engine aesthetic may feel like a regression

The current Excalibur-based visualizations have charm -- pixel sprites, arcade animations, spatial movement. A timeline-based approach might feel clinical by comparison.

**Mitigation:** Three strategies. First, retain the CGA-16 palette and retro-futuristic aesthetic (CRT glow effects, scanline overlays, monospaced type) to maintain visual continuity with the existing character. Second, agent presence indicators use animated pills that echo the sprite animation states (working pulse, celebrating sparkle, concerned flash), preserving the "agents are alive" feeling. Third, the existing Excalibur visualizations don't go away -- they become an alternative view mode (as they already are via the visualization registry). The timeline becomes the "information" view; the factory/catwalk remain the "ambient" views. The registry pattern (`visualizationRegistry`) already supports this switching.

### Risk 3: Rendering performance with real-time timeline updates

A continuously updating timeline with animations, glow effects, and potentially 50+ artifact elements could strain browser rendering.

**Mitigation:** Use HTML Canvas (via Excalibur's existing engine) for the timeline track rendering, with DOM overlays only for the interactive elements (tooltips, artifact drawer, transport controls). This is a hybrid approach: Canvas handles the visual-heavy timeline rendering efficiently, while React handles the content-rich panels where DOM semantics (text selection, accessibility, scrolling) matter. The existing architecture already separates Excalibur canvas from React chrome, so this is an extension of the current pattern, not a rewrite.

---

## Assumptions

1. **Artifact content will be accessible via the REST API.** The current system serves `CanonicalRunStatus` which includes artifact metadata (type, phase, agent, iteration) but not content. I assume the API will be extended with endpoints like `/runs/:runId/artifacts/:filename` that return artifact content (markdown, JSON, diffs). The data layer already knows artifact filenames from `run-index.json`.

2. **The existing tech stack is sufficient.** Excalibur.js can render the timeline tracks and animations. React handles the artifact drawer, status bar, and transport controls. Express serves artifact content. No new dependencies are needed, though the Excalibur scene would be a new visualization mode (registered alongside catwalk and factory-floor).

3. **Runs typically have 5-10 agents and 20-50 artifacts.** The design is optimized for this scale. For significantly larger runs (100+ artifacts), the semantic zoom system would need additional collapse strategies.

4. **Review findings will eventually have structured data accessible via the API.** Currently, review artifacts are markdown files. I assume they will be parseable into structured findings with severity, description, affected files, and resolution status, enabling the severity strip and finding-trace features.

5. **The playback controller's snapshot-based model is appropriate for timeline scrubbing.** The existing `PlaybackController` steps through `CanonicalRunStatus` snapshots. For timeline scrubbing, each snapshot maps to a point on the timeline, and the playhead position corresponds to the snapshot cursor.

6. **Users will access this primarily on desktop browsers with reasonable screen width (1200px+).** The timeline layout assumes horizontal space. On narrow screens, the timeline would need a condensed mode (which could collapse to a vertical list view -- but this is a secondary concern).

---

## Technical integration notes

### Fitting into the existing architecture

The mission timeline would be registered as a third visualization mode:

```typescript
export const visualizationRegistry: Record<string, VisualizationComponent> = {
  catwalk: CatwalkCanvas,
  'factory-floor': FactoryFloorCanvas,
  'mission-timeline': MissionTimelineCanvas,
};
```

The mapper would follow the established pattern:

```
CanonicalRunStatus → mapRunToTimeline() → TimelineSceneConfig → MissionTimelineScene
```

The `TimelineSceneConfig` would include:

- `tracks: TrackConfig[]` (one per phase, with sub-tracks for parallel reviewers)
- `events: TimelineEventConfig[]` (artifacts placed on tracks with temporal coordinates)
- `gates: GateConfig[]` (reused from existing types)
- `orchestratorPosition: { trackIndex: number; timePosition: number }`
- `playhead: { position: number; mode: 'live' | 'playback' }`

### New API endpoints needed

- `GET /runs/:runId/artifacts/:filename` -- serve raw artifact content
- `GET /runs/:runId/artifacts/:filename?format=html` -- serve rendered artifact content (markdown to HTML, diff to highlighted diff)

### Artifact drawer as React component

The artifact drawer would be a React component (not an Excalibur actor), communicating with the canvas via the existing decoupled pattern: the Excalibur scene emits events when an artifact is clicked, and the React layer responds by opening the drawer and fetching content.
