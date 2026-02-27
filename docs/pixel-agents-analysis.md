# Pixel Agents: architectural analysis for Factory

> Analysis of [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents), a VS Code extension that visualizes Claude Code agents as lo-fi arcade characters in a pixel-art office. Findings are organized by concern and sorted by relevance to Factory's development.

## Rendering and sprite system

### 🎨 Pixel-perfect Canvas 2D rendering

Pixel Agents renders everything through the Canvas 2D API with `imageSmoothingEnabled = false`, achieving crisp pixel art at any zoom level. Sprites are stored as 2D arrays of hex color strings (`string[][]`), where each cell is either a hex color or empty string for transparency. This is fundamentally different from Factory's approach—Excalibur handles sprite rendering, texture management, and scaling natively.

**Takeaway:** Factory benefits from Excalibur's built-in sprite system and doesn't need to reimplement low-level rendering. However, Pixel Agents' approach of storing sprite data as simple 2D color arrays is worth noting as a lightweight serialization format for any custom sprites or overlays.

### 🖼️ Multi-level sprite caching

Sprites are cached per zoom level to avoid recomputing scaled versions every frame. The cache key combines the sprite data with the current zoom, and colorized furniture sprites are cached separately with HSL parameters in the key (e.g., `"furn-{id}-{h}-{s}-{b}-{c}-{colorize}"`). This prevents expensive per-frame recalculation.

**Takeaway:** If Factory introduces dynamic color theming or per-agent palette shifts, consider a similar cache-by-parameters strategy for Excalibur sprite variants rather than creating new sprite instances.

### 🎭 Character palette system with hue shifting

Six base character palettes define skin, shirt, pants, hair, and shoe colors. Characters beyond the first six get a round-robin palette assignment with a minimum 45° hue shift to ensure visual distinctiveness. Template sprites use named placeholders (`'hair'`, `'skin'`, `'shirt'`) that are substituted at render time.

**Takeaway:** Factory already has color constants in `src/shared/constants/colors.ts`. This palette-with-hue-shift pattern would allow Factory to support an arbitrary number of visually distinct agents without hand-drawing new sprites for each one.

### 📐 Z-sorting at serialization time

Depth sorting (`zY` values) is computed once when the layout changes, not per frame. Each furniture instance stores its `zY = row * TILE_SIZE + spriteHeight`, with special cases for chairs and surface items. Characters interpolate their `zY` during movement.

**Takeaway:** Excalibur handles z-ordering natively via `z` properties on actors. No need to replicate this pattern, but the principle of precomputing sort keys during layout changes (rather than per-frame) is worth keeping in mind for performance.

## Animation techniques

### 🚶 Frame-based character animation with state-driven transitions

Characters have three states (`IDLE`, `WALK`, `TYPE`) and four directions (`DOWN`, `LEFT`, `RIGHT`, `UP`). Each state has its own frame duration: walking cycles at 0.15s/frame, typing at 0.3s/frame. The animation state machine is a simple switch statement in the per-frame update, with frame timers tracking elapsed time.

**Takeaway:** Factory's agent actors already have movement and status-driven animation (CODY-7). Pixel Agents confirms that a simple enum-based state machine with per-state frame durations is sufficient — no need for a heavier animation framework.

### ✨ Matrix effect for spawn/despawn

Agents appear and disappear with a column-sweep "Matrix rain" effect: green pixels cascade down each column with staggered timing, using per-column random seeds stored on the character for deterministic playback. Duration is 0.3 seconds.

**Takeaway:** This is a polished spawn/despawn transition that could translate well to Factory. Excalibur's particle system or custom `onPreDraw` logic could achieve something similar. Currently Factory agents appear/disappear abruptly — a spawn effect would significantly improve perceived quality.

### 💬 Speech bubbles for status indicators

Permission requests show a white square with amber dots; waiting states show a green checkmark. Bubbles are small pixel-art sprites (11×13 pixels) positioned above the character head with 0.5-second fade-in animations. The bubble type is stored on the character and rendered as part of the character draw call.

**Takeaway:** Factory uses a status bar to show agent state. Adding small visual indicators above agents (similar to thought bubbles) would provide at-a-glance status without requiring the user to look away from the scene. Excalibur's `Label` or custom `Graphics` on child actors could implement this.

### 🧭 Smooth sub-pixel movement interpolation

Walking characters interpolate pixel positions between tiles using `moveProgress` (0–1 lerp). Walk speed is 48 px/sec (about 3 tiles/sec at 16px tile size). The path is a queue of tile coordinates from BFS pathfinding, and the character smoothly traverses each segment.

