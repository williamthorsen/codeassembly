# Vision F: The empire view

## Elevator pitch

A developer running CodeAssembly doesn't manage one run at a time -- they manage a fleet. The empire view treats concurrent orchestration runs as outposts on a strategic map: each run is a miniature factory visible at a glance, with pipeline progress bars, agent rosters, and attention-needed signals that let the developer triage across 2-5 runs without opening any of them. When a run needs attention -- a fatal finding, a stuck phase, a failed implementation -- the empire surfaces it with notification badges and amber borders, drawing the eye like a Civilization advisor. Clicking any facility triggers a spatial zoom transition into a rich factory-floor view where agents work at stations with thought bubbles, physical artifacts stack on shelves, time-on-task rings glow around each worker, and blocking relationships are visible as dashed amber lines. The developer governs their workforce from 30,000 feet and drops to ground level when needed, with Vision B's progressive disclosure model (glance / hover / click) embedded at every layer.

---

## Layer 1: Metaphor and theme

### The visual world

The developer inhabits a **command center** overseeing multiple production facilities. Each orchestration run is a self-contained factory visible as a card in the empire grid. The metaphor draws directly from Civilization's world map: you see all your cities (runs) at once, with health indicators, production queues (pipeline progress), and population (agent rosters). Problems surface themselves -- you don't hunt for them.

**The empire level** is a strategic overview. Facility cards are arranged in a responsive grid. Each card is a miniature dashboard showing pipeline progress as a phase bar, active agents as a compact roster, elapsed time, artifact counts, and -- critically -- review finding severity pills. The cards use border colors and notification badges to signal status: cyan glow for healthy-in-progress, green border for completed, amber border with pulsing top stripe for needs-attention, red border for failed.

**The facility level** is a spatial world. When you click a facility card, the empire zooms away (scales up and fades) while the facility zooms in (scales from small to full), creating the sensation of spatial drill-down rather than page navigation. Inside, the factory floor has three spatial zones:

1. **Gantry rail** -- A steel rail across the top with rivets and cross-bracing. The orchestrator sprite rides this rail, positioned above the currently active phase. The rail has repeating structural detail (rivet lines) that rewards close looking.

2. **Station platforms** -- Seven platforms arranged horizontally, one per pipeline phase. Each station has a sign (phase name, role-type color dot, elapsed time), an agent sprite with pixel-art face, a time-on-task ring, a thought bubble surfacing current activity, and an artifact shelf where completed artifacts stack as colored tiles. The review station expands wider to show 2-4 parallel sub-stations with individual reviewers.

3. **Artifact inspection panel** -- When an artifact tile is clicked, a panel slides up from the bottom of the facility view, showing the artifact's full content: syntax-highlighted diffs for code, structured finding cards with F/W/T/R/S/L severity badges for reviews, rendered markdown for plans. The factory floor remains visible above, maintaining spatial context.

### Why this metaphor works

Managing multiple AI orchestration runs is fundamentally a **governance problem**, not an analysis problem. The developer's primary loop is: are things healthy? does anything need my attention? can I keep working on something else? This maps perfectly to the Civilization governor model:

- **Empire view** answers "what's the state of my domain?" in one glance
- **Facility view** answers "what's happening in this specific operation?" with full spatial detail
- **Notification system** answers "do I need to look at anything right now?" without requiring any scanning
- **Spatial zoom** preserves mental context -- the developer knows they're looking at one specific run within their fleet, not a disconnected detail page

### Aesthetic direction

**Sci-fi industrial pixel art** with a palette designed for extended viewing:

