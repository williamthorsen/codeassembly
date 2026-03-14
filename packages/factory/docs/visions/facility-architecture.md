# Facility architecture: rooms, agents, and composability

Design document for the Excalibur.js facility visualization. Captures the spatial, behavioral, and compositional architecture derived from the v2 tilemap prototype, brainstorming sessions, and the logical layer implemented in branch 295.

---

## Two layers, one screen

The visualization has two complementary layers:

### Pipeline panel (information layer)

A horizontal strip across the top of the screen (or sidebar). Each pipeline phase is a card showing:

- Phase name, assigned agent, status (completed / active / pending)
- Elapsed time
- Key metrics (impact level, step count, finding counts)
- Artifact links (one-click access)

The active phase has a colored focus border. This panel answers "what's happening?" with zero ambiguity. It's Vision B's information architecture — progressive disclosure via glance → hover → click.

### The office (experience layer)

The main area below the panel. A pixel-art office where agents work, artifacts move, and the process comes to life. The office doesn't need to carry the informational weight — the panel does that. The office is free to be a **place**: alive, watchable, interactive.

**The office doesn't replace the pipeline panel — it animates it.** The panel says "Review: Round 2 of 3, criticality trending down." The office _shows_ you the orchestrator collecting findings, updating the whiteboard, carrying consolidated feedback to the coder.

---

## Phase groupings

The pipeline phases fall into three groups:

| Group                        | Phases                                                                                     | Character                              |
| ---------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| **Prep**                     | Architecture, Planning                                                                     | Sequential, analytical, done once      |
| **Iterative implementation** | Implementation, Review, Simplifier, Holistic review (all interleaved with coder revisions) | The loop — this is where the action is |
| **Wrap-up**                  | Summary                                                                                    | Sequential wind-down                   |

The middle group is where the office earns its keep. Prep and wrap-up are relatively quick to watch. The iterative loop — coder produces code, reviewers review, orchestrator consolidates, coder revises — is the story the office tells.

Importantly, simplifier and holistic reviewer are **still reviewers**. They feed back into the same coder. The full iteration loop is:

```
coder → [code review, silent-failure, test review] → orchestrator consolidates → coder revises
      → [simplifier] → orchestrator consolidates → coder revises
      → [holistic review] → orchestrator consolidates → coder revises
      → summary
```

Different specialists take turns at the review stations, but the choreography is the same each round.

---

## Office layout

Three zones: prep area, the workshop, and the governor's office. The orchestrator is _your_ agent — you work together in a room of your own.