**Takeaway:** Factory already uses Excalibur's `actions.moveTo()` for movement. The lerp-based approach in Pixel Agents is lower-level but validates the general pattern of smooth interpolation along pre-computed paths.

## State management

### 🏢 Centralized mutable game state class

`OfficeState` is a single class holding all game state: layout, tile map, seats, blocked tiles, furniture instances, characters, selection state, and sub-agent mappings. State mutations happen directly on the class properties, with a `rebuildFromLayout()` method that recomputes derived state (tile map, seats, blocked tiles) while preserving character positions.

**Takeaway:** Factory distributes state between React (UI state), Excalibur (scene/actor state), and the API layer. Pixel Agents' approach of a single game state object avoids synchronization bugs at the cost of making React integration harder. Factory's separation is more appropriate for its architecture, but the `rebuildFromLayout()` pattern — bulk-recomputing derived state while preserving live entities — could be useful if Factory adds editable layouts.

### 🪑 Seat assignment with persistence

Chairs become "Seats" with inferred facing direction (based on adjacent desk position). Seat assignments are persisted in VS Code workspace state and restored on reload. The assignment algorithm preserves existing assignments, then auto-assigns new agents to free seats.

**Takeaway:** Factory positions agents at stations. The seat assignment pattern — persist assignments, restore on reload, auto-assign newcomers to free slots — is directly applicable if Factory needs to remember where agents were across sessions.

### 🔄 Character state machine

Each character tracks: `state` (IDLE/WALK/TYPE), `dir` (facing direction), pixel position, tile position, path queue, move progress, current tool, animation frame, frame timer, wander timer, bubble state, and matrix effect state. The update function is a ~200-line switch on `state` that handles transitions.

**Takeaway:** This confirms that agent visualization requires richer state than just "position + sprite." Factory should ensure each agent actor carries enough state for smooth animation transitions and visual indicators (current tool, waiting status, activity type).

## Streaming and real-time updates

### 📄 JSONL file watching with incremental parsing

The extension monitors Claude Code's JSONL transcript files using a dual strategy: primary `fs.watch()` events with a 2-second polling fallback. The parser maintains a byte offset into the file and a line buffer for partial reads, processing new lines incrementally as they're appended.

**Takeaway:** Factory uses an Express API server that could serve real-time updates via SSE or WebSockets. The file-watching approach in Pixel Agents is constrained by VS Code's extension model. Factory's server-side architecture allows for more robust streaming, but the incremental parsing with byte offsets is a good pattern if Factory ever needs to tail log files.

### 🔍 Tool activity detection from transcript records

Transcript records are discriminated by type: `assistant` records contain `tool_use` blocks, `user` records contain `tool_result` blocks, and `progress` records track sub-agent tasks. Each tool type maps to a human-readable status string (e.g., `Read` → "Reading {filename}", `Bash` → "Running: {command}").

**Takeaway:** Factory's status adapter already maps run phases to display states. Pixel Agents' per-tool status formatting is more granular and could inspire richer agent activity descriptions in Factory's status bar or scene overlays.

### ⏱️ Heuristic-based waiting detection

Waiting state is detected through two heuristics: (1) a `turn_duration` system event signals definitive turn completion, and (2) a 5-second silence timer after text-only responses. Permission requests are inferred when a tool runs for more than 7 seconds without progress. The README acknowledges frequent false positives.

**Takeaway:** Heuristic-based state detection is fragile. Factory should prefer explicit status signals from its orchestration backend rather than inferring state from silence or timeouts. If heuristics are unavoidable, Pixel Agents' experience shows that conservative timeouts (5–7 seconds) are necessary, and false positives should be expected.

## Agent lifecycle and representation

### 👤 Agent identity with appearance persistence

Each agent gets a sequential ID, a palette assignment, and a hue shift. The first six agents get unique palettes (0–5) with no shift; subsequent agents cycle palettes with progressively larger hue shifts. Appearance is persisted in workspace state and restored across sessions.

**Takeaway:** Factory maps agents to roles and colors. The pattern of deterministic, visually-distinct appearance assignment that persists across sessions is directly applicable. Factory could use its existing color palette with a similar cycling + shift algorithm for more than a handful of agents.

### 🧬 Sub-agent visualization as spawned children

When a `Task` tool is detected (indicating a sub-agent), a new character with a negative ID is spawned near the parent with a Matrix effect. Sub-agents are tracked via `subagentIdMap` (keyed by `"parentId:toolId"`) and automatically cleaned up when the parent tool completes.

