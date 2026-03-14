# Vision B: The run timeline

## Elevator pitch

The run timeline treats an orchestrated AI development run the way a developer's brain already models it: as a sequence of work phases flowing left to right, with artifacts as the connective tissue between them. Instead of hiding data behind game sprites, it puts structured content front and center -- diffs, findings, timing, and phase outcomes -- inside a spatial layout that makes the pipeline's flow legible at a glance. A persistent timeline spine gives instant orientation ("where are we?"), expandable phase cards give rapid drill-down ("what happened here?"), and inline artifact viewers give immediate access to real content ("show me the diff") without leaving the visualization. It is a dashboard that moves.

---

## Layer 1: Metaphor and theme

### The visual world

The user inhabits a **horizontal timeline** -- not a game world, but a purposeful spatial arrangement where left-to-right position encodes temporal progress and pipeline phase. The metaphor is closer to a CI/CD pipeline visualization or a git graph than a factory floor, but with two key differences:

1. **It is alive.** During a live run, the timeline grows rightward. The active phase pulses. Agents appear as compact, animated avatars at their phase positions -- small enough to be decoration, large enough to convey state (working, idle, celebrating, concerned). The avatars provide warmth and personality without demanding cognitive attention.

2. **It is deep.** Each phase position on the timeline is not just a status dot -- it is a card that can expand to reveal full artifact content. The timeline is the navigation layer; the cards are the content layer. You never leave the timeline to inspect an artifact.

### Why this metaphor works for the data

The orchestration pipeline is inherently sequential (architecture -> planning -> implementation -> review -> simplification -> holistic -> summary) with one burst of parallelism (parallel reviewers within the review phase). A horizontal timeline maps directly to this structure:

- **Sequential phases** are cards arranged left to right on the timeline.
- **Parallel reviewers** are stacked vertically within the review phase card, showing that they execute simultaneously.
- **Artifacts flowing between agents** are represented as connection lines between cards, with artifact badges at the connection points. Clicking a badge opens the artifact inline.
- **Review iterations** (v1 -> v2 -> v3) are represented as nested loops within the review card, making the fix-cycle structure visible.

The metaphor does not require the user to learn a new visual language. Developers already read timelines (git log), pipelines (CI dashboards), and cards (Jira, Trello). This visualization composes those familiar patterns into something that fits the orchestration domain precisely.

### Aesthetic direction

- **Dark theme** with the existing CGA-16 palette as accent colors. Role-type colors (magenta for orchestrator, blue for analyst, green for planner, yellow for author, red for reviewer) appear as card borders, avatar tints, and artifact badges.
- **Monospace typography** for code content, technical labels, and timing data. Sans-serif for narrative text (task descriptions, summaries).
- **Restrained animation.** Phase transitions use smooth slide and fade. Active phases pulse gently. Completed phases settle into a resting state. No bouncing, no particle effects, no attention-grabbing motion unless something requires attention (a failure, a finding with fatal criticality).
- **Pixel-art avatars** remain as small companions at each phase card, providing continuity with the existing sprite system. They are 32x32px, positioned at the top-left of their phase card, and animate based on the agent's state. They humanize the data without dominating it.

---

## Layer 2: Information architecture

### The three-level hierarchy

**Level 1 -- Timeline overview (always visible)**

A horizontal spine across the top of the viewport. Each phase is represented as a node on the spine: a colored circle (role-type color) with a phase label below it. Nodes are connected by lines. The current phase node pulses. Completed nodes show a checkmark. Failed nodes show an X. Skipped nodes are dimmed and hollow. This row is always visible, even when a card is expanded, serving as a persistent orientation bar.

Attached to the spine is a **timing strip** -- a subtle horizontal bar beneath the nodes that is proportional to elapsed time. Each phase's segment of the strip reflects its actual duration, giving an intuitive sense of where time was spent.

Below the spine, a **run header bar** shows: project slug, ticket ID, run ID, branch, status, total duration, and the task description. This replaces the current StatusBar component.

**Level 2 -- Phase cards (scrollable row)**

Below the timeline spine, each phase is represented as a **phase card** -- a rectangular panel with:

- Phase name and role-type color accent (top border)
- Agent avatar (32px sprite, top-left corner)
- Agent name / role label
- Phase status badge (completed / in_progress / failed / skipped)
- Duration (e.g., "2m 30s")
- Artifact count badge (e.g., "3 artifacts")
- For review phase: sub-cards for each parallel reviewer, showing individual criticality and status
- Quality gates summary (for implementation phase: typecheck, lint, tests -- pass/fail indicators)

Phase cards are displayed in a horizontally scrollable row. During a live run, the viewport auto-scrolls to keep the active phase card in view. Cards have a collapsed default state (showing summary info) and an expanded state (showing full artifact content).

**Level 3 -- Artifact detail (expanded card)**

Clicking a phase card expands it downward, revealing its artifacts in an inline viewer:

- **Plans** (.md): rendered as formatted markdown with step counts highlighted.
- **Code diffs** (change-summary.md): rendered with syntax-highlighted diff blocks. When multiple iterations exist (v1, v2, v3), a tabbed interface allows switching between versions. A "compare v1 vs v3" toggle shows what changed across iterations.
- **Review findings**: rendered as a structured table with F/W/T/R/S/L severity badges. Each finding shows its category, description, and resolution status (if re-reviewed). Fatal findings (F) are highlighted with a red accent.
- **Summaries**: rendered as formatted markdown.

The expanded card pushes other cards down (or uses a slide-over panel on narrow viewports), preserving the user's spatial context on the timeline.

### How artifacts surface

Artifacts are not hidden behind navigation menus. They surface in three ways:

1. **Badge count on phase cards.** Every phase card shows how many artifacts it produced. The badges use artifact-type colors from the existing `ARTIFACT_COLORS` palette.

2. **Connection lines between cards.** When a phase produces output that becomes input to the next phase, a subtle animated line connects the two cards, with an artifact badge at the midpoint. This makes the flow of work visible.

3. **Inline expansion.** One click on a card or artifact badge opens the content inline. No modal. No navigation away. The timeline remains visible above.

### Review iteration visibility

The review phase card has special treatment for iteration tracking:

- A **round indicator** shows "Round 1 of 3", "Round 2 of 3", etc.
- Each round is a collapsible sub-section showing: reviewer findings, coder fix summary, re-review results.
- A **criticality trend** micro-chart shows how aggregated criticality changed across rounds (e.g., medium -> low -> none), making convergence visible at a glance.

---

## Layer 3: Interaction model

### Primary interactions

**Hover** -- Hovering a phase card on the timeline reveals a tooltip with: phase name, agent name, status, duration, and artifact summary. This answers "what happened here?" without clicking.

**Click phase card** -- Expands the card downward to show full artifact content. A second click collapses it. Only one card can be expanded at a time (accordion pattern), keeping the viewport manageable.

**Click artifact badge** -- Jumps directly to the artifact content within the expanded card. If the card is collapsed, it expands and scrolls to the artifact.

**Click avatar** -- Shows a popover with the agent's full identity (agent name, role, role type), the list of artifacts it produced, and its current animation state. This is a secondary interaction for users who want agent-level detail.

### Secondary interactions

**Timeline scrubbing** -- For completed runs, a scrubber control below the timeline spine allows the user to drag through the run's history, watching phase cards appear and fill in as the run progresses. This reuses the existing `PlaybackController` infrastructure, mapping snapshots to visual states.

**Keyboard navigation** -- Left/right arrow keys move between phase cards. Enter expands/collapses the focused card. Escape collapses any expanded card. Tab moves between artifacts within an expanded card.

**Diff comparison** -- Within the implementation card (or any phase with multiple artifact iterations), a "Compare" button opens a side-by-side diff view. The user selects two versions (e.g., v1 and v3) from dropdowns, and the viewer highlights changes between them.

**Search** -- A search bar (Cmd+F pattern) filters the timeline to show only phases or artifacts matching the query. Useful for post-mortem analysis on complex runs: "show me all fatal findings" or "find test-reviewer".

**Zoom** -- Mouse wheel or pinch gestures zoom the timeline horizontally, useful for runs with many review iterations that expand the review phase card significantly.

### Navigation for specific tasks