```
┌───────────┐  ┌───────────────────────────────────────────┐
│           │  │            the workshop                    │
│  prep     │  │                                            │
│  area     │  │   coder          whiteboard                │
│           │  │    ┌─┐     ┌─────────────────────┐         │
│ architect │  │    │D│     │ ■ null check  [done] │         │
│ planner   │  │    └─┘     │ ■ array growth [wip] │         │
│           │  │            │ ■ coverage    [new]  │         │
│           │  │            └─────────────────────┘         │
│           │  │                                            │
│           │  │   reviewer 1   reviewer 2   reviewer 3     │
│           │  │    ┌─┐          ┌─┐          ┌─┐           │
│           │  │    │B│          │A│          │R│           │
│           │  │    └─┘          └─┘          └─┘           │
└───────────┘  └────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  governor's office                         │
│                                                          │
│  ┌─┐ orchestrator    ✓ arch.md  ✓ plan.md  ✓ changes.md │
│  │O│ (your agent)    ● code-review.md  ● test-review.md │
│  └─┘                                                     │
│  📟 terminal    📊 timeline    💰 cost     🔴 abort      │
│  [Run wrap-up]  [Push to remote]  [Create PR]            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### The governor's office

The orchestrator is your proxy in the facility — the only agent you can talk to. This is where you and your agent work together.

The room contains:

- **The orchestrator's desk** — where they return after dispatching work and collecting results
- **Delivered artifacts** — accumulate as phases complete, left-to-right
- **Control console** — terminal, timeline monitor, cost meter, abort button (see [control panel research](control-panel-research.md))
- **Action buttons** — appear as the run state makes them valid (Run wrap-up, Push to remote, Create PR)
- **Chat interface** — click the orchestrator to talk: ask questions, give instructions, course-correct

The orchestrator runs out to the workshop to dispatch agents, collect findings, update the whiteboard. They bring everything back to _you_ in the governor's office. The workshop is the workers' space. This room is yours.

### Reading order matches pipeline order

1. **Top-left: prep area** — architect and planner (first phases, then quiet)
2. **Top-right: the workshop** — coder + reviewers + whiteboard (the iterative loop)
3. **Bottom (full width): governor's office** — orchestrator + delivered artifacts + controls + actions

### Design rationale

- **Gravity = progress.** Top to bottom, ending at the governor's office where results land.
- **The coder stays put.** They're a workstation, not a courier.
- **The orchestrator runs errands.** Walks up to dispatch, collect, update the whiteboard. Returns to the governor's office with results. Their movement is the visualization's heartbeat.
- **The workshop is the workers' space.** No management presence. The coder and reviewers do their thing. The whiteboard tracks shared state.
- **The governor's office is the user's space.** This is where you watch, interact, and command. It's both the delivery room (output accumulates) and the control room (terminal, timeline, cost, abort).
- **Open plan** (no corridor walls). Desks, equipment, and subtle floor color differences define zones. Each "room" still exists virtually for slot assignment and position mapping.

### The workshop whiteboard

The whiteboard is the **physical manifestation of the review cycle**:

- Reviewers write findings on it (items appear)
- Orchestrator consolidates (items get grouped, prioritized)
- Coder addresses them (items get crossed off or marked "rejected")
- Next review round: new items appear, old ones stay resolved

This single prop tells the story of the iterative loop better than any corridor-walking animation. It answers "where are we in the review cycle?" at a glance — how many items are left on the board?

### The orchestrator as courier

Nothing goes directly between agents. The orchestrator is the **postal service**:

```
reviewers → findings → ORCHESTRATOR (consolidates) → consolidated findings → coder
```

The orchestrator's home is the governor's office. Their movement pattern:

- Walks up to prep area to dispatch architect/planner → returns to governor's office
- Walks up to workshop to dispatch coder → returns
- Walks up to workshop to dispatch reviewers → returns
- Walks up to workshop whiteboard to update findings → returns
- Walks up to coder's desk with consolidated findings → returns
- Places completed artifacts on the delivery table in the governor's office

Every errand starts and ends in the governor's office — your shared room. You see the orchestrator leave, watch them work in the workshop through the open-plan layout, and see them return with results. The rhythm of departures and returns is the visualization's heartbeat.

---

## Interaction model

### Observe (glance)

- Thought bubbles show what each agent is thinking/doing
- Time indicators show elapsed time per phase (green → amber → red)
- The whiteboard shows findings and their resolution status
- The pipeline panel shows phase-level progress
- Agent animation state (working, idle, blocked) is visible at a glance

### Inspect (hover)

- Hover on an agent: tooltip with role, current task, timing
- Hover on an artifact: tooltip with filename, type, summary
- Hover on a whiteboard item: finding detail

### Investigate (click)

- Click an artifact: detail panel with full content
- Click the orchestrator: **chat interface**. The orchestrator is the only agent you can talk to. "Why did you reject that finding?" "Schedule another review round." "What's taking so long?"
- Click a pipeline phase card: expanded view with artifacts and timeline

### Command (governor's office)

The governor's office is your **control panel**. It contains physical furniture objects that map to standard orchestration controls (see [control panel research](control-panel-research.md)):

| Object              | Function                                   | Availability            |
| ------------------- | ------------------------------------------ | ----------------------- |
| Terminal monitor    | Event log, scrolling feed of agent actions | Always                  |
| Timeline monitor    | Gantt-like duration bars per phase         | Always                  |
| Cost meter          | Token usage / running cost gauge           | Always                  |
| Abort button        | Cancel the run (with confirmation)         | Always                  |
| Delivered artifacts | Accumulate as phases complete              | Progressive             |
| **Run wrap-up**     | Trigger summary phase                      | After reviews settle    |
| **Push to remote**  | Push committed code                        | After summary completes |
| **Create PR**       | Open pull request                          | After summary completes |

Action buttons are greyed/hidden until the run state makes them valid. The governor's office is both where results accumulate and where you decide what to do with them.

**Chat with the orchestrator:** Click the orchestrator sprite to open a chat interface. Ask questions ("Why did you reject that finding?"), give instructions ("Schedule another review round"), or course-correct ("Focus on the payment module"). This is the governor's primary interaction — talking to your agent.

---

## Rooms as spatial containers

Each room is a **spatial container** with typed slots, not a component that knows about the pipeline. Rooms define _where things can go_, not _what they mean_.

### Room interface

```typescript
interface RoomDefinition {
  id: string;
  label: string;
  bounds: TileRect;
  wallTheme?: WallTheme; // optional — open plan may use floor zones instead
  floorTheme: FloorTheme;
  doors: DoorDefinition[];
  slots: SlotDefinition[];
  furniture: FurnitureItem[];
}

