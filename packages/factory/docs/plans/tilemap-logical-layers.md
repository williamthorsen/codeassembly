# Tilemap visualization: logical layers implementation plan

Implements the data-driven pipeline for the tilemap visualization. Every layer is a pure function, testable without rendering. The Excalibur scene consumes the final output.

**Design sources:**

- `packages/factory/docs/visions/architecture-plan.md` — module structure, type designs, migration phases
- `packages/factory/docs/visions/facility-architecture.md` (branch 293) — rooms as spatial containers, agent state derivation, position mapping, composability principles
- Existing catwalk pipeline — mapper → differ → choreographer pattern

---

## Architecture

```
CanonicalRunStatus (snapshot)
  → Layer 2: State derivation (what each agent/artifact is doing, where it's assigned)
      uses Layer 1: Layout constants (room geometry, slot positions)
    → Layer 3: Position resolver (layout + state → pixel coordinates)
      → Layer 4: Differ + transition planner (prev vs. next → animation instructions)
        → Excalibur scene (rendering)
```

### Key principles (from facility-architecture.md)

1. **Rooms don't know about the pipeline.** A room defines walls, floors, doors, slots, and furniture. It doesn't know whether it hosts "architecture" or "review."
2. **Agent state is derived, not tracked.** `CanonicalRunStatus` is a snapshot. Agent state is a pure function of the snapshot, not an event-driven state machine.
3. **The orchestrator is the only agent that references other agents.** All other agents are self-contained.
4. **Position mapping is the single point of composition.** Layout constants and agent states are independent inputs; the position resolver combines them.
5. **Animation is a pure presentation concern.** It receives (previous position, target position) and interpolates. It doesn't know why the agent moved.

---

## Layer 1: Layout constants

**Purpose:** Define the physical facility — rooms, slots, corridors, gathering points. Pure spatial data with no pipeline semantics.

### Files

**`tilemap/layout/room-definitions.ts`** — Room catalogue

```typescript
/** Tile-space bounding box. */
interface Rect {
  x: number; y: number; w: number; h: number;
}

type SlotType = 'workstation' | 'display' | 'storage' | 'gathering';
type Direction = 'up' | 'down' | 'left' | 'right';

interface SlotDefinition {
  id: string;             // e.g. "analysis-ws-0", "review-ws-2"
  position: { tileX: number; tileY: number };
  type: SlotType;
  facing: Direction;      // which way an agent at this slot faces
}

interface DoorDefinition {
  position: { tileX: number; tileY: number };
  side: 'top' | 'bottom' | 'left' | 'right';
}

interface RoomDefinition {
  id: string;
  label: string;
  bounds: Rect;
  doors: DoorDefinition[];
  slots: SlotDefinition[];
}

// Room catalogue — spatial only, no pipeline knowledge
const ANALYSIS_LAB: RoomDefinition = { ... };  // 2 workstations, wall displays
const CONTROL_ROOM: RoomDefinition = { ... };  // 1 workstation (orchestrator)
const WORKSHOP: RoomDefinition = { ... };      // 1 workstation (coder)
const REVIEW_BAY: RoomDefinition = { ... };    // 3–4 workstations (reviewers)
const DELIVERY_ROOM: RoomDefinition = { ... }; // artifact accumulation, status board
```

**`tilemap/layout/facility-layout.ts`** — Facility composition and lookup functions

```typescript
interface FacilityLayout {
  rooms: Record<string, RoomDefinition>;
  corridorWaypoints: Array<{ id: string; tileX: number; tileY: number }>;
  gatheringPoints: Array<{ tileX: number; tileY: number }>;

  /** Look up pixel position for a named slot. */
  slotPosition(slotId: string): { x: number; y: number };

  /** Look up pixel center of a room. */
  roomCenter(roomId: string): { x: number; y: number };

  /** All slot IDs of a given type in a room. */
  slotsInRoom(roomId: string, type?: SlotType): string[];

  /** Corridor waypoint path between two rooms. */
  corridorPath(fromRoomId: string, toRoomId: string): Array<{ x: number; y: number }>;
}

function createFacilityLayout(): FacilityLayout;
```