- **Mid-tone steel and slate surfaces** dominate (#2a3040, #2e3545, #364050). No large areas of near-black.
- **Teal ambient lighting** provides depth through radial gradients, giving the environment a misty, atmospheric quality without darkness.
- **Cyan** (#55FFFF) for active/healthy indicators, screen highlights, and interactive affordances.
- **Amber** (#FFAA00) for warnings, attention signals, and caution states.
- **Green** (#55FF55) for completion and success.
- **Red** (#FF5555) for failures and fatal findings -- used sparingly.
- **Textured surfaces** everywhere: repeating rivet lines on the gantry rail, crosshatch patterns on station floors, panel lines on background surfaces. These details are visible at close zoom but dissolve into texture at a distance.
- **Role-type CGA-16 colors** (magenta/blue/green/yellow/red) appear on agent sprites, station sign dots, and timing strip segments.

---

## Layer 2: Information architecture

### Empire view: three-band structure

**Band 1 -- Empire summary strip (always visible).** A horizontal bar showing aggregate metrics: active run count, completed count, failed count, needs-attention count, total agents working, total artifacts produced. This answers "how does the overall workload look?" without scanning any individual card.

**Band 2 -- Facility card grid (scrollable).** Each card is a self-contained miniature displaying:

- **Pipeline progress bar** -- Seven phase pips arranged horizontally. Completed phases show green, the active phase pulses cyan, failed phases show red, pending phases are dim steel. This answers "where is this run?" at a sub-second glance.
- **Agent roster** -- Compact pills showing each agent's name and state (working/done/idle/problem). Working agents have pulsing dots. Problem agents show red. This answers "who is working?" and "who is stuck?" simultaneously.
- **Notification badge** -- A floating circular badge (amber for attention, red for critical) on cards that need the developer's intervention. Animates with a subtle scale pulse to draw the eye without flashing obnoxiously.
- **Footer metrics** -- Elapsed time, artifact count, review round number, and finding severity pills (1F, 2W, 1T etc.). Finding pills use the F/W/T/R/S/L color coding from Vision B.

**Band 3 -- Attention ordering.** Cards with the `needs-attention` status sort to the top-left of the grid. Failed cards sort next. Completed cards settle to the end. The grid self-organizes so the developer's eye naturally falls on what matters most.

### Facility view: four-tier progressive disclosure

**Tier 1 -- Glance (no interaction needed).**

- Pipeline progress: orchestrator position on gantry rail, station completion states (completed = green border, active = cyan glow, pending = dim).
- Agent states: sprite animation (working = bobbing, idle = still, celebrating = bouncing, concerned = shaking).
- Time-on-task: colored rings around each agent sprite (quarter/half/three-quarter/full/overtime). Overtime rings pulse amber.
- Thought bubbles: text above active agents showing current task ("Checking error handling..."), current finding ("Found W: unbounded cache"), or waiting reason ("Waiting for code-reviewer...").
- Timing strip: a proportional bar below the header showing how long each phase took, color-coded by role type.
- Blocking relationships: when an agent is waiting for another, the spatial arrangement of the review sub-stations and the orchestrator position make the dependency visible.

**Tier 2 -- Hover (tooltip appears).**

- **Timing segment hover**: shows exact phase duration.
- **Agent hover**: shows role name, current state, phase timing.
- **Artifact tile hover**: shows filename, type, agent, iteration.
- **Station sign hover**: shows phase decision details.

**Tier 3 -- Click (panel opens).**

- **Artifact tile click**: opens the bottom panel with full content. Plans render as structured markdown. Code diffs render with syntax highlighting and +/- coloring. Review findings render as individual cards with severity badges, descriptions, and file locations. Version tabs appear when multiple iterations exist.
- **Agent click**: opens a detail drawer with activity log.

**Tier 4 -- Deep dive (within panel).**

- Version comparison between artifact iterations (v1 vs v3).
- Cross-reference links from review findings to affected code.
- Full markdown rendering of plans and summaries.

---

## Layer 3: Interaction model

### Empire view interactions

**Scan** -- The developer scans the card grid. Cards with notification badges and amber/red borders catch the eye first. The pipeline progress bars and finding pills provide instant health assessment. No clicking needed to triage.

**Click facility card** -- Triggers the spatial zoom into the facility view. The empire scales up and fades out (as if zooming "through" it) while the facility scales up from a smaller size. The transition takes 500ms and preserves spatial orientation.

**Hover facility card** -- Shows a tooltip with ticket, branch, and status. Quick preview without committing to a zoom.

### Facility view interactions

**Watch** -- The primary mode. Agents animate at their stations. Thought bubbles cycle through status messages. The orchestrator drifts along the gantry rail. Notifications toast in from the right when interesting things happen (findings discovered, phases completed, failures detected).

**Click artifact tile** -- Opens the artifact inspection panel from the bottom. The panel header shows type badge (colored), filename, producing agent, phase, and iteration. The body renders type-appropriate content. ESC or the close button dismisses the panel.

**Back to empire** -- The back button or ESC (when no panel is open) triggers the reverse spatial zoom: the facility scales down and fades while the empire fades in from its larger scale.

### Notification system

Notifications are **push, not pull**. The visualization actively draws attention to events that matter:

- **In empire view**: Notification badges appear on facility cards. Cards with new critical events get a brief amber border pulse.
- **In facility view**: Toast notifications slide in from the top-right. They show what happened ("Code reviewer found 1W"), which agent did it, how recently, and auto-dismiss after 8 seconds. The developer can ignore them or click to navigate to the relevant artifact.

### Keyboard shortcuts

- **ESC**: Close artifact panel, or zoom back to empire
- **1-7**: Jump camera to station (in facility view)
- **Tab**: Cycle between stations
- **Enter**: Open artifact panel for selected station's first artifact

---

## Layer 4: Delight and engagement

### What makes it compelling to watch

**The empire pulses with activity.** Active facility cards have glowing cyan phase pips that breathe. Working agents' dots pulse. The empire summary strip updates in real-time. The developer sees their fleet operating as a living system.

**The facility is inhabited.** Agent sprites bob when working, bounce when celebrating, shake when concerned. Their pixel-art faces give them personality without demanding attention. Thought bubbles cycle through status messages, creating the illusion of agents thinking aloud. The orchestrator drifts along the gantry rail like a foreman inspecting the line.

**Time is visible without reading.** The time-ring around each agent fills as they work: a quarter ring for a minute, half for two, three-quarters for three, full for four, then it transitions to an amber overtime pulse. The timing strip below the facility header shows proportional phase durations. Both are visible at a glance without hovering.

**Artifacts are physical.** Completed work materializes as colored tiles on shelves. Architecture assessments are blue, plans are green, code is yellow, reviews are red. Stacked tiles show version badges. The artifact shelf tells you "this station produced work" without any text.

**Notifications create drama.** When a reviewer discovers a warning, a toast slides in: "Code reviewer found 1W: unbounded array growth in event-folder.ts." The developer glances, decides whether to drill in, and returns to their work. Fatal findings get red-bordered toasts. The system creates the feedback loop that makes Civ addictive: your workers surface interesting events, you decide what to act on.

### What makes developers keep it open

1. **Ambient awareness across runs.** The empire view provides something no other tool offers: at-a-glance status of all concurrent orchestration runs. The developer can leave this on a secondary monitor and glance at it every few minutes.

2. **The zoom transition maintains context.** Unlike tab-based dashboards where each run is an isolated page, the spatial zoom preserves the developer's mental model: "I'm zooming into one run within my fleet." Zooming back out returns them to the exact same empire state.

3. **Post-mortem value.** Completed runs remain in the empire view with green borders. Clicking into them shows the full factory state, including all artifacts. The timing strip immediately reveals bottlenecks. Review findings are one click away.

4. **The palette is comfortable.** The mid-tone steel and teal environment is designed for extended viewing. No eye-straining darkness. Bright colors are reserved for signals, not surfaces.

---

## How mandatory developer questions are answered

### Standard questions

| Question                                                           | How                                                                                                                             | Disclosure level |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| "What are my minions up to right now?"                             | Agent sprite animations (working/idle) + thought bubbles showing current task                                                   | Glance           |
| "What are they stuck on?"                                          | Thought bubbles with waiting reasons + concerned animation state + amber time-ring overtime pulse                               | Glance           |
| "What code have they produced and what problems have they solved?" | Artifact tiles on shelves (glance), artifact panel with diffs and findings (click)                                              | Glance + Click   |
| "How long has each one spent on task?"                             | Time-ring around each agent sprite (fills progressively, amber overtime) + timing strip                                         | Glance           |
| "Who is waiting for whom?"                                         | Orchestrator position on gantry (above active phase) + spatial arrangement of review sub-stations + dashed amber blocking lines | Glance           |
| "Where is the friction and waste in the process?"                  | Timing strip proportional widths reveal bottleneck phases + overtime time-rings on slow agents + review round count in footer   | Glance + Hover   |

### Empire-specific questions

| Question                                  | How                                                                                                  | Disclosure level |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| "Which of my runs needs attention?"       | Notification badges (amber/red circles), amber borders, pulsing top stripes on needs-attention cards | Glance           |
| "Which runs are healthy and progressing?" | Pipeline progress bars with cyan active pips + working agent dots + absence of notification badges   | Glance           |
| "How does the overall workload look?"     | Empire summary strip: active/completed/failed counts, total agents working, total artifacts produced | Glance           |

### Mandatory interaction patterns

- **Thought/speech bubbles**: Present on all active agents, showing current task, current finding, or waiting reason. Cycle automatically during live runs.
- **Artifacts as physical objects**: Colored tiles on shelves at each station, with version badges for iterations. Clickable to open the inspection panel.
- **Blocking relationships spatially visible**: The orchestrator's position on the gantry rail shows which phase is active. Review sub-stations show parallel work. When an agent waits, its thought bubble says why.
- **Time-on-task visible without hovering**: Progressive time-rings around each agent sprite. Quarter/half/three-quarter/full/overtime states, with overtime pulsing amber.
- **Notification-driven attention**: Empire view uses notification badges on cards. Facility view uses toast notifications. Both draw the eye to problems without requiring scanning.
- **Spatial zoom transition**: Empire-to-facility uses opposing scale transforms (empire scales up/fades, facility scales up from small), creating a continuous spatial zoom rather than a page navigation.

---

## User-flow examples

### Flow 1: "Morning check-in across all runs" (empire view)

The developer opens CodeAssembly and sees the empire view. Five facility cards in the grid:

1. **PROJ-142** (feat/user-auth) -- Cyan active pip at "Review", three working agents with pulsing dots. Finding pills show 1W, 2T, 1S. No notification badge. _Interpretation: healthy, proceeding through review. No action needed._

2. **PROJ-155** (fix/payment-handler) -- Red notification badge with "!", amber border with pulsing stripe, status "Needs review". Finding pills show **1F**, 2W, 1T. _Interpretation: fatal finding in review. This run needs my attention._

3. **PROJ-148** (feat/export-csv) -- Green border, all phase pips completed-green. Status "Completed". _Interpretation: done, can check results later._

4. **PROJ-160** (fix/db-migration) -- Red border, "X" badge. Implementation pip is red. Status "Failed". _Interpretation: failed during implementation. Needs investigation._

5. **PROJ-163** (feat/notification-system) -- Early stage, active pip at "Plan". Two agents. _Interpretation: just started, nothing to worry about yet._

The developer prioritizes: PROJ-155 (fatal finding) first, then PROJ-160 (failure). Total time to triage: 5 seconds.

### Flow 2: "What's the fatal finding?" (empire to facility zoom)

The developer clicks the PROJ-155 card. The empire scales up and fades. The facility view zooms in. They see:

- The review station is active with three reviewer sub-stations.
- The code reviewer's thought bubble shows: "Found F: missing error handling in payment processor."
- The code reviewer's time-ring is at three-quarter (it's been running for a while on round 3).
- A notification toast slides in: "Code reviewer found 1F: missing error handling in payment-handler.ts."

The developer clicks the red artifact tile on the code reviewer's shelf. The artifact panel opens showing:

- Severity badge: **F** (red)
- Finding: "Missing error handling in payment processor. When the payment gateway returns HTTP 500, the error is swallowed and the user sees a success response."
- File: `src/payment/handler.ts:42`

The developer now understands the issue. They press ESC to close the panel, then ESC again to zoom back to the empire.

### Flow 3: "Why did the migration run fail?" (post-mortem)

The developer clicks the PROJ-160 card (failed). The facility zooms in. They see:

- Architecture and planning stations have completed agents with green time-rings and artifact tiles on shelves.
- The implementation station has a concerned agent (shaking animation), with a red time-ring.
- The implementation agent's thought bubble shows: "Error: migration script syntax error at line 47."
- Stations 4-7 are dim and unpopulated.

The developer clicks the single code artifact tile at the implementation station. The panel shows the change-summary with the partial diff. The error is visible in the code. The developer now knows the failure cause without reading any logs.

### Flow 4: "How are things going overall?" (empire monitoring)

The developer glances at the empire summary strip:

- **3** active, **5** completed, **1** failed, **1** needs attention
- **12** agents working, **47** artifacts produced

They see activity: facility cards with in-progress status have pulsing cyan pips and working agent dots. The empire is alive. They can return to their own work, confident that things are progressing, with one item (PROJ-155's fatal finding) flagged for later attention.

---

## Risks and mitigations

### Risk 1: Empire view becomes cluttered with 5+ runs

With 5 concurrent runs, each card showing a pipeline bar, agent roster, and metrics footer, the empire grid could feel dense -- especially on smaller screens.

**Mitigation:** Three strategies. First, the responsive grid uses `minmax(520px, 1fr)`, meaning cards stack vertically on narrower viewports rather than compressing. Second, the attention-ordering system (needs-attention first, failed second, completed last) ensures the developer's eye falls on actionable cards without scanning the entire grid. Third, for extreme cases (8+ runs), a collapsed card mode could show only the pipeline bar and notification badge, expanding on hover. The current design targets the stated requirement of 2-5 concurrent runs, where the grid works comfortably.

### Risk 2: Spatial zoom transition may feel disorienting

The scale-based transition between empire and facility views could feel jarring if not tuned correctly, especially for users who click rapidly between runs.

**Mitigation:** The 500ms transition duration is long enough to be perceptible but short enough to not block workflow. The opposing transforms (empire scales up while facility scales from small) create a coherent spatial metaphor: you're "diving into" the facility. If user testing reveals disorientation, the transition can be shortened to 300ms or replaced with a simple crossfade as a fallback. The view toggle buttons in the header also provide a non-spatial alternative for users who prefer direct switching.

### Risk 3: Thought bubbles on small agents may be hard to read

At the facility view's scale, agent sprites are 28px and thought bubbles need to show meaningful text in a very small area.

**Mitigation:** Thought bubbles use a maximum width of 140px with text overflow ellipsis. The text is 0.5rem (8px equivalent) -- small but readable on modern displays. For critical messages (findings with severity F or W), the bubble border changes to amber or red, making them scannable by color even when text isn't readable. The progressive disclosure model means thought bubbles are a glance-level hint; the full detail is always available via hover (tooltip) or click (artifact panel).

---

## Assumptions

1. **2-5 concurrent runs is the realistic ceiling.** The empire grid is designed for this scale. Significantly more runs would need pagination or a list mode, which this vision does not address in detail.

2. **The existing Excalibur + React architecture is retained.** The empire view is primarily React (DOM-based cards and layout). The facility view uses Excalibur for agent sprites and animations, with React overlays for the artifact panel and notifications. This hybrid approach matches the existing architecture.

3. **Artifact content is accessible via the API.** The artifact inspection panel assumes a `GET /runs/:runId/artifacts/:filename` endpoint that returns raw file content for client-side rendering.

4. **Review findings use the structured F/W/T/R/S/L scheme.** The finding cards and severity pills depend on parseable severity data. If findings are free-form markdown, the panel falls back to plain rendering.

5. **Runs have at most 10 agents and 50 artifacts each.** The facility view's station-and-shelf layout is designed for this scale. The empire view's agent roster and finding pills are designed for this per-run artifact density.

6. **The visualization runs on desktop browsers at 1200px+ width.** The empire grid responsively stacks cards on narrower viewports, but the facility view assumes sufficient horizontal space for seven stations.

7. **Real-time updates arrive via polling or server-sent events.** The empire view's liveness (pulsing pips, updating metrics) assumes the client receives periodic status updates. The existing polling infrastructure in Factory should suffice.