interface SlotDefinition {
  id: string;
  position: TileCoord;
  type: SlotType; // 'workstation' | 'display' | 'storage' | 'gathering'
  facing: Direction;
  equipment?: FurnitureItem[];
}
```

### Room catalogue

| Room              | Purpose                                            | Slots                                                                 | Key furniture                                                |
| ----------------- | -------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Prep area         | Architect + planner workstations                   | 2 workstations, 2 wall displays                                       | Analysis board, whiteboard                                   |
| Workshop          | Coder + rotating reviewers + shared findings board | 1 coder workstation, 3-5 reviewer workstations, 1 display             | Desktop PC, flat monitors, findings whiteboard               |
| Governor's office | Orchestrator's home + delivery + controls          | 1 orchestrator desk, 1 delivery table, control console, wall monitors | Terminal, timeline, cost meter, abort button, action buttons |

### Composability

Rooms are **independent units** that can be:

- **Added/removed** based on pipeline configuration
- **Resized** based on agent count (workshop grows if there are 5 reviewers)
- **Rearranged** without changing any room's internal logic
- **Reused** for different pipelines (the workshop pattern works for any "workers + shared state board" scenario)

---

## Agent behaviors

### The main agent distinction

The orchestrator is the **main agent** — the only one the user can talk to. All other agents are subagents: observable but not addressable. This maps directly to the runtime model where the orchestrator process spawns and manages subagent processes.

In the visualization:

- The orchestrator is the only clickable-to-chat character
- Subagents are observable (thought bubbles, status, artifacts) but not interactive
- The pipeline runs autonomously but the orchestrator _can_ be interrupted

### Common agent states

All agents share a base state set:

```
idle → working → done
         ↓
       blocked → working (when unblocked)
