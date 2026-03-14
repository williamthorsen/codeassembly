# Vision D: The vertical facility

## Elevator pitch

The vertical facility reimagines the orchestration pipeline as a multi-level industrial complex where pipeline phases occupy distinct floors connected by catwalks, lifts, and pneumatic tubes. Work flows downward through the facility: analysis on the top floor, construction in the middle, review across a wide parallel inspection bay, and finalization at ground level. Artifacts travel through pneumatic capsules between levels. The orchestrator patrols via a central lift shaft, visible wherever it currently coordinates. Every station has a workbench with a glowing screen, a physical artifact shelf, a time-on-task indicator, and a thought bubble surfacing the agent's current status. The vertical dimension communicates hierarchy and dependency flow in a way flat layouts cannot: you see at a glance that review is "below" implementation, that the three reviewers occupy a wide parallel bay, that the bottom-floor stations are dark and waiting. This is not a dashboard. It is a place -- a sci-fi industrial facility rendered in steel, teal, and cyan pixel art that a developer can watch for hours.

---

## Layer 1: Metaphor and theme

### The multi-level facility

The visual metaphor is a cross-section of a vertical industrial building -- like looking at the side of a factory with its outer wall removed. Each floor is a catwalk platform with amber safety railings, steel cross-bracing underneath, and stations bolted to the platform surface. Pipes run through the background at varying depths, carrying teal-glowing fluid that gives the environment its ambient color. Lifts with amber rail guides connect levels on the right side. Pneumatic tubes carry artifact capsules between floors.

The four levels map to the pipeline's logical phases:

| Level         | Name     | Phases                        | Character                                                                                                                                                                     |
| ------------- | -------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 (top)       | Analysis | Architecture, Planning        | Quiet research floor. Two stations with completed agents resting. Stacked artifacts on shelves. Screens dim.                                                                  |
| 3 (mid-upper) | Build    | Implementation                | The workshop. One large station with the coder's workbench, active screen with a blinking cursor, v1/v2 artifact tiles stacked.                                               |
| 2 (mid-lower) | Review   | All parallel reviewers        | The wide inspection bay. Three stations side by side, each with a working reviewer, progress bars, and screens showing finding counts. The busiest floor during review phase. |
| 1 (bottom)    | Finalize | Simplifier, Holistic, Summary | Ground-level finishing stations. Currently dim and idle, waiting for review to complete.                                                                                      |

### Why the vertical dimension matters

Vertical space communicates something that horizontal layouts cannot: **dependency and flow direction**. Work falls through the facility like gravity -- analysis feeds construction, construction feeds review, review feeds finalization. When you look at the facility and see Level 2 lit up with active agents while Level 1 is dark, you understand instantly: "review is active, finalization is waiting." No legend required. The spatial arrangement encodes the pipeline's dependency graph.

The vertical layout also enables **spatial separation of parallel work**. Level 2's review bay can spread wide to accommodate three simultaneous reviewer stations without cramping adjacent phases. Each reviewer gets their own workbench, their own screen, their own progress bar. The parallelism is spatially obvious: three agents working side-by-side at the same altitude.

### Aesthetic direction

The palette avoids the dark-on-dark problem identified in round 1. The background is a layered misty teal (not black), with pipes at varying depths creating parallax-like depth. Platform surfaces are mid-tone steel and slate. Amber railings provide warm accents. Cyan is reserved for active screens, glowing tube fluid, and data indicators. Red appears only for fatal findings and failure states. The overall feeling is of a well-lit industrial interior, not a dark cave.

Key aesthetic details:

- **Textured surfaces.** Platforms have rivet patterns visible at close zoom. Workbenches have panel-line borders with dashed inner frames suggesting bolted inspection panels. Screens have faint scanline overlays.
- **Background depth.** Three parallax layers of pipes at decreasing opacity create depth without clutter. Floating cyan particles drift slowly through the air, suggesting industrial mist.
- **Warm anchors.** Amber railing posts, amber lift rails, and amber-bordered warning states prevent the teal/cyan scheme from feeling cold.

---

## Layer 2: Information architecture

### Progressive disclosure: glance, hover, click

This layer directly adopts Vision B's gold-standard information architecture and embeds it in the spatial world.

**Glance (zero interaction):**