### Notes

- Coordinates are in tile units in definitions, converted to pixels via `tileX * TILE_SIZE` in `slotPosition()`.
- Corridor paths are hardcoded waypoint sequences for v1. Auto-routing from door positions is deferred.
- Room positions match the v2 prototype layout (30×22 tiles) — **not** the Phase 1 placeholder (20×15). The Phase 1 `dimensions.ts` constants will be updated to match.
- Gathering points (water cooler areas) are where idle agents stand before assignment.

### Tests (`__tests__/facility-layout.test.ts`)

- Every slot ID resolves to a valid pixel position
- Every room has at least one slot
- `slotsInRoom()` returns correct IDs for each room
- `corridorPath()` returns a non-empty waypoint sequence for every room pair
- No two slots overlap (positions are unique)

---

## Layer 2: State derivation

**Purpose:** Transform `CanonicalRunStatus` into a complete description of every entity's logical state and room/slot assignment. Pure function, no pixels, no rendering.

### Files

**`tilemap/types.ts`** — Extend with scene config types

```typescript
// --- Room state ---

interface TilemapRoomState {
  id: string;
  active: boolean; // a phase assigned to this room is in progress
  completed: boolean; // all phases assigned to this room are done
  hasAlerts: boolean; // any agent in this room has warning/critical severity
}

// --- Agent state ---

type AgentStatus = 'idle' | 'working' | 'producing' | 'done' | 'blocked' | 'concerned';

interface TilemapAgentState {
  id: string; // e.g. "arch", "coder", "reviewer-0"
  role: string; // human-readable: "architect", "correctness-reviewer"
  roleType: RoleType;
  status: AgentStatus;
  roomId: string; // assigned room
  slotId: string; // assigned slot within room
}

// --- Orchestrator state ---

interface TilemapOrchestratorState {
  roomId: string; // which room the orchestrator is at
  status: 'idle' | 'dispatching' | 'monitoring' | 'collecting' | 'delivering' | 'done';
  carriedArtifacts: CarriedArtifact[];
  codeBadge: CodeBadge | null;
  waiting: boolean;
}

// --- Artifact state ---

type ArtifactStatus = 'on_desk' | 'delivered';

interface TilemapArtifactState {
  id: string; // composite key for diffing
  label: string;
  color: string;
  status: ArtifactStatus;
  roomId: string;
  slotId: string; // which slot's desk it sits on
  side: 'input' | 'output';
  version?: number;
}

// --- Scene config (full state snapshot) ---

interface TilemapSceneConfig {
  rooms: TilemapRoomState[];
  orchestrator: TilemapOrchestratorState;
  agents: TilemapAgentState[];
  artifacts: TilemapArtifactState[];
  thoughtBubbles: ThoughtBubbleConfig[]; // from existing mapper
}
```

**`tilemap/mappers/agent-assignments.ts`** — Assignment layer (thin mapping)

```typescript
/** Which room and slot each phase's agent is assigned to. */
const PHASE_ASSIGNMENTS: Record<PhaseName, { roomId: string; slotId: string }> = {
  architecture: { roomId: 'analysis', slotId: 'analysis-ws-0' },
  planning:     { roomId: 'analysis', slotId: 'analysis-ws-1' },
  implementation: { roomId: 'workshop', slotId: 'workshop-ws-0' },
  review:       ...,  // dynamic — handled by assignReviewers()
  simplifier:   { roomId: 'review-bay', slotId: 'review-ws-3' },
  holistic:     { roomId: 'review-bay', slotId: 'review-ws-4' },  // or separate room
  summary:      { roomId: 'control', slotId: 'control-ws-0' },
};

/** Assign N reviewers to sequential review bay slots. */
function assignReviewers(
  reviewerNames: string[],
  layout: FacilityLayout,
): Array<{ agentId: string; role: string; roomId: string; slotId: string }>;

/** Character sprite for each agent role. */
const AGENT_SPRITES: Record<string, CharacterSpriteId> = {
  orchestrator: 'Adam',
  architect: 'Alex',
  planner: 'Amelia',
  coder: 'Dan',
  // reviewers assigned round-robin from pool: Bob, Ash, Rob, ...
};
```