- **"Is the coder done?"** -- Glance at the timeline spine. The implementation node is either pulsing (in progress), checked (done), or X'd (failed). Zero clicks.
- **"What did the reviewer find?"** -- Click the review phase card. See findings table with F/W/T/R/S/L badges. One click.
- **"Show me the diff."** -- Click the implementation card, then the change-summary artifact badge. Two clicks max.
- **"Why did this take so long?"** -- Look at the timing strip beneath the timeline spine. The widest segment reveals the bottleneck. Zero clicks.

---

## Layer 4: Delight and engagement

### What makes it fun to watch

During a live run, the visualization is not static -- it builds itself in front of you:

1. **Phase cards materialize.** When a new phase starts, its card slides in from the right with a brief entrance animation. The agent avatar walks into the card and transitions to its "working" animation.

2. **The active phase breathes.** The current phase card has a subtle pulsing glow in its role-type color. The agent avatar within it is actively animating (typing, thinking). Everything else is quiet.

3. **Artifacts drop in.** When an artifact is written, a badge animates into place on the card with a brief flash of its artifact-type color. If the card is expanded, the content streams in -- first the filename, then the body, mimicking the feel of watching a file being written.

4. **Review drama.** During the review phase, reviewer cards appear in parallel (stacked vertically). Each reviewer's criticality badge fills in as they complete: green for none/low, amber for medium, red for high/fatal. The aggregated criticality indicator updates in real-time. If a fix cycle triggers, the coder avatar reappears with a brief "rolling up sleeves" animation, and a new iteration sub-section opens.

5. **Completion celebration.** When the run completes successfully, all agent avatars transition to "celebrating" state simultaneously. A confetti-style particle burst (small, brief, tasteful) emanates from the final summary card. The overall status transitions to a green "completed" state with total duration displayed prominently.

6. **Failure notification.** When the run fails, the active phase card turns red. The agent avatar transitions to "concerned" state. A structured error message appears in the expanded card. No celebration. The failure is communicated clearly but not dramatically.

### What makes developers keep it open

- **Ambient awareness.** The timeline provides a glanceable answer to "how's the run going?" without requiring active attention. The pulsing active phase and timing strip give orientation in peripheral vision.
- **Content accessibility.** Unlike purely decorative visualizations, this one provides real value: you can read the actual diff, the actual findings, the actual plan. It replaces the need to open artifact files separately.
- **Post-mortem utility.** After a run completes, the visualization becomes a structured report. The timeline scrubber lets you replay what happened. The expanded cards let you read every artifact. The comparison view lets you understand how the code evolved across iterations. This is not just entertainment -- it is a tool.
- **Speed.** Every common question is answerable in zero to two clicks. The information hierarchy means you almost never need to scroll or hunt.

---

## User-flow examples

### Flow 1: "Is my run healthy?"

The developer glances at the Factory tab. The timeline spine shows five completed nodes (checkmarks) and one pulsing node at "review". The timing strip shows that implementation took the longest segment so far. The review card shows "Round 2 of 3" with an amber criticality indicator. No action needed -- the run is proceeding normally through its second review iteration. Total elapsed time: 12m 45s.

### Flow 2: "What did the reviewer find, and did the coder fix it?"

The developer clicks the review phase card. It expands to show three parallel reviewer sub-cards:

- code-reviewer: criticality medium, 4 findings (1W, 2T, 1S)
- silent-failure-reviewer: criticality low, 2 findings (1R, 1L)
- test-reviewer: criticality low, 3 findings (2T, 1S)

Below the reviewer sub-cards, an "Iteration 1 fix cycle" section shows the coder's change-summary with a diff of what was changed. Below that, an "Re-review" section shows that code-reviewer was re-dispatched and returned criticality "none", and test-reviewer returned "none". The criticality trend micro-chart shows: medium -> none. The developer sees that all findings were addressed.

### Flow 3: "Show me what changed between the initial code and the final code"

The developer clicks the implementation card. It expands showing the initial change-summary (v1). The developer notices there is also a v2 artifact (from the fix cycle). They click the "Compare" button, select "v1" and "v2" from the dropdowns, and see a side-by-side diff highlighting what the coder changed in response to review findings. Added lines are green, removed lines are red. The developer can see exactly which review findings drove which code changes.

### Flow 4: "Why did this run take 25 minutes?"