- The facility itself communicates pipeline progress. Lit floors with working agents = active phases. Dim floors with idle agents = pending phases. Bright screens = work happening. Dark screens = done or waiting.
- **Thought bubbles** float above every agent showing their current status: "Impact: low -- schema change only" (architect), "+142 -38 across 4 files" (coder), "Missing null check in event-folder.ts" (reviewer). These are the primary information channel.
- **Time-on-task indicators** sit next to each station: small timer badges showing elapsed time. Color-coded: cyan for normal, amber for warning (long), red-pulsing for excessively long.
- **Progress bars** on workbenches show phase completion percentage.
- **The timing strip** in the status bar shows proportional phase durations, revealing bottlenecks at a glance.
- **Notification badges** pulse and glow near stations when critical findings emerge: "Fatal finding: null check -- code-reviewer" draws the eye with red pulsing animation.
- **Blocking relationships** are visible as dashed amber lines connecting dependent elements, with a clock icon showing what is being waited on.

**Hover (tooltip-level detail):**

- **Agent hover:** Role name, role type, phase, current animation state, full duration breakdown (started/completed/elapsed).
- **Artifact hover:** Filename, type (plan/code/review/summary), producing agent, iteration number, creation timestamp, size.
- **Station hover:** Phase decision (run/skip with reason), aggregate status, quality gate results (for implementation: typecheck/lint/tests pass/fail).
- **Screen hover:** Expanded view of the screen's content -- the three-line preview becomes a scrollable readout.
- **Orchestrator hover:** Run metadata (project slug, ticket ID, branch, task description), overall status, total elapsed time.
- **Timer hover:** Detailed timing: phase started at HH:MM:SS, elapsed time, estimated remaining (if calculable from historical runs).
- **Notification hover:** Full finding text with severity badge, file reference, and affected code region.

**Click (deep inspection):**

- **Artifact click:** Opens the info panel (right-side drawer) with full artifact content. Plans render as formatted markdown. Code diffs render with syntax-highlighted +/- lines. Review findings render as structured lists with F/W/T/R/S/L severity badges, file references, and descriptions.
- **Agent click:** Opens agent detail view showing all artifacts produced, timing breakdown, usage metrics.
- **Station click:** Opens station summary showing all artifacts at this phase in chronological order, with phase lifecycle mini-timeline.
- **Notification click:** Opens directly to the finding detail in the info panel, pre-filtered to show that specific finding.

### Artifact versioning and comparison

When an artifact has multiple iterations (fix cycles), the artifact tiles stack on the workbench with version badges (v1, v2, v3). The v2+ badges use amber-tinted backgrounds to signal iteration. Clicking opens the info panel with a version carousel. A "Compare v1 vs v3" button opens a side-by-side diff. This directly mirrors Vision B's approach but expressed through physical stacked objects rather than UI tabs.

### Review findings architecture

The info panel renders review findings with Vision B's structured format:

1. **Summary row:** Total findings by severity (0F, 2W, 1T, 3R, 1S, 0L) with colored badges.
2. **Per-finding cards:** Each finding shows severity badge, description, file reference (clickable), and resolution status.
3. **Cross-references:** Clicking a file reference in a finding navigates to the corresponding section of the code diff.

---

## Layer 3: Interaction model

### Primary interaction: observe

The fundamental interaction is **watching**. The facility is alive: agents work at stations, pneumatic capsules travel through tubes, the lift moves between levels, particles drift through the air, screens flicker with code. The developer observes this activity in their peripheral vision while working in their IDE. When something interesting happens -- a notification pulses, a new agent activates, an artifact drops -- their attention is drawn naturally.

### Secondary interaction: hover to preview

Hovering any element in the facility produces a tooltip with the most relevant 2-3 lines of information. Tooltips appear after 200ms and dismiss immediately. They are positioned to avoid occluding the hovered element. Hover never changes the scene state -- it is purely additive.

### Tertiary interaction: click to inspect

Clicking opens the info panel (right-side drawer) with full content. The panel has a header (element name, type, status), a metadata section (key-value rows), and a content section (findings, diffs, plans). Only one panel is open at a time. Escape or the close button dismisses it. The facility continues animating behind the panel.

### Navigation

