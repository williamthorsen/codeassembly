# Control panel and operator interaction research

Research date: 2026-03-14
Context: UI patterns from orchestration dashboards, CI/CD monitors, and agent visualization tools — distilled into stealable patterns for a pixel-art "orchestration room" factory visualization.

## Table of contents

1. [Synthesized patterns (the good stuff)](#synthesized-patterns)
2. [Tool-by-tool findings](#tool-by-tool-findings)
3. [Industrial HMI design principles](#industrial-hmi-design-principles)
4. [Spatial and game-inspired precedents](#spatial-and-game-inspired-precedents)
5. [Implications for the orchestration room](#implications-for-the-orchestration-room)

---

## Synthesized patterns

### Pattern 1: The three-layer attention model

Every good orchestration UI follows the same three layers. The tools differ only in how they implement each layer.

| Layer                       | What it answers                              | Time budget       | Examples                                                                                                       |
| --------------------------- | -------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **Glance** (overview)       | "Is everything OK? What needs my attention?" | < 1 second        | Dagster homepage health indicators, Grafana dashboard panels, Gastown feed event stream, Buildkite follow mode |
| **Focus** (filtered detail) | "What's happening with this specific thing?" | 2-10 seconds      | Temporal timeline view, Kestra Gantt tab, Prefect radar, Dagster asset graph sidebar, n8n node click           |
| **Inspect** (full detail)   | "Show me the raw content / logs / data"      | As long as needed | Dagster structured event log, Temporal full history, Kestra logs tab, LangSmith trace waterfall                |

**Orchestration room translation:** This maps directly to the existing progressive disclosure model (glance → hover → click). The key insight is that every tool puts the most aggressive visual encoding at the glance layer and reserves text-heavy content for the inspect layer. The pixel-art room should do the same: the spatial scene IS the glance layer, tooltips are the focus layer, and side panels are the inspect layer.

### Pattern 2: Color as alarm, not decoration

Industrial HMI design and every orchestration tool converge on the same rule: **reserve saturated color for abnormal states**.

| State               | Color convention               | Notes                                                            |
| ------------------- | ------------------------------ | ---------------------------------------------------------------- |
| Running / normal    | Muted, desaturated, or neutral | Dagster: gray. Temporal: no color. Kestra: no highlight.         |
| Completed / success | Green (often muted)            | Universal. Temporal, Dagster, Kestra, n8n all use green.         |
| Failed / error      | Red                            | Universal. Often the ONLY saturated color in the normal palette. |
| Warning / slow      | Amber / orange                 | Used by Dagster health indicators, industrial HMI alarm tiers.   |
| Pending / waiting   | Dashed or purple/gray          | Temporal: dashed purple. Buildkite: outlined nodes.              |
| Retrying            | Dashed red or animated         | Temporal: dashed red with retry count badge.                     |

**Orchestration room translation:** The facility should be visually calm when everything is healthy. Color saturation = urgency. A healthy room looks peaceful with muted tones; a failing run makes specific stations light up red. This aligns with the existing "notification-driven attention" design decision.

### Pattern 3: The split-pane layout

Nearly every tool uses some variant of a split-pane layout for run detail:

```
┌─────────────────────────────────┐
│  VISUAL OVERVIEW                │  ← Gantt chart, DAG, timeline, canvas
│  (spatial/temporal)             │
├─────────────────────────────────┤
│  STRUCTURED LOG / EVENT STREAM  │  ← Filterable, searchable, time-ordered
│  (textual)                      │
└─────────────────────────────────┘
```

- **Dagster:** Upper pane = Gantt chart showing op/asset duration. Lower pane = filterable structured event log.
- **Temporal:** Upper area = Timeline/Compact/Full History visual. Below = event detail with filter controls.
- **Kestra:** Tabs for Overview, Gantt, Topology, Logs, Outputs, Metrics — each is a different lens on the same execution.
- **Retool Workflows:** Canvas (visual) + block detail panel (textual) side by side.
- **n8n:** Canvas (visual) with node click opening an output/input data panel.

**Orchestration room translation:** The pixel-art room IS the upper pane. When you click into a station or artifact, a side panel slides in as the lower/right pane. This is the existing "artifact drill-down is tertiary" decision, now validated by industry convention. The room replaces the Gantt/DAG/timeline; the side panel replaces the log viewer.

### Pattern 4: Operator controls placement

Where do tools put the "do something" buttons?

| Placement                        | Tools                                     | Controls offered                                  |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| **Top bar / action menu**        | Dagster, Temporal, Kestra, Argo           | Cancel, Terminate, Re-execute, Reset, Signal      |
| **Context menu on nodes**        | Buildkite, n8n, Kestra topology           | Retry this step, view logs, change status         |
| **Bulk selection + action bar**  | Dagster, Kestra                           | Select multiple executions → Restart, Kill, Pause |
| **Inline on the visual**         | Buildkite follow mode, n8n canvas buttons | Execute, Stop, Follow progress                    |
| **Right-click / three-dot menu** | Kestra, Temporal                          | Advanced operations on specific tasks             |

**Key insight:** Controls live at two levels — **run-level** (top bar: cancel whole run, re-execute) and **step-level** (context menu on a specific node: retry, inspect, skip). No tool mixes these up.

**Orchestration room translation:**

- **Run-level controls** → a physical "control console" object in the room (a desk with buttons, a wall panel). Click it to get Cancel / Re-execute / Pause for the whole run.
- **Step-level controls** → right-click or click on a specific agent/station to get Retry / Skip / Inspect for that step.
- **The console is furniture.** It exists as a physical object in the room, not a floating UI element. The governor walks up to the console to issue commands.

### Pattern 5: Timeline and duration visualization

How tools show "how long things take" and "what's happening in parallel":

| Approach                                     | Tools                           | Key feature                                                |
| -------------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| **Gantt chart** (horizontal bars, time axis) | Dagster, Kestra, Prefect        | Shows duration per step, parallelism via stacked bars      |
| **Timeline with spans** (event-driven)       | Temporal                        | Color-coded spans, hover for exact timing, zoom controls   |
| **DAG with status overlay** (topology)       | Buildkite, Argo, Kestra, Retool | Nodes show status; position shows dependency               |
| **Follow/spotlight mode**                    | Buildkite                       | Auto-scrolls to currently running step                     |
| **Radial/concentric**                        | Prefect Radar                   | Tasks radiate outward from center; ring = dependency depth |

**Orchestration room translation:** The spatial layout of stations in the room already encodes the pipeline stages. Duration can be shown via:

- **Glowing time-rings** on agents (already decided) — green → amber → red as time grows
- **Conveyor belt speed** between stations — fast when progress is quick, stopped when blocked
- A **wall-mounted timeline display** inside the room (a pixel-art monitor showing a Gantt-like strip) for people who want temporal precision without leaving the spatial metaphor

### Pattern 6: Dependency and blocking visualization

| Approach                              | Tools                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| **Lines/edges between nodes**         | Buildkite (highlights upstream/downstream on selection), Argo DAG, Kestra topology |
| **Dashed/animated lines for pending** | Temporal (dashed purple for pending), general convention                           |
| **Greyed-out or dimmed nodes**        | Buildkite (conditional steps), Temporal (unopened groups)                          |
| **Blocking indicators**               | Temporal (pending activities linked to parent), Argo (suspend step)                |

**Orchestration room translation:** Already decided: red tether lines for blocking, stopped conveyors, "Waiting for..." thought bubbles. This research validates those choices. Add: when you click a station, its upstream and downstream dependencies highlight (steal from Buildkite's selection-based highlighting).

### Pattern 7: The event stream as heartbeat

Multiple tools maintain a real-time event feed:

- **Gastown `gt feed`**: Three-panel TUI — Agent Tree, Convoy Panel, Event Stream. The event stream is the "heartbeat" showing creates, completions, nudges chronologically.
- **Dagster**: Structured event log with filterable event types.
- **Kestra**: Server-sent events for live updates.
- **AgentPrism**: Sequence diagram with play/pause for replaying agent decision chains.

**Orchestration room translation:** Instead of a scrolling text log, the room itself IS the event stream. Agent animations (walking to stations, picking up artifacts, sitting down to work) are the events made spatial. For power users who want the text feed, a "terminal monitor" object in the room could show a scrolling event log when clicked — like a security camera monitor showing the text view of what the spatial view shows visually.

---

## Tool-by-tool findings

### Dagster

**Sources:** [Dagster webserver and UI docs](https://docs.dagster.io/guides/operate/webserver), [New Dagster+ UI announcement](https://dagster.io/blog/introducing-the-new-dagster-plus-ui), [Asset and run visualization (DeepWiki)](https://deepwiki.com/dagster-io/dagster/7.4-run-and-event-interfaces)

**Overview → detail architecture:**

- Homepage as "command center" — failing assets, job failures, materialization issues aggregated
- Users can pin assets and jobs they care about (customizable relevance)
- Asset health indicators with colored states (healthy / warning / degraded)
- Saved dashboard collections scoped to teams or pipeline stages
- Lineage graph with toggleable metadata visibility

**Run detail layout:**

- Upper-left pane: Gantt chart (op/asset duration bars)
- Bottom pane: Filterable structured event log
- Two log types: structured events (enriched with metadata, links, event type) and raw compute logs
- Toggle between structured and raw log views
- Filter by event type, step, log level

**Operator controls:**

- Materialize assets from the UI
- Launch runs with configuration
- Re-execute runs (from failure, from specific step)
- Terminate running runs

**Stealable ideas:**

- "Health indicator that doubles as a quick report card" on hover — translate to thought bubble or station glow
- Saved dashboard collections → the orchestration room layout itself is the "saved dashboard" — each room arrangement reflects a pipeline config
- Gantt chart in upper pane → pixel-art wall monitor showing a simplified Gantt strip
- Progressive disclosure from homepage health → asset catalog → cost insights

### Temporal

**Sources:** [Temporal Web UI docs](https://docs.temporal.io/web-ui), [Redesigning workflow experience](https://temporal.io/blog/the-dark-magic-of-workflow-exploration), [Timeline view blog](https://temporal.io/blog/lets-visualize-a-workflow)

**Three complementary views of the same data:**

1. **Compact view**: Linear left-to-right progression. Consolidates identical event types with counts. No time axis.
2. **Timeline view**: Horizontal timeline with color-coded spans. Hover shows exact timing. Zoom +/- with fit button. Parallel activities stack vertically. Built with vis-timeline library.
3. **Full History view**: Git-tree style. Thick central line = workflow backbone. Event groups branch outward. Clicking reveals full detail. Unopened groups fade for focus.

**Visual vocabulary:**

- Dots represent events
- Lines connect related events
- Icons categorize event types (Activity, Timer, Child Workflow)
- Colors: green=completed, red=failed, dashed red=retrying, dashed purple=pending
- Retry icons show current attempt number

**Operator controls:**

- Request Cancellation
- Send Signal or Update
- Reset and Terminate
- Filter by multiple event types across all views
- Relationships tab (parent/child/adjacent workflows)
- Child workflows viewable inline from timeline without navigation

**Stealable ideas:**

- Three views of same data (compact/timeline/full) → in the room, this is: spatial view (compact), wall timeline monitor (timeline), side panel (full history)
- Color-coding is extremely restrained: only red, green, dashed variants, and purple. Nothing decorative.
- Retry count badge on retry icons → thought bubble showing "Attempt 3/5"
- Child workflows inline → sub-runs shown as nested rooms or mini-facilities
- Pending activities associated with their parent activities, not shown separately

### Prefect

**Sources:** [Flow runs UI docs](https://prefect-284-docs.netlify.app/ui/flow-runs/), [Introducing Radar](https://medium.com/the-prefect-blog/introducing-radar-427611aac31e)

**Radar visualization:**

- Radial canvas where tasks radiate outward from center
- Ring distance = dependency depth (parent tasks are closer to center)
- Layout algorithm updates in real-time as tasks run
- Handles massive dynamic fan-out/fan-in
- Click-through from parent flow to subflow runs
- Zoom/pan/drag to navigate large task graphs

**Run dashboard:**

- Filter by date, state, flow name, deployment, tags
- Run history bar chart (time vs. duration, colored by status)
- Click any run for detail: logs, task states, execution timeline

**Stealable ideas:**

- Radial layout where dependency depth = distance from center is a novel spatial idea — could translate to rooms arranged in concentric rings or distance from a central "orchestrator desk"
- Real-time layout update (Radar redraws as tasks complete) → agents physically relocate or stations light up progressively
- The bar chart overview (runs over time) → a "history wall" in the facility showing recent runs as a simple chart

### n8n

**Sources:** [n8n editor UI docs](https://docs.n8n.io/courses/level-one/chapter-1/), [Workflow canvas (DeepWiki)](https://deepwiki.com/n8n-io/n8n/6.2-workflow-canvas-and-node-management), [Execution data (DeepWiki)](https://deepwiki.com/n8n-io/n8n-docs/9.3-execution-data-and-history)

**Canvas-centric execution:**

- Dotted grid background as workspace
- Nodes connected by lines showing data flow
- Execution overlays status indicators on each node after run completes
- Click any node to see input/output data
- Execution path visualization shows which conditional branches were taken
- Failed nodes show error message and exact failure point

**Canvas controls (three button components):**

- `CanvasRunWorkflowButton` — execute all nodes
- `CanvasStopCurrentExecutionButton` — stop current execution
- `CanvasStopWaitingForWebhookButton` — cancel webhook wait

**Layout:**

- Three-region layout: navigation (left), workflow controls (top), canvas (main)
- Top bar: workflow naming, save, version management
- Canvas controls: zoom to fit, zoom in/out, reset zoom, tidy up nodes

**Stealable ideas:**

- The canvas IS the execution view — status overlays appear on the same nodes you built the workflow with. No separate "run view." → The facility IS the execution view. Same room, different overlays.
- "Tidy up" button for node arrangement → not applicable to fixed tilemap, but the concept of a clean spatial arrangement that makes flow obvious is important
- Three dedicated execution buttons (Run / Stop / Stop Waiting) as physical buttons, not dropdown menus → physical control panel objects in the room

### Gastown and agent monitoring

**Sources:** [Gastown GitHub](https://github.com/steveyegge/gastown), [Gastown Viewer Intent](https://github.com/intent-solutions-io/gastown-viewer-intent), [Maggie Appleton analysis](https://maggieappleton.com/gastown)

**`gt feed` TUI layout:**

- Three-panel terminal dashboard
- Panel 1 (Agent Tree): Hierarchical view of all agents grouped by rig and role
- Panel 2 (Convoy Panel): In-progress and recently-landed convoys (batch progress)
- Panel 3 (Event Stream): Chronological feed of all events (creates, completions, slings, nudges)
- Navigation: j/k scroll, Tab switch panels, 1/2/3 jump

**Web dashboard (gastown-viewer-intent):**

- Board tab: Kanban-style view of issues across workflow columns
- Graph tab: D3 force-directed dependency graph (14 edge types)
- Gas Town tab: Central agent monitoring — live status indicators, molecular workflow tracking
- API-driven: SSE stream for real-time updates (`/api/v1/events`)

**Agent hierarchy as spatial metaphor:**

- Mayor (user-facing coordinator)
- Polecats (temporary workers)
- Witness (supervisor, resolves blockers)
- Refinery (merge queue manager)
- Each role has specific responsibilities and spatial relationships

**Stealable ideas:**

- Three-panel information architecture → three spatial zones in the room: agent area, progress display, event feed
- Agent hierarchy visualized spatially → different roles get different stations/desks/areas
- "Problems view" that surfaces agents needing human intervention → red-highlighted stations with flashing thought bubbles
- Convoy tracking (batch progress: Done/Active/Blocked/Pending counts) → a wall-mounted progress board showing completion fraction
- Molecule tracking (step-by-step workflow completion) → conveyor belt segments lighting up as steps complete

### Retool Workflows

**Sources:** [Retool Workflows quickstart](https://docs.retool.com/workflows/quickstart), [Workflow IDE docs](https://docs.retool.com/workflows/concepts/ide)

**Canvas + block detail:**

- Infinite canvas with interconnected blocks
- Blocks connect sequentially, showing control flow
- Single path or branching for parallel operations
- Graph view vs. Tree view toggle (horizontal vs. vertical)
- Outline tab lists all blocks (click to navigate)

**Debugging / execution view:**

- Step-through debugger: run workflow steps incrementally
- Block-level logging: inspect data flowing through each block
- Historical run data drill-down to exact error block
- Mock data for different environments (staging, QA, production)

**Stealable ideas:**

- Step-through debugging → "slow-motion replay" mode in the facility where you can step through the run event-by-event, watching agents move in sequence
- Mock data / environment switching → different room "skins" or color themes for production vs. staging runs

### Kestra

**Sources:** [Kestra executions UI](https://kestra.io/docs/ui/executions), [Kestra features](https://kestra.io/features)

**Execution detail tabs:**

- Overview: State timeline, inputs/outputs, flow variables
- Gantt: Task duration visualization
- Topology: DAG view (green=success, red=failed), click tasks for logs
- Logs: Filterable by level, copyable, downloadable
- Outputs: Task outputs with debug expression evaluator
- Metrics: Task-specific metrics (token usage, row counts)
- Dependencies: Cross-flow execution relationships

**Operator controls:**

- Bulk operations via checkboxes: Restart, Kill, Pause, Force Run
- Individual: Set labels, change state, replay from specific task
- "Fix with AI" button on failed tasks (AI copilot integration)
- Previous/Next execution navigation

**Stealable ideas:**

- "Fix with AI" button on failed tasks → in the room, clicking a failed agent could offer "Ask agent to retry with guidance" as a command option
- Debug expression evaluator on outputs → power-user feature in the side panel
- Metrics tab showing token usage → wall monitor showing cost/resource metrics for the current run
- Multiple lenses on same execution (Gantt, Topology, Logs, Outputs, Metrics) → different "monitors" on the control console wall, each showing a different lens

### Argo Workflows

**Sources:** [Argo Workflows overview](https://argoproj.github.io/workflows/), [Argo DAG documentation](https://argo-workflows.readthedocs.io/en/latest/walk-through/dag/)

**DAG visualization:**

- Tasks as a graph of dependencies with edges showing order
- Step status displayed on nodes
- Logs accessible by clicking failed task → logs button

**Operator controls:**

- Configurable automatic retries with policies (Always, OnFailure)
- Retry limits, max duration, backoff mechanisms
- Suspend/resume at specific steps (manual approvals, external dependencies)
- Resume from CLI, API, or UI

**Stealable ideas:**

- Suspend/resume at specific steps → an agent visibly "paused" at their station, waiting. A clock or hourglass animation. Click to resume.
- Backoff visualization → agent walks away from station, comes back, walks away again (longer each time)

### AgentPrism (Evil Martians)

**Sources:** [AgentPrism blog post](https://evilmartians.com/chronicles/debug-ai-fast-agent-prism-open-source-library-visualize-agent-traces), [GitHub](https://github.com/evilmartians/agent-prism)

**Four visualization components:**

1. **Tree View**: Hierarchical parent-child display. Red highlighting for problems. Collapsed summaries for repetitive sequences.
2. **Timeline View**: Gantt-style execution with color-coded status (green/red/yellow). Real-time cost accumulation ($).
3. **Details Panel**: Input/output data, cost breakdown, performance metrics.
4. **Sequence Diagram**: Step-by-step replay with play/pause. Decision chain visualization. Loop detection.

**Design philosophy:**

- "Loops invisible in JSON become glaringly clear when made visual"
- Prioritizes human pattern recognition over manual analysis
- Detection badges inline on spans (anomaly markers)
- IDE-native integration (not a separate dashboard)

**Stealable ideas:**

- Loop detection badges → in the room, a "spinning" animation on an agent caught in a retry loop, with a count badge
- Cost accumulation display → a running cost counter on the control console, ticking up
- Sequence diagram with play/pause → the room itself becomes a replayable sequence; scrub through time to see agents moving through their workflow
- "Collapsed summaries for repetitive sequences" → when an agent does the same thing 50 times, show it as one action with a "x50" badge, not 50 animations

### LangSmith

**Sources:** [LangSmith observability](https://www.langchain.com/langsmith/observability), [LangSmith tracing quickstart](https://docs.langchain.com/langsmith/observability-quickstart)

**Trace visualization:**

- Waterfall view showing sequence and timing of chain components
- Parent/child nested spans (expandable hierarchy)
- Each run shows: inputs, outputs, execution time, position in call hierarchy
- Error waterfall: shows each step and exactly where error occurred
- Run history with latency, token usage, cost per run

**Stealable ideas:**

- Waterfall that pinpoints exactly where an error occurred → when clicking a failed run, the facility highlights the exact station where failure happened, with a glowing red indicator and the error message in a thought bubble
- Token usage and cost per run visible in run history → a "meter" or "gauge" in the room showing resource consumption

### Buildkite

**Sources:** [Build canvas blog](https://buildkite.com/resources/blog/visualize-your-ci-cd-pipeline-on-a-canvas/), [Build canvas changelog](https://buildkite.com/resources/changelog/243-build-canvas-a-new-way-to-visualize-and-understand-your-builds/)

**Build canvas interaction patterns:**

- DAG with interactive dependency highlighting
- **Follow mode (`j` key)**: Auto-spotlights currently running steps during execution
- **Failure navigation (`f` key)**: Jumps directly to failed steps
- **Selection highlighting**: Click a step → upstream and downstream dependencies light up, others recede
- **Conditional step toggling**: Show/hide conditional branches to simplify view
- **Virtualization**: Only renders visible nodes (handles thousands of steps)

**Stealable ideas:**

- **Follow mode is the killer feature for the room.** The camera auto-follows the currently active agent. When the active step changes, the camera pans to that station. This creates the "compulsive watchability" the session summary calls for.
- Failure navigation → press a key and the camera snaps to the failing station
- Selection-based dependency highlighting → click a station, its upstream and downstream connections glow
- Virtualization for large builds → for multi-run views, only render detail for the room currently in view

---

## Industrial HMI design principles

**Sources:** [HMI design best practices (Aufait UX)](https://www.aufaitux.com/blog/hmi-design-best-practices/), [UX for the industrial environment (UXmatters)](https://www.uxmatters.com/mt/archives/2017/08/ux-for-the-industrial-environment-part-1.php)

These principles from industrial control room design are directly applicable:

### 1. Situational awareness hierarchy

Industrial HMI follows a three-level awareness model:

1. **Perceive** — see the data (what is the value?)
2. **Comprehend** — understand the meaning (is it normal?)
3. **Project** — predict the outcome (will it become a problem?)

The room must support all three. Perceive = agent positions and animations. Comprehend = color-coding and thought bubbles. Project = time-ring color transitions (green → amber → red as duration grows).

### 2. Reserve color for abnormal states

Industrial standard: normal operations use muted, desaturated colors. Bright/saturated colors are reserved EXCLUSIVELY for alarms and abnormal states. This means:

- A healthy room should look calm and neutral
- Red appears only when something fails
- Amber appears only when something is slow or concerning
- Green appears briefly for completion confirmations, then fades

### 3. Alarm tiering

Not all problems are equal. Industrial HMI uses at minimum three tiers:

- **Critical**: Animated/flashing, red, requires immediate action
- **Warning**: Static, amber, requires awareness
- **Informational**: Subtle indicator, no urgency

In the room: a failed step gets a flashing red station. A slow step gets an amber glow. A completed-with-warnings step gets a brief yellow flash then normal.

### 4. The two-to-three-click rule

All critical information must be reachable within 2-3 interactions from the overview. In the room:

- Glance = 0 clicks (the room itself)
- Hover = 0 clicks (tooltip)
- Click agent = 1 click (station detail)
- Click artifact in detail = 2 clicks (full content)

### 5. Progressive disclosure, not information hiding

Show summary data everywhere. Make detail available on demand. Never force users to navigate away from the overview to answer basic questions.

### 6. Every action gets immediate feedback

When an operator issues a command (cancel, retry), the visual change must be instantaneous. In the room: clicking "Cancel Run" should immediately change the room's visual state — lights dim, conveyors stop, agents stand up from stations.

---

## Spatial and game-inspired precedents

### CodeCity (software-as-city metaphor)

**Sources:** [CodeCity paper](https://dl.acm.org/doi/10.1145/1370175.1370188), [CodeCharta](https://codecharta.com/)

Classes as buildings, packages as city districts. Metrics mapped to building dimensions (height=methods, width=attributes). Traversable 3D city for program comprehension.

**Relevance:** Demonstrates that spatial metaphors genuinely aid comprehension. The room IS a CodeCity, but for runtime execution state rather than static code structure.

### Factorio UI principles

**Source:** [Factorio FFF #212](https://www.factorio.com/blog/post/fff-212)

Key design principles from the Factorio team:

- **Spatial context for navigation**: Minimap with hover states to locate things
- **Help buttons throughout**: Even improved layouts need contextual guidance
- **Predictable button conventions**: Left-to-right toolbar ordering
- **Respect existing mental models**: Don't force users to relearn established patterns
- **Layered interaction**: Fuel tab, station tab, conditions tab — separate concerns into focused dialogs

**Relevance:** The orchestration room is essentially a Factorio factory floor. The same principles apply: spatial overview with focused drill-downs, predictable control placement, and respect for user expectations about how buttons and panels work.

### Eficode Pipeline Game

**Source:** [Pipeline Game](https://www.eficode.com/pipeline-game)

A card game that teaches Continuous Delivery pipeline design. Uses physical game metaphors (cards, turns, strategy) to make abstract pipeline concepts tangible.

**Relevance:** Validates that game metaphors make pipeline concepts more intuitive and engaging. Our pixel-art room is the digital equivalent of making the abstract tangible through spatial play.

### Information radiators

**Sources:** [Agile Alliance](https://agilealliance.org/glossary/information-radiators/), [Build radiator best practices](https://blog.matthewskelton.net/2013/03/11/what-makes-an-effective-build-and-deployment-radiator-screen/)

The concept: displays that "radiate" information passively. You don't go to them; they come to you. Traffic-light indicators for build status. Always-visible, always-current.

**Relevance:** The orchestration room IS an information radiator. It should be designed to be left open on a secondary monitor, passively radiating run status. This reinforces "compulsive watchability" from the session summary.

---

## Implications for the orchestration room

### Physical objects as UI elements

Based on this research, the room should contain these physical objects that map to standard orchestration UI elements:

| Room object                                      | UI element it replaces                         | Interaction                                         |
| ------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------- |
| **Control console** (desk with buttons/monitors) | Run-level controls (cancel, re-execute, pause) | Click to open control panel overlay                 |
| **Wall-mounted timeline monitor**                | Gantt chart / timeline view                    | Always visible; shows simplified duration bars      |
| **Agent thought bubbles**                        | Status indicators / event badges               | Cycling content, freeze on hover                    |
| **Station glow/color**                           | Node status in DAG                             | Green=done, red=failed, amber=slow, neutral=working |
| **Conveyor belts between stations**              | Data flow lines / dependency edges             | Moving=active, stopped=blocked, speed=throughput    |
| **Terminal monitor**                             | Event log / structured log viewer              | Click to open scrolling event feed                  |
| **Progress board** (wall display)                | Batch progress / completion metrics            | Shows Done/Active/Blocked/Pending counts            |
| **Cost meter** (gauge on wall)                   | Token usage / cost tracking                    | Ticks up during execution                           |
| **Routing board** (pipeline diagram on wall)     | Pipeline overview / topology view              | Static reference showing the expected flow          |

### Camera and navigation

Steal from Buildkite:

- **Follow mode**: Camera auto-tracks the currently active agent/station
- **Failure snap**: Keyboard shortcut jumps camera to the failing station
- **Selection highlight**: Click a station → upstream/downstream dependencies glow, others dim

### The control console in detail

Based on how Temporal, Kestra, and Argo handle operator controls, the console should offer:

**Run-level commands:**

- Cancel / Terminate run (with confirmation)
- Pause / Resume run
- Re-execute from beginning
- Re-execute from failure point

**View controls:**

- Toggle follow mode
- Toggle thought bubble detail level
- Toggle time indicators
- Show/hide dependency lines
- Switch between spatial view and timeline view (same data, different lens — stolen from Temporal's three-view approach)

**Information displays:**

- Current run duration
- Step completion count (e.g., "4/7 complete")
- Total cost / token usage
- Active agent count

### The event stream monitor

Based on Gastown's event feed and Dagster's structured log viewer:

- Scrolling event feed showing agent actions in chronological order
- Filterable by agent, event type, severity
- Events are the text equivalent of what the spatial view shows visually
- Clicking an event in the feed highlights the corresponding station in the room

### Animation as information

Based on AgentPrism's sequence diagram and Retool's step-through debugger:

- Agent animations ARE the execution trace. Walking to a station = task scheduled. Sitting and typing = task running. Standing up and carrying artifact = task completed.
- Replay mode: scrub through time to see the run in slow motion or fast forward
- Loop detection: when an agent repeats the same action, show a count badge rather than repeating the animation endlessly

### Multi-run awareness

Based on Dagster's homepage and Prefect's dashboard:

- Multiple rooms visible in a floor plan / building view
- Each room is one run
- Room status visible from the floor plan level (room glowing red = failed run, green border = completed)
- Click into a room for the full spatial experience
- This is the F-vision "empire view" validated by industry tooling patterns
