# The workshop floor: close enough to hear them think

## Elevator pitch

The workshop floor puts you shoulder-to-shoulder with your AI workforce. Instead of observing from mission control or scanning a timeline, you stand on the floor of a sci-fi industrial workshop where each agent works at a detailed, lived-in workbench: screens glow with real status data, thought bubbles reveal what the agent is reasoning about, shelves accumulate artifacts as physical objects, and a gentle ambient hum of progress pervades the scene. The camera is close. You see the rivets on the steel benches, the text on the monitors, the color-coded finding stacks growing on the review benches. When something goes wrong, you know immediately -- not because you checked a dashboard, but because the workshop told you: an amber klaxon pulses at a station, a thought bubble turns red, the orchestrator's routing board lights up with a blocking dependency. This is Vision B's information architecture -- progressive disclosure, zero-to-two-click artifact access, structured findings with severity badges -- embedded in a spatial world you can watch for hours.

---

## Layer 1: Metaphor and theme

### The world

You inhabit a single-level sci-fi industrial workshop, viewed from a slightly elevated 3/4 angle. The aesthetic is mid-tone steel and teal: brushed-metal workbenches with visible panel lines and rivets, teal-tinted ambient lighting reflecting off polished concrete floors, and the warm glow of amber safety railings and caution markings. This is not a dark void with bright sprites -- it is a textured, lived-in space with depth and warmth, comfortable for hours of ambient viewing.

Seven workstations are arranged in a gentle arc across the workshop floor, connected by a raised pneumatic delivery rail that curves overhead. Each station is a detailed workbench scene:

- A **monitor bank** (1-2 pixel-art screens) showing phase status, elapsed time, and summary metrics -- readable at the glance level.
- A **thought/speech bubble** floating above the agent, cycling through key information: current task, current finding, or waiting reason. This is the primary information channel.
- A **shelf unit** beside the bench where completed artifacts materialize as physical objects -- colored document blocks, code scrolls, review binders. They stack up visibly as work progresses.
- An **input tray** on the opposite side where incoming materials from the previous station arrive via the overhead rail.
- **Tool racks, cable bundles, and reference boards** -- decorative texture that rewards close looking and reinforces the "working craftsperson" feel.

The **orchestrator** is not stationed at a bench. It moves along a central routing board -- a large illuminated wall-mounted panel at the back of the workshop showing the pipeline flow. The routing board is the spatial equivalent of Vision B's timeline spine: it shows all seven phases, which are complete, which is active, and where blocking dependencies exist. When the orchestrator dispatches work, a pneumatic canister fires along the overhead rail from one station to the next.

### Why this metaphor works

The workshop floor maps to the pipeline because software development IS craft work: skilled workers at stations, each with specialized tools, producing artifacts that feed into the next station's work. The key insight is **intimacy**. Unlike a factory observed from above or a timeline read left-to-right, the workshop puts you close enough to read the thought bubbles, see what is on the screens, and notice when an agent pauses to think. This intimacy creates the "watching workers" feeling that makes Civilization compelling -- you feel like a governor walking the floor, not an analyst reading reports.

### Palette and aesthetic

