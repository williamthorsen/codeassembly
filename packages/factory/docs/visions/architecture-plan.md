# Tilemap visualization architecture plan

## Executive summary

This document describes how to integrate a tilemap-based visualization into Factory's existing architecture. The new visualization renders orchestration runs as a furnished office facility built from 16x16 pixel-art tiles (LimeZu Modern Interiors + Modern Office Revamped), replacing the catwalk's abstract diagram with a spatial "place" where agents inhabit rooms, sit at desks, and carry artifacts through corridors.

The key finding: roughly 70% of Factory's existing infrastructure is directly reusable. The visualization registry, status adapter, playback controller, canonical types, and the differ pattern all carry over unchanged. The mapper and scene require new implementations but follow the same structural patterns. The sprite system is the biggest departure -- moving from hand-drawn SVG sprite sheets to tileset-based sprite sheets with Tiled map integration. HTML overlays (thought bubbles, time indicators, artifact panels) are a new layer that sits between the existing React shell and Excalibur canvas.

The tilemap visualization registers alongside catwalk (not replacing it), selectable via the `vis` URL parameter. Both share `CanonicalRunStatus` as their input contract.

---

## 1. Reusability matrix

| Component                     | Location                                                               | Verdict               | Notes                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visualization registry        | `client/visualizations/registry.ts`                                    | **Directly reusable** | Add `tilemap: TilemapCanvas` entry. The registry is a simple `Record<string, VisualizationComponent>`; no changes to the registry mechanism.                                                                                                                                                                        |
| `VisualizationProps` contract | `client/visualizations/types.ts`                                       | **Directly reusable** | The contract is `{ status: CanonicalRunStatus }`. The tilemap component accepts the same props.                                                                                                                                                                                                                     |
| Status adapter                | `server/adapters/status-adapter.ts`                                    | **Directly reusable** | Parses `run-index.json` / `status.json` into `CanonicalRunStatus`. Visualization-agnostic -- no changes needed.                                                                                                                                                                                                     |
| Playback controller           | `client/playback/playback-controller.ts`                               | **Directly reusable** | Steps through `CanonicalRunStatus[]` snapshots and calls `onUpdate(status)`. Visualization-agnostic.                                                                                                                                                                                                                |
| Canonical types               | `shared/types/canonical.ts` (re-exports from `@codeassembly/run-core`) | **Directly reusable** | `CanonicalRunStatus`, `Phases`, `ArtifactEntry`, etc. are the domain model. No changes.                                                                                                                                                                                                                             |
| Phase inference utilities     | `shared/phase-inference.ts`                                            | **Directly reusable** | `findCurrentPhase`, `isPhaseEvaluated`, `isPhasePresentInData` -- used by the catwalk mapper and equally needed by the tilemap mapper.                                                                                                                                                                              |
| Shared constants              | `shared/constants/role-types.ts`, `palette.ts`, `artifact-colors.ts`   | **Directly reusable** | `PHASE_NAMES`, `PHASE_ROLE`, `PHASE_ROLE_TYPE`, `ROLE_TYPE_COLORS` -- needed by the tilemap mapper for the same domain logic.                                                                                                                                                                                       |
| Differ pattern                | `catwalk/state/catwalk-differ.ts`                                      | **Needs adaptation**  | The structural diffing approach (compare prev vs. next config, produce a typed diff) is sound and should be replicated. But the diff types are catwalk-specific (gates, chutes). The tilemap differ will produce room-level and agent-level diffs instead.                                                          |
| Mapper pattern                | `catwalk/mappers/run-to-catwalk.ts`                                    | **Needs adaptation**  | The `CanonicalRunStatus -> SceneConfig` pattern is identical. The mapper's sub-functions (`buildStations`, `buildAgents`, `buildOrchestrator`, `buildArtifacts`) translate almost directly, but output tilemap-specific config types (rooms instead of stations, tile positions instead of station indices).        |
| Scene config types            | `catwalk/types.ts`                                                     | **Needs replacement** | `CatwalkSceneConfig` describes stations, gates, chutes. The tilemap needs `TilemapSceneConfig` describing rooms, desks, corridors, tile-coordinate positions. New types required.                                                                                                                                   |
| Sprite system                 | `catwalk/sprites/`                                                     | **Needs replacement** | The catwalk uses custom SVG sprite sheets in a 4x3 grid with hand-authored frame coordinates. The tilemap uses LimeZu character sprite sheets (24 frames per direction, 4 directions) loaded as Excalibur `SpriteSheet` instances from PNG tileset files. Entirely different loading, slicing, and animation logic. |
| Layout system                 | `catwalk/layout/catwalk-layout.ts`                                     | **Needs replacement** | The catwalk layout computes pixel positions algorithmically from station indices and agent counts. The tilemap layout is defined by a Tiled `.tmj` map file with fixed room positions. Agents are placed at desk positions read from the map's object layers, not computed.                                         |
| Choreography                  | `catwalk/choreography/chute-choreographer.ts`                          | **Needs adaptation**  | The sequencing pattern (ascend -> walk -> descend) maps to a tilemap equivalent (stand up -> walk corridor -> sit at desk). The `SceneRefs` callback pattern carries over. New pathfinding along corridors replaces the linear rail movement.                                                                       |
| Actors                        | `catwalk/actors/`                                                      | **Needs replacement** | `StationAgentActor`, `OrchestratorActor`, `ArtifactActor` use catwalk-specific graphics (accent bars, chute-relative positioning). Tilemap agents are seated characters with desk-relative positioning. New actor classes needed, though they extend `ex.Actor` in the same way.                                    |
| React canvas component        | `client/components/CatwalkCanvas.tsx`                                  | **Needs adaptation**  | The Engine lifecycle pattern (create engine, add scene, `useEffect` for status updates) is identical. The tilemap canvas adds an HTML overlay layer for thought bubbles and time indicators, which CatwalkCanvas does not have.                                                                                     |
| Container resize hook         | `client/hooks/useContainerResize.ts`                                   | **Directly reusable** | Works with any Excalibur engine instance.                                                                                                                                                                                                                                                                           |