```

| State       | Visual                           | Thought bubble        | Position               |
| ----------- | -------------------------------- | --------------------- | ---------------------- |
| `idle`      | Standing at gathering point      | (none or casual)      | Water cooler, corridor |
| `working`   | At workstation, facing equipment | Role-specific content | At assigned slot       |
| `done`      | Relaxed pose                     | Completion note       | Near workstation       |
| `blocked`   | Stopped, looking around          | "Waiting for..."      | At assigned slot       |
| `concerned` | Alert posture                    | Warning/error content | At assigned slot       |

### Orchestrator lifecycle

The most complex agent. Lives in the governor's office, walks up to the workshop and prep area to dispatch work and collect results.

```
idle (at desk in governor's office)
  → dispatching (walks up to prep area or workshop to assign agents)
  → monitoring (back at desk, watching progress)
  → collecting (walks up to reviewer stations, gathers findings)
  → consolidating (back at desk, producing consolidated findings)
  → delivering (walks up to coder with consolidated findings)
  → ... (review cycle repeats)
  → delivering (places final artifacts on delivery table in governor's office)
  → done
```

Every errand starts and ends in the governor's office. The rhythm of departures and returns is the visualization's heartbeat. The user watches their agent leave, do something in the workshop, and come back with results.

### Coder revision cycle

The coder can re-enter `working` after reviews:

```
idle → working → done → working (revision) → done → ...
```

Each revision round is triggered by the orchestrator delivering consolidated findings. The coder doesn't decide to revise — the orchestrator brings the work to them.

### Reviewer pool

Reviewers share identical behavior but maintain independent state. The pool occupies the workshop's reviewer slots. Different review aspects (code review, silent failure, test, simplifier, holistic) rotate through the same physical stations across rounds.

---

## Artifact lifecycle

Artifacts move through the system. These states describe the artifact's **lifecycle**, not its physical location — the visualization layer decides how each state looks spatially.

```
created → in_transit → delivered
```

| State        | Meaning                                               | Example                                                                             |
| ------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `created`    | The producing agent has it; no one else does yet      | Architect finishes → `architecture-assessment.md` exists but hasn't been handed off |
| `in_transit` | Handed to the orchestrator, moving through the system | Orchestrator collected review findings, carrying them to the coder                  |
| `delivered`  | Reached its recipient(s), available for use           | Plan delivered to coder as input; also recorded in governor's office                |

Artifacts can have multiple recipients. A plan is delivered to the coder (as input for implementation) and to the governor's office (as a record). Review findings are delivered to the orchestrator (for consolidation), not directly to the governor.

### Artifact types and colors

| Type                    | Color  | Produced by             |
| ----------------------- | ------ | ----------------------- |
| Architecture assessment | Blue   | Architect               |
| Implementation plan     | Blue   | Planner                 |
| Change summary          | Yellow | Coder                   |
| Commit                  | Yellow | Coder                   |
| Code review             | Red    | Code reviewer           |
| Silent failure review   | Red    | Silent failure reviewer |
| Test review             | Red    | Test reviewer           |
| Consolidated findings   | Green  | Orchestrator            |
| Final summary           | Green  | Orchestrator            |

---

## Layered architecture

```
CanonicalRunStatus (data)
  → State derivation (what each agent/artifact is doing)
    → Position mapping (layout + state → coordinates)
      → Differ + transition planner (what changed, how to animate)
        → Excalibur scene (rendering)
```

Each layer is independent. State derivation doesn't know about pixels. Position mapping doesn't know about animations.

### Layer 1: layout constants

Pure spatial data. Room positions, slot positions, corridor waypoints. No pipeline semantics.

```typescript
interface FacilityLayout {
  rooms: Record<string, RoomDefinition>;
  slotPosition(slotId: string): Position;
  roomCenter(roomId: string): Position;
  slotsInRoom(roomId: string, type?: SlotType): string[];
  corridorPath(fromRoomId: string, toRoomId: string): Position[];
}
```

### Layer 2: state derivation

Pure function: `CanonicalRunStatus → TilemapSceneConfig`. Derives agent states, artifact states, room states, thought bubble content.

```typescript
interface TilemapSceneConfig {
  rooms: TilemapRoomState[];
  orchestrator: TilemapOrchestratorState;
  agents: TilemapAgentState[];
  artifacts: TilemapArtifactState[];
  thoughtBubbles: ThoughtBubbleConfig[];
}
```

Key sub-functions:

- `buildAgentStates()` — phase status → agent status
- `buildOrchestratorState()` — current phase → orchestrator room + status
- `buildArtifactStates()` — completed phases → artifact placements
- `mapRunToThoughtBubbles()` — agent state + run data → bubble content

### Layer 3: position resolution

Single point of composition: `TilemapSceneConfig + FacilityLayout → ResolvedPositions`.

```typescript
interface ResolvedPositions {
  orchestrator: ResolvedPosition;
  agents: ResolvedPosition[]; // each with x, y, facing
  artifacts: ResolvedPosition[]; // each with x, y, offset side
}
```

### Layer 4: differ + transition planner

Compares two `TilemapSceneConfig` snapshots, produces animation instructions.

```typescript
// 4A: What changed?
function diffTilemapConfigs(prev: TilemapSceneConfig, next: TilemapSceneConfig): TilemapDiff;

// 4B: How to animate it?
function planTransitions(diff, prevPositions, nextPositions, layout): TransitionPlan;
```

Transition types: `walk`, `state_change`, `fade_in`, `fade_out`, `artifact_appear`, `artifact_deliver`. Transitions are staggered (150ms delay) to avoid simultaneous visual changes.

---

## Branch 295: implementation status

Branch 295 implements layers 1-4 as pure TypeScript functions with comprehensive tests. Current status:

### Implemented

- **Room definitions** — 5 rooms with slots, doors, bounds (analysis, control, workshop, review-bay, delivery)
- **Facility layout** — slot position lookups, room centers, 20 corridor paths
- **Agent assignments** — phase-to-room-slot mapping, reviewer round-robin, orchestrator room derivation
- **State mapper** (`mapRunToTilemap`) — full `CanonicalRunStatus` → `TilemapSceneConfig` transformation
- **Thought bubble mapper** — content derivation with severity-aware formatting
- **Position resolver** — scene config + layout → pixel coordinates
- **Differ** — change detection across all entity types
- **Transition planner** — diff → animation instructions with staggering
- **TilemapScene** — Excalibur scene that wires all layers together, using geometric placeholders

### Not yet implemented

- Tileset-based rendering (currently uses colored circles/rectangles as placeholders)
- The refined office layout from this document (branch 295 uses the earlier 5-room layout)
- Workshop whiteboard as a visual element
- Pipeline panel (top-of-screen information strip)
- Click-to-chat on orchestrator
- Actual sprite integration (LimeZu Modern Interiors / Modern Office)
- Artifact state rename: `on_desk` → `created`, add `in_transit` (branch 295 uses `on_desk` | `delivered`)

### Interfaces to preserve

Branch 295's interfaces align well with this document's architecture. Key types to keep:

- `TilemapSceneConfig` as the scene snapshot type
- `FacilityLayout` with its query methods (`slotPosition`, `corridorPath`, etc.)
- `TilemapDiff` + `TransitionPlan` for the animation pipeline
- `TilemapAgentState`, `TilemapArtifactState`, `TilemapOrchestratorState`

The room definitions and slot assignments need updating to match the new layout (prep area + workshop instead of separate analysis/coder/review rooms), but the interfaces themselves are sound.

---

## Flexibility

The layout pattern (prep area, workshop, orchestrator station, delivery) generalizes to any orchestrated flow that follows the analysis → iteration → summary structure:

| Zone              | Abstract role                  | Dev pipeline                                  | Research pipeline               |
| ----------------- | ------------------------------ | --------------------------------------------- | ------------------------------- |
| Prep area         | Analysts                       | Architect, Planner                            | Scope definer, Question framer  |
| Workshop          | Workers + shared board         | Coder + Reviewers + Findings whiteboard       | Researchers + Questions board   |
| Governor's office | Your agent + output + controls | Orchestrator + Artifacts + Terminal + Actions | Coordinator + Report + Controls |

The workshop scales (more desks, same whiteboard) and the reviewer stations rotate occupants. The spatial metaphor stretches as long as there's a coordinator orchestrating workers.

---

## Relationship to prototype

The v2 prototype (`prototype-tilemap-v2.html`) validates the visual language with hardcoded data:

| Architecture layer   | Prototype equivalent                                      |
| -------------------- | --------------------------------------------------------- |
| `RoomDefinition`     | `const rooms = { analysis: { x:1, y:1, w:9, h:7 }, ... }` |
| `SlotDefinition`     | Hardcoded furniture + character positions per room        |
| Agent state machines | Implied by thought bubble content                         |
| Position mapper      | Hardcoded `drawChar()` calls with tile coordinates        |
| Artifact lifecycle   | Hardcoded `addArtifact()` and `addDelivered()` calls      |
| Status board         | Hardcoded HTML in delivery room                           |
| Animation layer      | Not present (static)                                      |

The prototype uses the earlier 5-room layout. The next prototype iteration should adopt the layout from this document (prep + workshop + orchestrator + delivery).