- **Scroll/pan:** Mouse wheel or trackpad scrolls the facility vertically. Arrow keys pan. The facility is tall enough that all four levels may not fit on screen simultaneously at full zoom -- scrolling reveals the full building.
- **Zoom:** Pinch or mouse wheel with modifier zooms in/out. At minimum zoom, the entire facility fits on screen (overview mode). At maximum zoom, one station fills the viewport (inspection mode).
- **Minimap:** A small schematic in the bottom-right corner shows all four levels as rows with colored dots for agents. The currently visible region is highlighted. Clicking a level in the minimap scrolls to that level.
- **Keyboard shortcuts:** 1-4 jump to levels. Escape closes panels. Space pauses/resumes playback.

### Live vs. post-mortem modes

**Live mode:** The facility updates in real-time. New agents fade in. Artifact capsules travel through tubes. The orchestrator rides the lift between levels. The camera follows the active floor unless manually scrolled. A "Follow activity" toggle re-engages auto-scrolling.

**Post-mortem mode:** The facility loads in its final state. A timeline scrubber at the bottom allows replaying the run. Dragging the scrubber rewinds/advances the facility state: agents appear/disappear, artifacts materialize/vanish, levels light up/dim. The existing PlaybackController drives this.

---

## Layer 4: Delight and engagement

### What makes it a world

The vertical facility is not a diagram with decorations. It is a place with architecture:

- **Structural detail.** Platforms have visible thickness (12px steel with highlighted top edge and shadowed bottom). Cross-bracing patterns underneath suggest real structural support. Rivet patterns reward close inspection.
- **Environmental atmosphere.** Background pipes at three depth layers create parallax-like depth. Floating cyan particles suggest industrial mist or coolant vapor. The top of the viewport has a subtle teal mist fade. The bottom has a deeper shadow.
- **Mechanical motion.** The lift car moves continuously between levels (even when not carrying anything -- it is part of the facility, not just a data transport). Conveyor rollers turn. Pneumatic tube capsules travel in pulses.
- **Sound potential.** (Optional, toggle-able) Ambient industrial hum. Subtle clicks when phases complete. A pneumatic "whoosh" when capsules travel. A low warning tone for fatal findings.

### What makes it watchable for hours

The Civilization insight applies directly. The developer is a facility governor:

1. **Issue directives.** Start a run. The facility powers up -- lights come on level by level, agents walk to their stations.
2. **Watch minions execute.** The architect studies the screen, produces an artifact, which travels via pneumatic tube down to the planner. The planner produces a plan, which travels down to the coder. The coder works (screen flickering rapidly), produces v1 code. The lift carries it down to the review bay. Three reviewers activate simultaneously.
3. **See results at the right level.** Thought bubbles show "Impact: low," "4 steps planned," "+142 lines." The timing strip fills proportionally. You know what happened without reading.
4. **Interesting things surface themselves.** A reviewer's thought bubble turns red: "Fatal: missing null check." A notification badge pulses. Your eye is drawn. You did not go hunting.
5. **Drill down if you choose.** Click the notification to see the finding detail. Read the diff. Or don't -- the bubble told you enough.
6. **The world keeps moving.** While you read the finding, the other two reviewers continue working. Progress bars advance. The facility is alive.

### Specific delight moments

**Pneumatic tube delivery.** When a phase completes and its artifacts need to travel to the next level, a small capsule (colored by artifact type) enters the tube at the source level and travels downward to the destination level with a smooth animation. At arrival, it "pops" out of the tube at the destination station.

**Review bay activation.** When the review phase starts, Level 2 (previously dim) lights up simultaneously -- three stations power on, screens glow, agents appear. The spatial expansion of "one active floor going to three parallel stations" visually communicates parallelism.

**Fix cycle loop.** When review triggers a fix cycle, the lift carries a capsule upward from Level 2 to Level 3 (review bay to build floor). The coder reactivates. A new version badge (v2) appears on the artifact stack. The coder produces the fix, and the artifact travels back down to the review bay. The visual loop -- down, up, down -- makes the iteration cycle physically legible.

**Completion cascade.** When the run completes, a wave of celebrating agents ripples from Level 1 upward through the facility. Each agent transitions to its bounce animation as the wave reaches their floor. The entire facility is briefly alive with celebration before settling into a calm completed state.

**Failure indication.** When a phase fails, the platform flashes red. The agent transitions to concerned. The station's screen displays an error. The facility does not shut down -- it stays visible with the failure clearly localized. Adjacent floors are unaffected, making the failure's scope immediately clear.

---

## Mandatory developer questions