**Summary: 7 directly reusable, 4 need adaptation, 4 need replacement.**

---

## 2. Module structure

The tilemap visualization follows the catwalk directory pattern, with additions for the Tiled map, overlay system, and pathfinding.

```
client/visualizations/tilemap/
  types.ts                           # TilemapSceneConfig, TilemapDiff, room/desk/agent types
  actors/
    TilemapAgentActor.ts             # Seated/walking character with LimeZu sprite animations
    OrchestratorActor.ts             # Standing orchestrator character (idle, walking, delivering)
    DeskActor.ts                     # Desk with monitor, artifact slots, glow indicators
    ArtifactActor.ts                 # Small colored object placed on desks
  scene/
    TilemapScene.ts                  # Main Excalibur scene: loads Tiled map, manages actors, applies diffs
  mappers/
    run-to-tilemap.ts                # CanonicalRunStatus -> TilemapSceneConfig (parallels run-to-catwalk.ts)
  state/
    tilemap-differ.ts                # Diffs TilemapSceneConfig snapshots (parallels catwalk-differ.ts)
  sprites/
    tileset-loader.ts                # Loads LimeZu PNGs as Excalibur ImageSource/SpriteSheet instances
    character-animations.ts          # Builds idle/sit/walk/celebrate animations from LimeZu character sheets
    sprite-sheet-registry.ts         # Maps character names to sprite sheet URLs
    assets/                          # Tileset PNGs (Modern Interiors, Modern Office Revamped)
      room-builder-floors.png
      room-builder-walls.png
      modern-office.png
      characters/
        Adam_idle_32x32.png          # Orchestrator
        Alex_sit_32x32.png           # Architect
        ...
  layout/
    tilemap-layout.ts                # Reads Tiled map data, exposes room positions, desk positions, corridors
    pathfinding.ts                   # Corridor-based pathfinding (A* or waypoint graph)
  map/
    facility.tmj                     # Tiled map JSON export (rooms, furniture, collision, object layers)
    facility.tsx                     # Tiled tileset reference (embedded or external)
  constants/
    dimensions.ts                    # Tile size, map dimensions, camera defaults, overlay offsets
    rooms.ts                         # Room name constants, phase-to-room mapping
  choreography/
    tilemap-choreographer.ts         # Sequences agent walk/sit/deliver animations (parallels chute-choreographer.ts)
  overlays/                          # HTML overlay system (React components positioned over canvas)
    OverlayContainer.tsx             # Portal container for all overlays, syncs with engine world coordinates
    ThoughtBubble.tsx                # Agent thought bubble (cycling content, freeze-on-hover, red border)
    TimeIndicator.tsx                # Time-on-task badge (green/amber/red)
    ArtifactPanel.tsx                # Click-to-inspect artifact detail panel
    PipelineBar.tsx                  # Horizontal phase progress bar below the facility
```

**Corresponding React component:**