**`tilemap/mappers/run-to-tilemap.ts`** — Main state mapper

```typescript
function mapRunToTilemap(status: CanonicalRunStatus, layout: FacilityLayout): TilemapSceneConfig;
```

Sub-functions (parallel to catwalk mapper decomposition):

| Function                                              | Input                            | Output                     | Reuses                                                    |
| ----------------------------------------------------- | -------------------------------- | -------------------------- | --------------------------------------------------------- |
| `buildRoomStates(status, assignments)`                | run status + assignment map      | `TilemapRoomState[]`       | —                                                         |
| `buildOrchestratorState(status, currentPhase)`        | run status + inferred phase      | `TilemapOrchestratorState` | `buildCarriedArtifacts()`, `buildCodeBadge()` from shared |
| `buildAgentStates(status, currentPhase, assignments)` | run status + phase + assignments | `TilemapAgentState[]`      | `resolveAgentState()` from shared, maps to `AgentStatus`  |
| `buildArtifactStates(status, assignments)`            | run status + assignment map      | `TilemapArtifactState[]`   | `lookupArtifactColor()` from shared                       |
| `mapRunToThoughtBubbles(status)`                      | run status                       | `ThoughtBubbleConfig[]`    | Existing mapper (call, don't duplicate)                   |

### Agent state mapping

The shared `resolveAgentState()` returns `AgentAnimationState` (catwalk vocabulary). Map to `AgentStatus`:

| `AgentAnimationState` | `AgentStatus`                |
| --------------------- | ---------------------------- |
| `idle`                | `idle`                       |
| `working`             | `working`                    |
| `resting`             | `done`                       |
| `celebrating`         | `done`                       |
| `concerned`           | `concerned`                  |
| `deactivated`         | (agent excluded from config) |

### Orchestrator room logic

The orchestrator's `roomId` is derived from the current phase:

- Before any phase starts: `control`
- During a phase: the room assigned to that phase (e.g., `analysis` during architecture)
- After all phases: `delivery`
- When carrying artifacts: in corridor between source and destination room

### Tests (`__tests__/run-to-tilemap.test.ts`)

Scenarios using existing `createMockRunStatus()` fixtures:

1. **Empty run** — all agents idle, orchestrator in control room, no artifacts
2. **Architecture in progress** — architect working, others idle, orchestrator in analysis lab
3. **Implementation in progress** — arch+plan done, coder working, orchestrator in workshop
4. **Review in progress** — 3 reviewers working, orchestrator monitoring
5. **Completed run** — all agents done, artifacts on desks and delivered
6. **Failed run** — all agents concerned
7. **Skipped phases** — architect excluded when architecture skipped
8. **Waiting for input** — blocked agent in current phase
9. **Variable reviewer count** — 1 reviewer vs. 4 reviewers, correct slot assignments
10. **Re-review cycle** — coder re-enters working after review findings

Each test asserts:

- Correct agent count and IDs
- Correct `status` per agent
- Correct `roomId` and `slotId` per agent
- Correct orchestrator `roomId`
- Correct artifact count, colors, and placement
- Thought bubbles included in output

---

## Layer 3: Position resolver

**Purpose:** Given a `TilemapSceneConfig` (logical state with room/slot assignments) and a `FacilityLayout` (spatial constants), produce pixel positions for every entity.

### Files

**`tilemap/layout/position-resolver.ts`**

```typescript
interface ResolvedPosition {
  entityId: string;
  x: number; // pixel x
  y: number; // pixel y
  facing?: Direction; // from slot definition
}

interface ResolvedPositions {
  orchestrator: ResolvedPosition;
  agents: ResolvedPosition[];
  artifacts: ResolvedPosition[];
}

function resolvePositions(config: TilemapSceneConfig, layout: FacilityLayout): ResolvedPositions;
```

The resolver is a series of lookups:

- Agent position = `layout.slotPosition(agent.slotId)`
- Orchestrator position = `layout.roomCenter(orchestrator.roomId)`
- Artifact position = `layout.slotPosition(artifact.slotId)` + offset based on `side` (input left, output right)
- Idle agents (if using gathering points) = `layout.gatheringPoints[index]`

### Tests (`__tests__/position-resolver.test.ts`)

- Given a mock config with 2 agents at known slots, positions match expected pixel coordinates
- Artifact input/output offsets are distinct (input left of desk, output right)
- Orchestrator position matches the room center for its assigned room
- All positions are within the map bounds (0 to MAP_WIDTH, 0 to MAP_HEIGHT)

---

## Layer 4: Differ + transition planner

**Purpose:** Compare two `TilemapSceneConfig` snapshots to detect changes. Produce animation instructions from those changes.

### Files

**`tilemap/state/tilemap-differ.ts`** — Structural diff

```typescript
interface OrchestratorDiff {
  moved: { fromRoom: string; toRoom: string } | null;
  statusChanged: { from: string; to: string } | null;
  waitingChanged: { from: boolean; to: boolean } | null;
  carriedChanged: boolean;
  codeBadgeChanged: boolean;
}

interface AgentDiff {
  agentId: string;
  statusChanged: { from: AgentStatus; to: AgentStatus } | null;
  slotChanged: { fromSlot: string; toSlot: string } | null; // reviewer reassignment
}

interface ArtifactDiff {
  added: TilemapArtifactState[];
  statusChanged: Array<{ id: string; from: ArtifactStatus; to: ArtifactStatus }>;
}

interface ThoughtBubbleDiff {
  updated: string[]; // agent IDs whose bubble content changed
  added: string[]; // new bubbles
  removed: string[]; // removed bubbles
}

interface TilemapDiff {
  orchestrator: OrchestratorDiff;
  agents: AgentDiff[];
  artifacts: ArtifactDiff;
  thoughtBubbles: ThoughtBubbleDiff;
  rooms: Array<{ roomId: string; field: string; from: unknown; to: unknown }>;
  hasChanges: boolean;
}

function diffTilemapConfig(prev: TilemapSceneConfig, next: TilemapSceneConfig): TilemapDiff;
```

**`tilemap/choreography/transition-planner.ts`** — Animation instructions

```typescript
type TransitionType =
  | 'walk' // move along corridor path
  | 'state_change' // swap animation (idle → working)
  | 'fade_in' // new entity appears
  | 'fade_out' // entity disappears
  | 'artifact_appear' // artifact fades in on desk
  | 'artifact_deliver'; // artifact travels to delivery room

interface Transition {
  entityId: string;
  type: TransitionType;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  path?: Array<{ x: number; y: number }>; // for walk transitions
  durationMs: number;
  delayMs: number; // stagger start
}

interface TransitionPlan {
  transitions: Transition[];
  totalDurationMs: number;
}

function planTransitions(
  diff: TilemapDiff,
  prevPositions: ResolvedPositions,
  nextPositions: ResolvedPositions,
  layout: FacilityLayout,
): TransitionPlan;
```

Transition planning logic:

- Orchestrator moved → `walk` transition along `layout.corridorPath(fromRoom, toRoom)`
- Agent status changed → `state_change` (in-place animation swap)
- Agent added → `fade_in` at assigned slot
- Agent removed → `fade_out` at current position
- Artifact added → `artifact_appear` at desk
- Multiple transitions get staggered `delayMs` to avoid simultaneous visual changes

### Tests

**`__tests__/tilemap-differ.test.ts`:**

- No changes between identical configs → `hasChanges: false`
- Orchestrator moves from control to analysis → `moved` populated
- Agent goes from idle to working → `statusChanged` populated
- New artifact appears → `added` contains it
- Agent removed (phase skipped on re-derive) → detected

**`__tests__/transition-planner.test.ts`:**

- Orchestrator move → walk transition with corridor waypoints
- Agent state change → state_change transition at same position
- New agent → fade_in transition
- Multiple changes → transitions are staggered
- No changes → empty transition plan

---

## Integration: wiring into the scene

After layers 1–4 are built and tested, integrate into the existing scaffold.

### Changes to `TilemapScene.ts`

```typescript
class TilemapScene extends Scene {
  private layout: FacilityLayout;
  private prevConfig: TilemapSceneConfig | undefined;
  private prevPositions: ResolvedPositions | undefined;

  onInitialize(): void {
    this.layout = createFacilityLayout();
    this.buildFacility(); // render rooms (placeholder rectangles for now)
    this.positionCamera();
  }

  updateStatus(status: CanonicalRunStatus): void {
    const config = mapRunToTilemap(status, this.layout);
    const positions = resolvePositions(config, this.layout);

    if (this.prevConfig === undefined) {
      this.applyFullState(config, positions); // first render
    } else {
      const diff = diffTilemapConfig(this.prevConfig, config);
      if (diff.hasChanges) {
        const plan = planTransitions(diff, this.prevPositions!, positions, this.layout);
        this.executeTransitions(plan); // animate changes
      }
    }

    this.prevConfig = config;
    this.prevPositions = positions;
  }
}
```

### Changes to `TilemapCanvas.tsx`

Wire `status` prop updates through to the scene:

```typescript
useEffect(() => {
  if (sceneRef.current && status) {
    sceneRef.current.updateStatus(status);
  }
}, [status]);
```

### Placeholder actors

For the first integration pass, agents and artifacts are rendered as colored circles/rectangles positioned by the resolver. Real sprites come later — swap images without changing any logic.

---

## Implementation order

| Step | What                               | Files                                                      | Depends on |
| ---- | ---------------------------------- | ---------------------------------------------------------- | ---------- |
| 1    | Types                              | `tilemap/types.ts`                                         | —          |
| 2    | Room definitions + facility layout | `tilemap/layout/room-definitions.ts`, `facility-layout.ts` | Step 1     |
| 3    | Assignment mapping                 | `tilemap/mappers/agent-assignments.ts`                     | Step 2     |
| 4    | State mapper + tests               | `tilemap/mappers/run-to-tilemap.ts`                        | Steps 1–3  |
| 5    | Position resolver + tests          | `tilemap/layout/position-resolver.ts`                      | Steps 2, 4 |
| 6    | Differ + tests                     | `tilemap/state/tilemap-differ.ts`                          | Step 4     |
| 7    | Transition planner + tests         | `tilemap/choreography/transition-planner.ts`               | Steps 5, 6 |
| 8    | Scene integration                  | `tilemap/scene/TilemapScene.ts`, `TilemapCanvas.tsx`       | Steps 4–7  |

Steps 1–7 are pure logic with no rendering dependency. Step 8 wires everything into Excalibur with placeholder visuals. Steps 1–3 can be implemented together as one unit. Steps 4–5 can be parallelized. Step 6–7 can be parallelized.

---

## What's deferred

- Real tileset rendering (LimeZu PNGs, Tiled map parsing) — swap in after logic is proven
- Character sprite loading and animation — swap in after positions are correct
- HTML overlay rendering (thought bubbles, time indicators) — after scene integration works
- Corridor auto-routing from door positions — hardcode waypoints for v1
- Dynamic room resizing — fixed rooms with max capacity for v1
- Delivery room artifact accumulation animation — after basic artifact placement works
- Governor commands — separate concern, future issue