- **Base surfaces:** Mid-tone steel (#5a6270), slate (#3d4654), brushed aluminum (#8a9199). Not dark-on-dark.
- **Floor:** Soft concrete with teal ambient reflection (#2d3a3f), lighter than previous visions' near-black backgrounds.
- **Ambient lighting:** Teal-cyan (#1a3a40 to #2d5960) as environmental glow, not as accent. Creates depth without darkness.
- **Screens and active elements:** Cyan (#55FFFF, #00AAAA) for monitor content, data displays, active indicators.
- **Warnings and railings:** Amber (#FFAA00, #CC8800) for safety rails, caution stripes, alert states.
- **Status indicators:** Green (#55FF55) for healthy/complete, red (#FF5555) for failures/fatal findings, amber for warnings.
- **Artifact objects:** The existing pastel palette (arch: #a5d8ff, plan: #b2f2bb, code: #fff3bf, review: #ffc9c9, etc.) as physical object colors.
- **Textured surfaces:** Visible rivets, cross-bracing, panel lines, hex-grid floor plates -- detail that reads as "industrial" without being cluttered.

---

## Layer 2: Information architecture

### Progressive disclosure embedded in space

**Glance level (no interaction):** The workshop communicates state through its spatial elements:

- **Agent animation states** at benches: working (arms moving), idle (standing still), celebrating (bouncing), concerned (red-tinted, hunched).
- **Thought bubbles** above each agent show the current task or key finding in 1-2 lines of text. These cycle every 4-6 seconds to show different facets of the agent's work. Fatal findings turn the bubble border red.
- **Station monitors** display phase status and elapsed time in readable pixel-art text. A progress bar fills as the phase progresses.
- **Shelf accumulation** shows artifact count and type at a glance: more objects = more output. Color coding shows artifact type.
- **The routing board** on the back wall shows the full pipeline with completed phases checked off, the active phase pulsing, and future phases dimmed.
- **Blocking dependencies** are spatially visible: when an agent is waiting, a red tether line stretches from their station to the station they are waiting for, and their thought bubble says "Waiting for [station]."
- **Time-on-task** is shown by a glowing ring around each station's base that fills clockwise as time elapses, shifting from green (fast) through amber (moderate) to red (slow) based on expected duration.

**Hover level (tooltip on mouseover):**

- **Agent hover:** Full role name, role type, phase timing (started 2m 30s ago, estimated 1m remaining), current artifact being produced, usage metrics (tokens consumed).
- **Artifact hover:** Filename, type, producing agent, phase, iteration number, creation timestamp, file size. The artifact object highlights with a subtle glow.
- **Monitor hover:** Expanded version of the monitor data: full phase status, quality gate results (typecheck/lint/tests pass/fail), iteration count.
- **Routing board hover:** Run metadata (project slug, ticket ID, branch, run ID), total elapsed time, task description.
- **Thought bubble hover:** Freezes the cycling and shows the full text of the current thought, plus a "Click to see details" hint.

**Click level (detail panels):**

- **Artifact click:** Opens an inline content viewer panel (sliding in from the right side, keeping the workshop visible on the left). Plans render as formatted markdown. Code diffs render with syntax highlighting. Review findings render as structured tables with F/W/T/R/S/L severity badges color-coded by severity. Version tabs appear when multiple iterations exist (v1/v2/v3), with a "Compare" button for side-by-side diff.
- **Agent click:** Opens an agent detail panel showing full activity log, all artifacts produced, timing breakdown, and usage metrics.
- **Station click:** Shows all artifacts at this station in a chronological list with a mini-timeline.
- **Routing board click:** Opens a run overview with the full timing strip (proportional phase durations) and aggregate statistics.

### Review findings treatment

Review station workbenches have a special visual: the shelf unit shows review binders color-coded by severity. Each binder has a visible spine label showing the severity counts (e.g., "0F 2W 1T"). Fatal findings cause the binder to pulse red. The agent's thought bubble cycles through the most important findings.

When clicked, the review artifact viewer renders findings as a structured table with Vision B's information architecture:

1. **Summary row:** Total findings by severity with colored badges.
2. **Per-reviewer sections:** Collapsible panels, each showing reviewer name, criticality badge, and individual findings.
3. **Finding cards:** Severity icon, description, affected file (clickable cross-reference to code diff), resolution status.

### Artifact versioning

When fix cycles produce multiple iterations, the shelf shows stacked versions -- v1 underneath, v2 on top, with a small iteration badge. Clicking opens the version carousel with tabs and a "Compare v1 vs v3" button.

---

## Layer 3: Interaction model

### Primary: watch the floor

The default experience is passive observation. Thought bubbles cycle, monitors update, artifacts materialize on shelves, the orchestrator moves along the routing board. The developer glances over from their IDE and gets a status update without clicking anything.

### Secondary: hover for context

Hovering any element freezes its ambient animation and shows a tooltip with the next level of detail. Tooltips appear after 150ms and position intelligently to avoid occluding the hovered element.

### Tertiary: click for depth

Clicking opens a detail panel on the right side of the screen (40% width), keeping the workshop visible. The panel uses the same steel/teal aesthetic as the workshop but with a document-reading layout: syntax-highlighted code, formatted markdown, structured finding tables. Escape or clicking outside closes the panel. Only one panel is open at a time.

### Navigation

- **Pan:** Click-drag on empty floor space, or arrow keys.
- **Zoom:** Mouse wheel or pinch. Zoom range: full workshop (all stations visible) to single-station close-up (fills viewport).
- **Jump to station:** Number keys 1-7 jump to the corresponding phase station. The routing board also serves as a clickable navigation map.
- **Keyboard shortcuts:** Escape closes panels, Tab cycles between stations, Enter opens the detail panel for the focused station.

### Live vs. post-mortem

**Live:** The workshop updates in real-time. New agents appear with a walk-in animation. Artifacts materialize with a pneumatic delivery animation (canister arrives on overhead rail, opens, artifact drops onto shelf). The camera gently follows the active station unless the user has manually panned. A "Follow active" toggle appears when the user pans away.

**Post-mortem:** All stations are populated in their final state. A timeline scrubber appears at the bottom (reusing PlaybackController), allowing replay at adjustable speed. Dragging the scrubber re-animates the workshop through its history.

---

## Layer 4: Delight and engagement

### What makes it watchable

**The intimacy of thought bubbles.** Unlike any other visualization metaphor, the workshop floor lets you "hear" what agents are thinking. Watching a planner's bubble say "Breaking task into 5 implementation steps..." and then seeing plan artifacts appear on the shelf creates a narrative. Watching a reviewer's bubble turn red and say "Fatal: unbounded array growth in event-folder.ts" creates drama. This is the "watching workers" feeling -- you understand not just what is happening but WHY.

**The satisfaction of accumulation.** Shelves filling with artifacts is deeply satisfying in the same way that Civilization's city growth is satisfying. Each new object is visible evidence that your agents are producing work. The color coding lets you scan -- "lots of yellow code artifacts, a few red review binders, one green plan" -- without reading anything.

**Pneumatic delivery animations.** When the orchestrator routes artifacts between stations, a canister fires along the overhead rail with a satisfying arc. The canister opens at the destination station and the artifact drops into the input tray. This creates a tangible feeling of "materials flowing through the pipeline."

**The routing board as a living map.** The wall-mounted routing board pulses gently with the active phase, and completed phases show solid green indicators. It is always visible in the background, providing orientation even when zoomed into a single station. When a phase completes, the routing board's indicator transitions from pulsing to solid with a brief flash -- a small celebration visible from anywhere in the workshop.

**Notification-driven attention.** Problems surface themselves:

- **Fatal findings:** The review station's klaxon light pulses amber-red. The agent's thought bubble turns red-bordered. The routing board shows an alert icon at the review phase.
- **Long waits:** The time-ring around a station shifts from green to amber to red. The agent's thought bubble says "Elapsed: 8m 42s (expected: 3m)."
- **Failures:** The failed station's overhead light turns red. The agent transitions to "concerned" animation. A brief alarm animation (flashing amber stripes on the station border) draws the eye, then settles into a persistent red state.
- **Blocking dependencies:** A visible red tether line connects the waiting station to the blocking station. No hunting required.

### What makes developers keep it open

- **Peripheral awareness.** The workshop is a living scene that communicates status in your peripheral vision. Motion means progress. Stillness means waiting. Red means trouble. You never need to "check on" the run -- the workshop tells you.
- **The narrative of thought bubbles.** Reading the bubbles creates a micro-story: "Architect says impact is medium... Planner is breaking into 4 steps... Coder is implementing step 2 of 4... Reviewer found 2 warnings... Coder fixing warnings... Done!" This narrative engagement is what makes the difference between a visualization you glance at and one you watch.
- **Post-mortem value.** The workshop in post-mortem mode lets you replay the run and understand what happened, with the timeline scrubber and full artifact access.
- **Speed.** Every common question is answerable in 0-2 interactions. Thought bubbles and monitors handle most questions at the glance level.

---

## Mandatory developer questions

### "What are my minions up to right now?"

**Glance.** Each agent's thought bubble shows their current task in 1-2 lines. Agent animation states (working/idle/celebrating/concerned) are visible at their benches. The routing board on the back wall shows which phase is active (pulsing indicator).

### "What are they stuck on?"

**Glance.** Blocking dependencies are shown as red tether lines between stations. The waiting agent's thought bubble says "Waiting for [phase]." Fatal review findings turn the thought bubble border red and pulse the station's alert light.

### "What code have they produced and what problems have they solved?"

**Glance + Click.** Shelves show accumulated artifacts as colored physical objects (glance for volume and type). Click any artifact to open the inline content viewer with syntax-highlighted diffs, structured findings, or formatted plans.

### "How long has each one spent on task?"

**Glance.** Each station has a glowing time-ring at its base that fills clockwise and shifts from green (fast) through amber to red (slow). Station monitors also show elapsed time in readable text.

### "Who is waiting for whom?"

**Glance.** Red tether lines stretch visibly from waiting stations to blocking stations. The thought bubble of the waiting agent states the blocking reason.

### "Where is the friction and waste in the process?"

**Glance + Hover.** Time-rings that have turned red identify slow phases at a glance. Hovering the routing board shows the proportional timing strip (wider segments = more time spent). Multiple review iterations are visible as stacked version artifacts on shelves. The routing board's review phase shows an iteration count badge.

---

## User-flow examples

### Flow 1: "Quick status check while coding"

The developer has the workshop open in a secondary window. Without switching focus, they glance over:

1. The routing board shows phases 1-3 completed (solid green), phase 4 (review) pulsing, phases 5-7 dimmed.
2. At the review station, three agents are at their benches with "working" animations. Thought bubbles cycle: "Checking error handling patterns...", "Analyzing test coverage for edge cases...", "Reviewing CLAUDE.md compliance...".
3. The review station's time-ring is green (still within expected duration).
4. Shelves at stations 1-3 have artifacts. Station 4's shelves are still empty (reviewers haven't finished yet).

Interpretation: Run is healthy, in review phase, no issues. Return to IDE. Total attention cost: 2 seconds, zero clicks.

### Flow 2: "A reviewer found something serious"

The developer notices a change in the workshop's ambient state:

1. The review station's alert light is pulsing amber-red.
2. One reviewer's thought bubble has a red border and reads: "FATAL: Unbounded array growth in event-folder.ts".
3. The developer hovers the thought bubble -- it freezes and shows the full finding text with the file path.
4. They click the thought bubble. The detail panel opens showing the code-review findings: 0F became 1F after this finding. The finding card shows severity [F], description, and file reference.
5. They click the file reference. The panel navigates to the implementation station's code diff, scrolled to `event-folder.ts` with the relevant lines highlighted.
6. They now understand what the reviewer found and can evaluate whether the coder's fix (once produced) is adequate.

Total: 3 clicks from alert to understanding the problem in context.

### Flow 3: "What changed across review iterations?"

The run completed with 2 review-fix cycles. The developer wants to understand the evolution:

1. At the implementation station, the shelf shows three stacked code artifacts: v1 (bottom), v2 (middle), v3 (top). The iteration badge reads "v3".
2. They click v3. The detail panel opens showing the change-summary with syntax-highlighted diff. Version tabs at the top show v1, v2, v3.
3. They click "Compare" and select v1 vs v3. A side-by-side diff appears showing all changes across both fix cycles.
4. They can see that v2 addressed the fatal finding (unbounded array growth) and v3 addressed a test gap.

Total: 2 clicks to see the diff, 1 more click to compare versions.

### Flow 4: "Why did the review phase take so long?"

1. The developer looks at time-rings across the workshop. The review station's ring is deep red -- it took much longer than expected.
2. They hover the routing board. The proportional timing strip shows the review segment is the widest: 10m 15s out of a 16m total run.
3. They click the review station. The detail panel shows: "2 review rounds. Round 1: 4m (3 reviewers parallel). Fix cycle: 3m 30s. Round 2: 2m 45s."
4. The bottleneck was the fix cycle -- the coder needed significant rework after the first review round.

Total: 1 hover + 1 click.

### Flow 5: "Replaying a completed run to understand flow"

1. The developer opens a completed run. The timeline scrubber appears at the bottom.
2. They drag the scrubber to the beginning. The workshop resets: benches are empty, agents absent.
3. As they drag rightward, agents walk in and begin working at their stations. Thought bubbles appear. Artifacts materialize on shelves. Pneumatic canisters fire between stations.
4. They pause at the review phase to watch the parallel reviewers work. Three agents appear simultaneously at the wide review station. Their thought bubbles show different review focus areas.
5. They resume and watch the fix cycle: artifacts route back to the implementation station, the coder works, then new artifacts route forward again.
6. Run completes: all agents celebrate, the routing board turns fully green.

---

## Risks and mitigations

### Risk 1: Thought bubbles may create visual noise with 5+ agents visible simultaneously

With 5-10 agents at benches, 5-10 thought bubbles cycling text could become overwhelming and hard to read, defeating the purpose of glance-level information.

**Mitigation:** Three strategies. First, **only the active phase's agents show detailed thought bubbles** -- completed phases show a single static "Done" badge, and future phases show nothing. This limits simultaneous bubbles to 1-4 (the active phase's agents). Second, **bubbles are staggered** -- they don't all update at the same moment; each cycles independently with a 4-6 second period, offset by 1-2 seconds. Third, at **zoom levels where the full workshop is visible**, thought bubble text is replaced by compact status icons (checkmark, hourglass, warning triangle), and the text only becomes readable when zoomed to 2-3 stations. This is level-of-detail reduction that preserves information at every zoom.

### Risk 2: The intimate close-up view may conflict with the need to see the full pipeline

The "workshop floor" metaphor implies a close camera, but developers also need to see the overall pipeline state at a glance (which station is active, which are complete).

**Mitigation:** The **routing board on the back wall** serves as an always-visible pipeline overview regardless of zoom level. It is large enough to be readable even when the camera shows the full workshop. At close zoom (1-2 stations visible), the routing board is in the background but still legible. At full zoom-out, it becomes the dominant visual element. Additionally, the **time-rings around station bases** are visible at any zoom level as colored circles, providing instant status (green = healthy, amber = slow, red = trouble, gray = idle) even when station details are too small to read.

### Risk 3: Performance with animated thought bubbles, pneumatic animations, and detailed stations

Rendering 7 detailed stations with animated text, particle effects for the pneumatic rail, and per-station time-rings could strain browser performance.

**Mitigation:** The design leverages the existing Excalibur architecture with these specific optimizations: (1) Thought bubble text is rendered as DOM overlays (React components positioned over the canvas), not canvas text -- this allows efficient text updates without redrawing the game scene. (2) Pneumatic rail animations use a pooled particle system (reused from conveyor belt particles). (3) Time-rings are simple arc-rendering operations using Excalibur's graphics primitives. (4) Level-of-detail: at full zoom-out, station detail textures simplify to flat colored rectangles, and thought bubbles collapse to icons. (5) Inactive stations (completed/future) have no per-frame animation cost.

---

## Assumptions

1. **Artifact content is available via the API.** The inline content viewer requires a server endpoint (e.g., `GET /runs/:runId/artifacts/:filename`) that serves artifact file content. The existing `run-index.json` provides metadata; content requires a new endpoint.

2. **The existing Excalibur.js + React architecture is retained.** The workshop floor is an Excalibur scene (stations, agents, animations, routing board) with React DOM overlays for thought bubbles, tooltips, and the detail panel. This extends the established pattern of "Excalibur owns visual state, React owns UI chrome."

3. **Thought bubble text is derived from agent events.** The run log events include sufficient information (phase name, artifact type, finding summaries, waiting reasons) to generate meaningful 1-2 line thought bubble text. The mapper would produce a `thoughtText: string[]` array for each agent config.

4. **Runs have at most 10 agents and 50 artifacts.** The workshop layout is designed for this scale. Station spacing, shelf capacity, and routing board size accommodate 7 phases with up to 4 parallel agents at the review station.

5. **The visualization will be viewed at 1200px+ width.** The workshop layout requires horizontal space for 7 stations. Below 1200px, stations would need to scroll horizontally.

6. **Review findings use the structured F/W/T/R/S/L scheme.** The severity badge system depends on parseable finding data. Falls back to plain markdown if unstructured.

7. **Phase timing data is reliably available.** Time-rings and the proportional timing strip require `startedAt`/`completedAt` timestamps on phases in `CanonicalRunStatus`.