```
client/components/
  TilemapCanvas.tsx                  # Engine lifecycle + overlay layer (parallels CatwalkCanvas.tsx)
```

---

## 3. Tilemap rendering in Excalibur

### Tile size and scale

The LimeZu tilesets are natively 16x16 pixels but ship with 32x32 upscaled versions. Use the **32x32 versions** to match Excalibur's default pixel scale and avoid sub-pixel rendering issues. The prototype already uses 32x32 successfully.

### Tiled map integration

Design the facility layout in the [Tiled map editor](https://www.mapeditor.org/) and export as `.tmj` (Tiled JSON). This replaces the prototype's hardcoded tile coordinates with a designer-friendly authoring workflow.

**Map layers (bottom to top):**

1. **Floor** -- cream tiles for rooms, gray tiles for corridors (from `Room_Builder_Floors_32x32.png`)
2. **Floor shadows** -- subtle depth at wall/floor transitions (from `Room_Builder_Floor_Shadows_32x32.png`)
3. **Walls** -- lavender/gray wall segments (from `Room_Builder_Office_32x32.png`)
4. **Furniture base** -- desks, bookshelves, tables (from `Modern_Office_32x32.png`)
5. **Furniture top** -- monitors, plants, desk items that render above characters (from `Modern_Office_32x32.png`)
6. **Collision** -- invisible collision shapes marking walls, desks, impassable areas (Tiled object layer)
7. **Waypoints** -- named points marking desk seats, room centers, corridor junctions (Tiled object layer)

**Loading in Excalibur:**

```typescript
// In TilemapScene.onInitialize():
const mapData = await fetch('/assets/facility.tmj').then((r) => r.json());
const tilesets = await loadTilesets(mapData.tilesets); // ImageSource per tileset PNG

// Create Excalibur TileMap for each tile layer
for (const layer of mapData.layers.filter((l) => l.type === 'tilelayer')) {
  const tilemap = new ex.TileMap({
    rows: layer.height,
    columns: layer.width,
    tileWidth: 32,
    tileHeight: 32,
  });
  // Populate each tile's graphic from the tileset sprite sheet
  applyTileLayerData(tilemap, layer, tilesets);
  this.add(tilemap);
}
```

Excalibur's `TileMap` handles efficient rendering of the static tile layers. Each `Tile` references a `Sprite` from the tileset `SpriteSheet`, using the GID-to-sprite-index mapping from the Tiled JSON.

### Tile layering and the "furniture top" trick

The prototype notes identify a key rendering challenge: characters must appear **behind** desk monitors and **above** floors. Tiled layers map to Excalibur draw order:

1. Floor + shadows + walls (z-index 0-2): always behind everything
2. Furniture base (z-index 3): desks, bookshelves -- behind characters
3. **Characters** (z-index 4): agent actors walk and sit at this layer
4. Furniture top (z-index 5): monitor screens, overhead lamps -- in front of characters

This creates the illusion that characters sit "inside" their desk setups. The furniture-top layer is a second `TileMap` that renders after the character actors.

### "Place, not diagram" principle in practice

The tilemap architecture embodies this principle structurally:

- **The building exists before any data populates it.** The Tiled map defines rooms, corridors, walls, and furniture. When a run has zero agents, the facility is still a furnished office.
- **Agents inhabit the space.** Characters sit at specific desks, not at abstract station positions. Walking between rooms follows corridors with pathfinding, not instant teleportation.
- **Artifacts are physical objects.** Documents sit on desks as colored rectangles. The orchestrator picks them up and carries them through corridors.
- **Rooms have interior logic.** The control room has monitoring equipment. The analysis lab has dual workstations. The review bay scales to hold N reviewer desks.

---

## 4. HTML overlays over the Excalibur canvas

### Architecture

Overlays are React components rendered in a `position: absolute` container that sits on top of the Excalibur `<canvas>`. They are positioned using Excalibur's world-to-screen coordinate transform.

```
<div className="tilemap-wrapper" style={{ position: 'relative' }}>
  <canvas ref={canvasRef} className="game-canvas" />
  <OverlayContainer engineRef={engineRef}>
    {agents.map(agent => (
      <ThoughtBubble key={agent.id} worldPos={agent.worldPos} content={agent.thought} />
    ))}
    {agents.map(agent => (
      <TimeIndicator key={agent.id} worldPos={agent.worldPos} elapsed={agent.elapsed} />
    ))}
  </OverlayContainer>
</div>
```

### Coordinate synchronization

The `OverlayContainer` component reads the Excalibur engine's camera on every animation frame and re-positions child overlays:

```typescript
// Inside OverlayContainer, on each rAF tick:
const screenPos = engine.worldToScreenCoordinates(worldPos);
// Apply CSS transform to the overlay div
overlay.style.transform = `translate(${screenPos.x}px, ${screenPos.y}px)`;
```

This approach:

- Keeps overlays in the DOM (accessible, styleable, selectable text)
- Handles camera zoom and pan automatically
- Uses `requestAnimationFrame` for synchronization, not React re-renders (avoids per-frame React overhead)
- Falls back to CSS `pointer-events: none` on the container so clicks pass through to the canvas, except on interactive overlays

### Overlay types

**Thought bubbles** (primary glance-level channel):

- Positioned above the agent's head (world coordinate + offset)
- Cycle through content snippets on a timer (3-5 seconds per item)
- Staggered start times across agents to avoid simultaneous transitions
- Freeze content on hover (`pointer-events: auto` on the bubble element)
- Red border on alert conditions (fatal findings, blocked state)
- Content sourced from agent status: current activity summary, latest finding excerpt, "Waiting for..." text

**Time indicators** (always visible):

- Small badge positioned beside the agent's desk
- Shows elapsed time in `M:SS` format
- Color-coded: green (< threshold), amber (> threshold), red (> 2x threshold)
- Thresholds derived from historical phase durations or configurable defaults

**Artifact panel** (click-to-inspect):

- Triggered when the user clicks an `ArtifactActor` in the Excalibur scene
- The actor emits an Excalibur event; `TilemapCanvas` listens and sets React state to show the panel
- Panel renders as a sidebar or modal with artifact content from `run-index.json`
- Dismissible via close button, backdrop click, or Escape

**Pipeline bar** (persistent footer):

- Horizontal bar below the canvas showing phase progress
- Identical function to the prototype's pipeline status bar
- Pure React component, no coordinate sync needed (fixed position)

---

## 5. Mapper pattern adaptation

### What stays the same

The `run-to-tilemap` mapper follows the same decomposition as `run-to-catwalk`:

| Catwalk sub-function                      | Tilemap equivalent                        | Changes                                                                                                                                         |
| ----------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildStations(status)`                   | `buildRooms(status)`                      | Returns `RoomConfig[]` with tile-coordinate positions instead of linear station indices. Phase-to-room mapping replaces `PHASE_NAMES.map()`.    |
| `buildOrchestrator(status, currentPhase)` | `buildOrchestrator(status, currentPhase)` | Nearly identical logic. Output changes from `stationIndex` to `roomId: string` and `worldPos: { tileX, tileY }`.                                |
| `buildAgents(status, currentPhase)`       | `buildAgents(status, currentPhase)`       | Same phase iteration and `resolveAgentState` logic. Output adds `deskId: string` and `characterSprite: string` (which LimeZu character to use). |
| `buildGates(stations, phases)`            | Removed                                   | No gates in the tilemap. Corridor connectivity is implicit in the map topology.                                                                 |
| `buildArtifacts(status)`                  | `buildArtifacts(status)`                  | Same artifact iteration. Output changes from `stationIndex` / `agentSlotIndex` to `deskId` / `roomId`.                                          |
| `buildCarriedArtifacts(...)`              | `buildCarriedArtifacts(...)`              | Identical logic.                                                                                                                                |
| `buildCodeBadge(status)`                  | `buildCodeBadge(status)`                  | Identical logic (iteration counting).                                                                                                           |
| `buildInputArtifacts(...)`                | Removed or simplified                     | In the tilemap, artifacts appear on desks; the input/output distinction is visual (left side vs. right side of desk) rather than structural.    |
| `extractReviewerNames(...)`               | Reuse directly                            | Import from a shared utility or copy.                                                                                                           |

### What changes

1. **Position system:** Catwalk uses integer `stationIndex` + `slotIndex` to place everything on a 1D rail. Tilemap uses named `roomId` + `deskId` referencing positions defined in the Tiled map's object layer.

2. **Dynamic room scaling:** The review bay must accommodate 1-N reviewer desks. The mapper determines the reviewer count and the layout module selects desk positions accordingly (pre-placed in the Tiled map with named waypoints: `review-desk-0`, `review-desk-1`, etc.).

3. **Overlay data:** The mapper produces additional fields not present in catwalk: `thoughtBubbleContent`, `elapsedMs`, `alertLevel`. These power the HTML overlays.

4. **No gates:** Phase transitions are represented by the orchestrator walking from one room to another, not by gate actors opening.

### Shared code extraction

Before implementing the tilemap mapper, extract reusable logic from `run-to-catwalk.ts` into a shared module:

```
client/visualizations/shared/
  agent-state-resolver.ts           # resolveAgentState() -- identical logic for both visualizations
  artifact-utils.ts                 # lookupArtifactColor(), extractReviewerNames(), PHASE_TO_STATION, etc.
  orchestrator-utils.ts             # buildCarriedArtifacts(), buildCodeBadge()
```

This avoids duplicating ~150 lines of domain logic.

---

## 6. New types

### Scene config

```typescript
/** Unique identifier for a room in the facility. */
type RoomId = 'control' | 'analysis' | 'workshop' | 'review-bay' | 'corridor';

/** Unique identifier for a desk within a room. */
type DeskId = string; // e.g., 'analysis-desk-0', 'review-desk-2'

/** Character sprite identifier from the LimeZu character set. */
type CharacterSpriteId = string; // e.g., 'Adam', 'Alex', 'Amelia', 'Dan', 'Bob', 'Ash', 'Rob'

/** Animation states for tilemap agents. Superset of catwalk states, adding seated poses. */
type TilemapAgentAnimation =
  | 'idle-standing' // Standing, facing forward
  | 'idle-sitting' // Seated at desk
  | 'working-sitting' // Seated, typing animation
  | 'walking' // Moving between rooms
  | 'celebrating' // Completion animation
  | 'concerned' // Error/failure state
  | 'deactivated'; // Faded out, phase skipped

interface TilemapSceneConfig {
  rooms: RoomConfig[];
  orchestrator: TilemapOrchestratorConfig;
  agents: TilemapAgentConfig[];
  artifacts: TilemapArtifactConfig[];
  overlays: OverlayConfig[];
}

interface RoomConfig {
  id: RoomId;
  phase: PhaseName;
  label: string;
  active: boolean; // Whether the phase is currently in progress
  completed: boolean; // Whether the phase has finished
  skipped: boolean; // Whether the phase was decided to be skipped
}

interface TilemapOrchestratorConfig {
  roomId: RoomId;
  deskId: DeskId | null; // null when walking or at corridor waypoint
  animation: TilemapAgentAnimation;
  carriedArtifacts: CarriedArtifactConfig[]; // Reuse from catwalk types
  codeBadge: { label: string; color: string } | null;
  waiting: boolean;
}

interface TilemapAgentConfig {
  id: string;
  role: string;
  roleType: RoleType;
  roomId: RoomId;
  deskId: DeskId;
  characterSprite: CharacterSpriteId;
  animation: TilemapAgentAnimation;
}

interface TilemapArtifactConfig {
  id: string; // Composite key for diffing
  roomId: RoomId;
  deskId: DeskId;
  label: string;
  color: string;
  slot: 'input' | 'output';
  version?: number;
}
```

### Overlay config

```typescript
type OverlayType = 'thought-bubble' | 'time-indicator' | 'alert';

interface OverlayConfig {
  agentId: string;
  type: OverlayType;
  content: string; // Text content for thought bubbles
  elapsedMs?: number; // For time indicators
  alertLevel?: 'info' | 'warning' | 'fatal'; // For alert styling
}
```

### Diff types

```typescript
interface TilemapDiff {
  orchestrator: TilemapOrchestratorDiff;
  agents: TilemapAgentDiffs;
  artifacts: TilemapArtifactDiffs;
  overlays: OverlayDiffs;
  hasChanges: boolean;
}

interface TilemapOrchestratorDiff {
  moved: { fromRoom: RoomId; toRoom: RoomId } | null;
  animationChanged: { from: TilemapAgentAnimation; to: TilemapAgentAnimation } | null;
  waitingChanged: { from: boolean; to: boolean } | null;
  carriedChanged: { from: CarriedArtifactConfig[]; to: CarriedArtifactConfig[] } | null;
  codeBadgeChanged: { from: TilemapOrchestratorConfig['codeBadge']; to: TilemapOrchestratorConfig['codeBadge'] } | null;
}

interface TilemapAgentDiffs {
  animationChanged: Array<{ agentId: string; from: TilemapAgentAnimation; to: TilemapAgentAnimation }>;
  added: TilemapAgentConfig[];
  removed: TilemapAgentConfig[];
}

interface TilemapArtifactDiffs {
  added: TilemapArtifactConfig[];
}

interface OverlayDiffs {
  updated: OverlayConfig[]; // Changed content, elapsed time, or alert level
  added: OverlayConfig[];
  removed: string[]; // Agent IDs whose overlays were removed
}
```

### Tiled map data access

```typescript
/** Waypoint read from Tiled map object layer. */
interface MapWaypoint {
  name: string; // e.g., 'review-desk-0', 'corridor-junction-1'
  tileX: number;
  tileY: number;
  properties?: Record<string, string | number | boolean>;
}

/** Resolved facility layout from the Tiled map. */
interface FacilityLayout {
  /** Look up the world-pixel position for a named desk. */
  deskPosition(deskId: DeskId): { x: number; y: number };
  /** Look up the world-pixel center of a room. */
  roomCenter(roomId: RoomId): { x: number; y: number };
  /** Compute a corridor path (sequence of world-pixel waypoints) between two desks or rooms. */
  corridorPath(fromDeskId: DeskId, toDeskId: DeskId): Array<{ x: number; y: number }>;
  /** All desk IDs in a given room, ordered by slot index. */
  desksInRoom(roomId: RoomId): DeskId[];
  /** Map dimensions in pixels. */
  mapWidth: number;
  mapHeight: number;
}
```

---

## 7. Migration notes

### Incremental transition strategy

The tilemap visualization is built alongside catwalk, not replacing it. Both coexist in the registry. This enables:

1. **Phase 0: Shared code extraction.** Move reusable domain logic from `catwalk/mappers/run-to-catwalk.ts` into `visualizations/shared/`. This is a no-behavior-change refactor -- catwalk tests remain green.

2. **Phase 1: Static facility.** Build `TilemapScene` that loads the Tiled map and renders the empty office. No data binding. Register as `tilemap` in the visualization registry. Verify with `?vis=tilemap`.

3. **Phase 2: Agent placement.** Implement `run-to-tilemap` mapper producing `TilemapSceneConfig`. Place character sprites at desks based on run status. No animation, no overlays.

4. **Phase 3: Diff-driven animation.** Implement `tilemap-differ` and `tilemap-choreographer`. Agents transition between animation states. Orchestrator walks between rooms.

5. **Phase 4: HTML overlays.** Add `OverlayContainer`, `ThoughtBubble`, `TimeIndicator`. Wire overlay data from the mapper through React state.

6. **Phase 5: Artifact interaction.** Click-to-inspect on desk artifacts. Artifact panel with content from run-index data.

7. **Phase 6: Polish.** Camera follow, ambient animations (monitor flicker, plant sway), notification-driven attention (alerts pulse, calm progress stays quiet).

### What to defer

- **Multi-run overview** (Vision F's empire grid): orthogonal concern, future issue
- **Governor commands** (cancel, re-review, course-correct): requires backend integration, future issue
- **Alternate themes** (DithArt sci-fi, Mars base): swap tilesets after the architecture is proven
- **Dynamic room scaling**: start with fixed room sizes accommodating up to 4 reviewers; dynamic generation is a Phase 3+ optimization

### Registry coexistence

After Phase 1, the registry looks like:

```typescript
export const visualizationRegistry: Record<string, VisualizationComponent> = {
  catwalk: CatwalkCanvas,
  'factory-floor': FactoryFloorCanvas,
  tilemap: TilemapCanvas,
};
```

Default remains `catwalk` until the tilemap reaches feature parity. Switch the default in a dedicated issue.

### Asset pipeline

The LimeZu tileset PNGs must be added to the build. Two options:

1. **Vite static assets:** Place PNGs in `sprites/assets/` and import them (as catwalk SVGs do via `sprite-sheet-urls.ts`). Vite handles hashing and bundling.
2. **Public directory:** Place in `public/tilesets/` and reference by URL. Simpler for large tilesets but loses cache-busting hashes.

Recommend option 1 for character sprites (small, imported individually) and option 2 for the full tileset PNGs used by the Tiled map loader (large, loaded at runtime).

### Test strategy

Mirror catwalk's test structure:

- `mappers/__tests__/run-to-tilemap.test.ts` -- snapshot-style tests comparing `CanonicalRunStatus` inputs to expected `TilemapSceneConfig` outputs
- `state/__tests__/tilemap-differ.test.ts` -- diff correctness for each field
- `scene/__tests__/TilemapScene.test.ts` -- integration test with mocked Excalibur engine
- `sprites/__tests__/character-animations.test.ts` -- animation frame counts and durations
- `overlays/__tests__/ThoughtBubble.test.tsx` -- React component rendering and positioning