### "What are my minions up to right now?"

**Disclosure level: Glance.** Each agent has a thought bubble showing their current activity. Working agents animate (arms move). Their screens show abbreviated status. The minimap shows colored dots with active-pulse on working agents. At a glance, you see: architect resting (done), planner resting (done), coder resting (done, v2), three reviewers working (arms animating, screens flickering, thought bubbles showing current focus).

### "What are they stuck on?"

**Disclosure level: Glance.** Stuck agents surface themselves. A concerned-state agent shakes its head. A long-running timer turns amber, then red with a pulsing glow. A notification badge appears near the station: "Fatal finding: null check -- code-reviewer." The orchestrator's thought bubble shows "Waiting for 3 reviewers..." in amber. You see problems without looking for them.

### "What code have they produced and what problems have they solved?"

**Disclosure level: Glance (what) + Click (details).** Artifact tiles are visible on each workbench. The coder's station shows two stacked tiles (v1, v2) with the thought bubble reading "+142 -38 across 4 files." Version badges indicate fix cycles occurred. **Click** an artifact tile to open the info panel with full diff content, syntax-highlighted with +/- lines.

### "How long has each one spent on task?"

**Disclosure level: Glance.** Timer badges sit next to every station. "0:48" (architect, cyan). "1:12" (planner, cyan). "3:00" (coder, cyan). "2:30" (code-reviewer, amber -- it is taking a while). The timing strip in the status bar shows proportional durations: the implementation segment is visually widest. No interaction needed.

### "Who is waiting for whom?"

**Disclosure level: Glance.** Blocking relationships are shown spatially: the orchestrator's position near Level 2 with an amber thought bubble ("Waiting for 3 reviewers...") and a dashed amber line connecting the three reviewer stations shows the dependency. The bottom floor (Level 1) being dim and idle makes it obvious: finalization waits for review. The clock icon on the blocking line reinforces this.

### "Where is the friction and waste in the process?"

**Disclosure level: Glance (overview) + Hover (detail).** The timing strip in the status bar is proportional to duration -- the widest segment is the bottleneck. Timers on stations that turn amber/red signal unexpected delays. If the review phase triggers multiple fix cycles (the lift carrying capsules up and down repeatedly), the back-and-forth motion itself communicates rework. **Hover** any timer or timing strip segment for exact durations.

---

## User-flow examples

### Flow 1: "How's the run going?"

The developer glances at the facility tab while working in their IDE. They see:

1. Levels 4 and 3 are calm -- agents resting, artifacts stacked, screens dim.
2. Level 2 is alive -- three reviewer agents working at side-by-side stations, arms animating, screens flickering with finding counts.
3. Level 1 is dark and idle -- finalization stations are waiting.
4. The orchestrator is positioned near Level 2, thought bubble reading "Waiting for 3 reviewers..."
5. The timing strip shows review taking significant time (wide red segment).
6. Total elapsed: 8m 42s.

**Interpretation without reading anything:** The run is in review. Earlier phases completed. Finalization is next. No action needed. The developer returns to their IDE. Total time: 2 seconds.

### Flow 2: "A reviewer found something critical"

The developer notices a red-pulsing notification on Level 2: "Fatal finding: null check -- code-reviewer."

1. They see the code-reviewer's thought bubble has turned red: "Missing null check in event-folder.ts."
2. They click the notification. The info panel opens showing:
   - Severity: F (Fatal), red badge.
   - Description: "Missing null check on `eventLog` parameter before iteration."
   - File: `src/shared/event-folder.ts:42`.
   - Below: the code diff showing the fix (v2 added the null guard).