**Takeaway:** Factory visualizes agents at stations. If Factory's orchestration model involves sub-agents or forked work, Pixel Agents' approach of spawning temporary child characters linked to parent agents provides a clear visual mental model. The negative-ID convention avoids conflicts with real agent IDs.

### 🔗 Extension ↔ Webview message passing

The extension backend and webview frontend communicate asynchronously via `postMessage()`. Message types include lifecycle events (`agentCreated`, `agentClosed`), activity events (`agentToolStart`, `agentToolDone`), and layout sync (`layoutLoaded`, `saveLayout`). No shared memory or synchronous calls.

**Takeaway:** Factory already separates client and server with an HTTP API. Pixel Agents' message-passing architecture validates the pattern of clearly-typed event messages for state synchronization. Factory could adopt a similar typed-message approach for WebSocket/SSE events if real-time updates are added.

## Movement and pathfinding

### 🗺️ BFS pathfinding on a tile grid

Movement uses breadth-first search on a 4-connected grid (no diagonals). Walkability is determined by tile type (not WALL or VOID) and furniture occupancy (blocked tiles tracked as a `Set<string>` of `"col,row"` keys). Paths are computed on-demand when an agent's destination changes.

**Takeaway:** Factory uses Excalibur's built-in movement actions. If Factory adds obstacle avoidance or multi-agent collision, BFS on a tile grid is a simple and proven approach. The blocked-tile set pattern (`Set<"col,row">`) is an efficient O(1) walkability check.

### 🎲 Idle wandering behavior

Idle agents wander randomly: pick a random walkable tile, pathfind to it, pause 2–20 seconds, repeat 3–6 times, then rest at their seat for 2–4 minutes. This creates organic-feeling ambient movement without explicit scripting.

**Takeaway:** Factory agents currently move between stations based on workflow state. Adding subtle idle behavior (small movements, looking around) when agents are between tasks would make the scene feel more alive. The "wander N times, then rest" pattern avoids perpetual restlessness.

## Scene and world management

### 🏗️ Tile-based layout with WYSIWYG editor

The office is a grid (default 20×11, max 64×64) with 8 tile types (7 floor patterns + void). Furniture is placed on the grid with defined footprints. The layout editor supports undo/redo (50-level stack), auto-tiling walls, per-tile colorization, and a "ghost border" for expansion. Layouts serialize to JSON for persistence.

**Takeaway:** Factory's scene is currently defined in code. If Factory ever needs user-customizable layouts, Pixel Agents demonstrates that a JSON-serializable grid layout with a visual editor is achievable in a web context. The tile-based approach keeps pathfinding and collision simple.

### 🪑 Seat inference from furniture adjacency

Seat facing direction is automatically inferred from adjacent desk positions rather than being manually configured. When a chair is placed next to a desk, the system determines which direction the seated character should face.

**Takeaway:** If Factory adds configurable station layouts, this pattern of inferring semantic properties from spatial relationships (rather than requiring explicit configuration) reduces setup burden.

## Architecture and integration

### 🔌 Passive observation model

Pixel Agents is entirely non-invasive: it watches Claude Code's JSONL transcripts without modifying the tool, making API calls, or intercepting commands. This decoupled architecture means updates to Claude Code don't break Pixel Agents unless the JSONL format changes.

**Takeaway:** Factory's server actively reads run data via adapters. The passive observation pattern is elegant for monitoring but limits interactivity. Factory's active architecture is better suited for its needs (selecting runs, navigating projects), but the principle of minimal coupling to the observed system is worth preserving.

### 🔀 Decoupled game loop from React

The game loop (`requestAnimationFrame` → update → render) runs independently of React's render cycle. React handles UI overlays (toolbar, settings modal, status text) while the game engine owns the canvas. State flows from the game engine to React via callbacks, not shared state.

**Takeaway:** Factory already uses this pattern — Excalibur manages the game canvas while React handles the surrounding UI. Pixel Agents validates that this separation is the right approach for hybrid game-UI applications. The key insight is that the game engine should be the source of truth for visual state, with React reading (not writing) game state.

### 🔊 Audio feedback via Web Audio API

Completion notifications use a two-note chime (E5 → E6, 659 Hz → 1319 Hz) generated via the Web Audio API with `OscillatorNode` and `GainNode`. The sound is toggleable in settings. No audio files are used — everything is synthesized.

**Takeaway:** If Factory adds audio feedback for run completion or errors, synthesized tones via Web Audio API are simpler to maintain than audio file assets. Two-note sequences (low → high for success, high → low for failure) provide intuitive feedback.

---

_Analysis performed against pixel-agents repo at `~/repos/clones/pablodelucca/pixel-agents`._