The developer looks at the timing strip beneath the timeline spine. The implementation segment is noticeably wider than others -- it took 8 minutes. The review segment is also wide -- 10 minutes across two rounds. The developer clicks the review card and sees that the first review round took 4 minutes (3 reviewers in parallel), the fix cycle took 3 minutes, and the re-review took 3 minutes. The bottleneck was the fix cycle: the coder needed significant rework. The timing breakdown is visible without navigating away.

### Flow 5: "Replay what happened in this completed run"

The developer selects a completed run from the run selector. The timeline loads in its final state. They click the scrubber control and drag it to the beginning. The timeline resets: all cards disappear. As they drag rightward, cards materialize one by one in the order they occurred. Phase nodes light up on the spine. Artifacts badges appear. The developer can pause the scrubber at any point to examine the state of the run at that moment -- which phases had completed, what artifacts existed, what the current status was.

---

## Risks and mitigations

### Risk 1: Replacing Excalibur with a DOM/Canvas hybrid may be costly

The current visualization is built entirely on Excalibur.js (2D game engine). This vision proposes a fundamentally different rendering approach: mostly DOM-based (HTML/CSS for cards, panels, timeline) with small canvas elements for agent avatars and the timing strip.

**Mitigation:** The vision does not require abandoning Excalibur entirely. The agent avatars can remain as small Excalibur-powered canvas elements embedded within React components (the existing pattern of `CatwalkCanvas` embedding an `Engine` in a `<canvas>` element). The rest of the UI -- timeline spine, phase cards, artifact viewers -- is standard React with CSS. This is a hybrid approach: React owns layout and content, Excalibur owns the 32px sprite animations. The existing sprite system (`sprite-definitions.ts`, `catwalk-sprite-loader.ts`) is preserved. The existing data pipeline (`CanonicalRunStatus` -> mapper -> scene config) is extended, not replaced: the mapper produces both scene configs (for avatar animation) and card configs (for React rendering).

The migration can also be incremental. Phase 1: build the timeline and phase cards as a React overlay above the existing Catwalk visualization. Phase 2: replace the full-canvas Excalibur scene with embedded avatar canvases. Phase 3: add artifact content viewers.

### Risk 2: Information density may overwhelm on complex runs

A run with 3 review iterations, 3 parallel reviewers per iteration, and 20+ artifacts could produce a very tall expanded review card and a cluttered timeline.

**Mitigation:** Three design choices address this. First, the accordion pattern (only one card expanded at a time) limits vertical expansion. Second, within the review card, iterations are collapsible sub-sections -- only the latest iteration is expanded by default. Third, the artifact count badge on collapsed cards provides a summary without requiring expansion. For post-mortem analysis of very complex runs, the search/filter feature allows the user to narrow the view. The timeline spine always remains visible regardless of card expansion, providing consistent orientation.

---

## Assumptions

1. **Artifact content is available via the API.** The existing `fetchArtifactContent` API endpoint returns raw file content. This vision assumes that endpoint can serve markdown content that the frontend renders. No server-side rendering is assumed.

2. **Diff rendering can happen client-side.** The change-summary artifacts contain markdown with code blocks showing diffs. This vision assumes a lightweight client-side markdown renderer (e.g., `marked` or `remark`) and a diff-highlighting library (e.g., `diff2html`) can handle the content. These are small dependencies.

3. **The `CanonicalRunStatus` type provides sufficient timing data.** The vision relies on `startedAt` and `completedAt` timestamps on phases to compute durations and proportional timing strips. The existing type already includes these fields (with `UsageMetrics.durationMs` as a supplementary source).

4. **The playback controller can drive the timeline scrubber.** The existing `PlaybackController` steps through `CanonicalRunStatus` snapshots. This vision assumes the scrubber maps 1:1 to snapshots, with the timeline rendering the state at each snapshot position.

5. **Runs have at most ~10 agents and ~50 artifacts.** The card-based layout is designed for this scale. Runs with 50+ agents or 200+ artifacts would need pagination or grouping, which this vision does not address.

6. **The pixel-art sprite system is worth preserving.** The 32x32 SVG-based sprites provide visual personality. This vision downsizes them from scene protagonists to card companions, but preserves their animation states and role-type coloring.