3. They see the finding is already addressed (v2 artifact exists on the coder's workbench upstairs). They close the panel and return to their work.

**Total interaction:** Notice (glance) + click (1 click) + read (10 seconds) + close (Escape).

### Flow 3: "Replaying a completed run to find the bottleneck"

The developer opens a completed run. The facility loads fully lit, all agents celebrating.

1. They look at the timing strip: implementation is the widest segment (3:00), followed by review (2:30). Architecture and planning were fast.
2. They want to understand why implementation took 3 minutes. They hover the timer: "Implementation: 3:00 (2 iterations -- original + fix cycle)."
3. They click the coder's v1 artifact. The info panel shows the original diff: 4 files, +142 -38. They switch to v2 and see the fix: null check added, test coverage added.
4. They use the timeline scrubber to replay the run. They watch the facility power up level by level, see the coder work, see artifacts travel down to review, see the fatal finding appear, see the capsule travel back up to the coder, see v2 produced, see it travel back down.

**Conclusion:** The bottleneck was a missing null check that triggered a fix cycle. Without the fix cycle, the run would have been under 7 minutes. The developer adds a note to improve their coding patterns.

---

## Risks and mitigations

### Risk 1: Vertical layout may not fit all levels on screen simultaneously

Unlike horizontal layouts where the full pipeline can stretch across a wide monitor, a vertical layout on a standard 1080p monitor may not show all four levels at once without making each level too small to read.

**Mitigation:** Three strategies. First, semantic zoom: at minimum zoom, all four levels are visible with simplified stations (just colored blocks and agent dots). At medium zoom, station details (screens, artifacts, timers) become visible. At maximum zoom, one level fills the screen with full detail. Second, the minimap provides persistent orientation regardless of zoom level -- you always know which level you are looking at. Third, the facility is designed with three usable zoom presets: "full facility" (overview), "active floor" (focused on the level where work is happening), and "station detail" (single station). The camera auto-focuses on the active level during live runs.

### Risk 2: Vertical flow may feel unfamiliar compared to left-to-right pipelines

Developers are accustomed to horizontal pipeline visualizations (CI/CD, git graphs). A vertical facility reverses this convention.

**Mitigation:** The vertical dimension is not arbitrary -- it communicates something meaningful (hierarchy, dependency, gravity of work flowing downward). The status bar's timing strip remains horizontal, providing familiar left-to-right phase sequencing. Level labels ("L4 Analysis," "L3 Build," "L2 Review," "L1 Finalize") provide clear orientation. User testing may reveal that the vertical layout requires a brief learning period, but the payoff -- spatial separation of parallel reviewers, visual gravity of work flow, architectural richness -- justifies the investment. If vertical proves genuinely disorienting, the layout can be rotated to horizontal while preserving all other design elements.

### Risk 3: Performance with many animated elements

The facility has many simultaneous animations: agent arm movements, screen flickering, lift motion, pneumatic capsule travel, conveyor belt scrolling, floating particles, pulsing notifications, timer updates.

**Mitigation:** Animations are categorized by necessity: essential (agent state, timers, notifications), ambient (particles, conveyor belts, lift), and decorative (screen flickering, rivet highlights). Ambient and decorative animations can be paused when the tab is in the background (using `requestAnimationFrame` which pauses naturally when the tab is hidden). Particle count is capped at 12. Conveyor belt animations use CSS `animation` (GPU-composited) rather than JavaScript-driven updates. The lift uses a single CSS animation. Excalibur's built-in frame-rate management handles the canvas-rendered elements. The React info panel renders outside the game canvas, avoiding canvas redraw when panel content changes.

---

## Assumptions

1. **The Excalibur + React + Express stack is retained.** This vision builds on the existing architecture. Excalibur renders the facility scene (platforms, agents, tubes, lifts, artifacts). React renders the info panel, status bar, and minimap. Express serves run data and artifact content.

2. **Artifact content will be available via API.** The info panel's diff viewer and findings list require artifact content accessible via an endpoint like `GET /runs/:runId/artifacts/:filename`. The current system serves metadata but not content.

3. **The facility viewport can handle vertical scrolling.** The Excalibur camera already supports panning. Vertical scroll mapping to camera Y-position is a straightforward extension.

4. **Runs have at most 10 agents and 50 artifacts.** The four-level layout is designed for this scale. Each level can accommodate 2-4 stations. The review level can expand to show up to 4 parallel reviewers. Larger runs would need level consolidation or sub-level scrolling.

5. **Review findings use the F/W/T/R/S/L severity scheme consistently.** The notification system and findings renderer depend on parsed severity levels. If findings are free-form markdown, the panel falls back to plain text rendering.

6. **The playback controller supports vertical camera tracking.** For post-mortem scrubbing, the camera needs to follow activity between levels. The existing PlaybackController's snapshot model is extended with camera target positions per snapshot.

7. **A 1200px+ viewport width is assumed.** The facility layout fills the width with stations, railings, and infrastructure. The info panel occupies the right 260px as an overlay. Narrower viewports would require the panel to overlay the full width.
