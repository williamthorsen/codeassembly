---
name: office-game-feel
description: Animation, movement, and interaction design for the office visualization — making it feel alive
user-invocable: false
---

# Office game feel

Principles for animation and interaction design in the CodeAssembly office visualization. This skill is about making the office feel alive — movement, timing, attention, and the rhythm of work.

The visualization is built with [Excalibur.js](https://excaliburjs.com/). The adapter pipeline (`CanonicalRunStatus → LogicalSceneState → OfficeSceneConfig → ResolvedPositions → OfficeDiff → TransitionPlan`) already generates transition plans with waypoints and timing. The scene currently discards them and teleports entities. This skill guides the work of consuming those plans to produce engaging animation.

## The orchestrator heartbeat

The single most important animation in the visualization. Everything else is secondary.

The orchestrator lives in the governor's office. They walk up to the prep area or workshop to dispatch work, collect results, and update the whiteboard. Every errand starts and ends at the governor's desk. This rhythm of departures and returns is the visualization's **heartbeat** — the user watches their agent leave, sees them interact in the workshop, and watches them return with results.

Get this right first. If the orchestrator moves convincingly between zones, the visualization feels alive even if nothing else animates.

### Movement pattern

```
governor's desk → (walk through doorway) → destination zone
  → (brief pause at target: desk, whiteboard, or agent) → interaction
  → (walk back through doorway) → governor's desk
```

Each errand should take 2-4 seconds total. Faster feels rushed; slower feels laggy. The pause at the destination (500-800ms) is essential — it communicates "something happened here" before the return trip.

## Settled decisions

These are not open for re-evaluation:

- **Thought bubbles are the primary glance-level information channel.** They carry the most important status information. Cycling content, staggered timing, freeze-on-hover, red border for alerts.
- **Time-on-task must be visible without hovering.** Color-coded indicators: green (healthy) → amber (slow) → red (stalled).
- **Notification-driven attention.** The visualization draws the eye to problems; healthy progress stays calm. Don't animate everything equally.
- **Three HUD modes.** Ambient (minimal — status pips, alert-only bubbles), Standard (names, times, all bubbles), Detailed (full filenames, console, action buttons). Toggle with H key.
- **Progressive disclosure.** Glance → hover → click. Each level reveals more detail without cluttering the default view.

## Agent state machines

All agents share a base state set. Each state has a distinct visual signature.

```
idle → working → done
         ↓
       blocked → working (when unblocked)
```

| State       | Animation                           | Thought bubble        | Visual cue                        |
| ----------- | ----------------------------------- | --------------------- | --------------------------------- |
| `idle`      | Standing, occasional idle animation | None or casual        | Neutral posture                   |
| `working`   | At workstation, facing equipment    | Role-specific content | Subtle activity indicator         |
| `done`      | Relaxed, slight position shift      | Completion note       | Green checkmark or similar        |
| `blocked`   | Stopped, looking around             | "Waiting for..."      | Amber indicator, slight fidget    |
| `concerned` | Alert posture                       | Warning/error content | Red indicator, attention-grabbing |

### State transition cues

When an agent changes state, signal it briefly:

- **idle → working**: Agent walks to their station (if not already there), faces their equipment
- **working → done**: Brief flash or particle effect, posture relaxes
- **working → blocked**: Activity indicator changes to amber, thought bubble updates
- **Any → concerned**: Red pulse on the agent's status indicator, thought bubble border turns red

Keep transition cues under 500ms. They signal change, not celebrate it.

### Orchestrator states

The orchestrator has a richer lifecycle than other agents:

```
idle (at desk)
  → dispatching (walking to target zone)
  → monitoring (back at desk, watching)
  → collecting (walking to reviewer stations)
  → consolidating (at desk, producing output)
  → delivering (walking to coder with findings)
  → ... (review cycle repeats)
  → delivering (placing artifacts on delivery table)
  → done
```

## Transition types

The transition planner produces these types. Each needs a distinct visual treatment.

| Type               | What it means                            | Animation approach                                    |
| ------------------ | ---------------------------------------- | ----------------------------------------------------- |
| `walk`             | Entity moves between positions           | Smooth movement along waypoints with corridor routing |
| `state_change`     | Agent status changes (idle → working)    | Brief visual cue at current position                  |
| `fade_in`          | Entity appears (agent assigned to phase) | Fade from transparent, 300-400ms                      |
| `fade_out`         | Entity disappears (agent done, leaves)   | Fade to transparent, 300-400ms                        |
| `artifact_appear`  | Artifact created by an agent             | Pop-in at agent's position, slight scale bounce       |
| `artifact_deliver` | Artifact reaches delivery surface        | Slide to destination, settle with subtle bounce       |

### Stagger

Transitions are staggered at 150ms intervals to avoid simultaneous visual changes. When 3 reviewers start working at once, their state changes should ripple across the room rather than snap simultaneously. This stagger is already computed in the `TransitionPlan.delayMs` field.

## Movement design

### Speed

Target: **3-4 tiles per second** for walking. This feels purposeful without being frantic. The orchestrator covers the longest paths (governor's office to prep area, ~20 tiles), so a full trip takes 5-7 seconds including pauses.

### Easing

- **Departure**: Ease-in (slow start, accelerate). Communicates intention before movement.
- **Arrival**: Ease-out (decelerate, stop). Communicates settling into position.
- **Mid-path**: Linear or ease-in-out. Consistent travel speed.

Excalibur's `EasingFunctions` provides `EaseInOutCubic` for smooth movement. Use `actor.actions.moveTo(x, y, speed)` for simple paths or chain `moveTo` calls for multi-waypoint corridor routes.

### Pathfinding

Agents don't free-roam. All paths are pre-computed by the transition planner as waypoint sequences:

```
[fromPosition, ...corridorWaypoints, toPosition]
```

Corridor waypoints route through doorways. The layout provides `corridorPath(fromZone, toZone)` which returns intermediate positions. Animate along these waypoints sequentially.

### Facing direction

- Walking: face the direction of movement (left/right/up/down sprite)
- At workstation: face the equipment (typically direction 3 = up, toward wall-mounted displays)
- Orchestrator at desk: face the camera (direction 0 = down)
- After arriving: brief pause (200ms) before changing facing direction

## Thought bubbles

The primary information channel. They do heavy lifting — don't make them an afterthought.

### Cycling

Active agents cycle through 2-3 thought bubble messages. Each message displays for 3-4 seconds before crossfading to the next. Stagger the cycling across agents so bubbles don't all change at once.

### Freeze-on-hover

When the user hovers over an agent or their bubble, freeze the cycle and keep the current message visible. Resume cycling when the cursor leaves.

### Severity signaling

- Normal content: white background, dark border
- Warning content: amber left border
- Error/alert content: red left border, subtle pulse animation

### Positioning

Bubbles appear above and slightly to the right of the agent. If the agent is near the top edge of their room, the bubble should appear below instead. Avoid overlapping bubbles from adjacent agents.

## Time indicators

Elapsed time per phase must be visible at a glance without hovering.

### Color thresholds

Define per-phase expected durations. Show elapsed time as:

- **Green** (0-100% of expected): healthy pace
- **Amber** (100-200% of expected): slower than usual
- **Red** (200%+ of expected): stalled or problematic

### Visual form

A small colored pip or ring near the agent's station. Size: 6-8 pixels. Don't use large progress bars — they compete with the office aesthetic. The pip should feel like a subtle dashboard indicator, not a UI widget.

## Attention guidance

The visualization must guide the user's eye to what matters without being noisy.

### Calm by default

When everything is healthy, the office should feel like a busy but orderly workplace. Agents work at their stations, the orchestrator makes rounds, thought bubbles cycle quietly. No flashing, no urgency.

### Problems surface themselves

When something goes wrong, the visualization should draw attention through:

1. **Thought bubble severity** — red border, pulse
2. **Time indicator turning red** — a stalled phase is immediately visible
3. **Agent posture change** — blocked or concerned state
4. **Orchestrator behavior** — returns to governor's office without the expected artifact, or makes an extra trip

Don't add gratuitous attention effects (screen shake, flash, sound) for normal events. Reserve strong visual signals for actual problems.

### Visual hierarchy of urgency

```
Calm (default)
  → Notable (amber time indicator, "waiting for..." bubble)
    → Concerning (red time indicator, concerned agent state)
      → Critical (red pulse, multiple agents blocked, orchestrator returning empty)
```

## HUD toggle

Three display modes, cycled with the H key:

| Mode         | What's visible                                  | When to use                                    |
| ------------ | ----------------------------------------------- | ---------------------------------------------- |
| **Ambient**  | Status pips, alert-only bubbles                 | Watching in the background, everything healthy |
| **Standard** | Agent names, elapsed times, all thought bubbles | Active monitoring, the default                 |
| **Detailed** | Full filenames, console overlay, action buttons | Debugging, investigating a specific issue      |

Transition between modes with a quick fade (200ms). Don't snap — the user should feel the information density change smoothly.

## Idle behaviors

Small ambient animations that make the office feel alive when agents are between tasks.

### Essential (implement first)

- Orchestrator idle: occasional look-around animation at desk
- Working agents: subtle head bob or typing motion (if sprite supports it)
- Thought bubble cycling (already described above)

### Nice-to-have (implement later)

- Idle agents drift slightly from their exact grid position
- Occasional stretch or coffee-break animation
- Animated objects from the tileset (clock, spinning fan, blinking monitor)

Keep idle behaviors subtle. They're seasoning, not the main dish. If an idle animation draws more attention than a state change, it's too prominent.

## Excalibur patterns

### Actor lifecycle

```typescript
// Create an agent actor
const agent = new Actor({ pos: vec(x, y) });
agent.graphics.use(spriteSheet.getSprite(col, row));
scene.add(agent);

// Move along waypoints
for (const waypoint of waypoints) {
  agent.actions.moveTo(waypoint.x, waypoint.y, speed);
}

// Remove when done
agent.actions.fade(0, 400).die();
```

### Sprite integration

Character idle sprites are 32x64 (1x2 tiles), 4 directions per row. Use `SpriteSheet.fromImageSource()` with grid configuration to extract directional frames.

Furniture singles are 64x96 (2x3 tiles). Render as static sprites at tile positions.

### Action queues

Excalibur's `actor.actions` supports chaining: `.moveTo().delay().moveTo().callMethod()`. Use this for the orchestrator's errand pattern:

```typescript
orchestrator.actions
  .moveTo(doorway.x, doorway.y, walkSpeed)
  .moveTo(destination.x, destination.y, walkSpeed)
  .delay(pauseMs)
  .callMethod(() => performInteraction())
  .moveTo(doorway.x, doorway.y, walkSpeed)
  .moveTo(desk.x, desk.y, walkSpeed);
```

### Consuming TransitionPlan

The transition planner outputs `Transition[]` with `delayMs` for staggering. Process them with:

```typescript
for (const transition of plan.transitions) {
  setTimeout(() => executeTransition(transition), transition.delayMs);
}
```

Each `executeTransition` dispatches to a handler based on `transition.type` (walk, state_change, fade_in, etc.).

## Reference games

Draw inspiration from these — specifically their sense of life and activity, not their mechanics:

- **The Sims** — character pathfinding between rooms, interaction animations at objects, "needs" indicators as subtle UI
- **Two Point Hospital** — staff walking purposefully between rooms, clear room purposes visible from room contents, queue/wait indicators
- **Overcooked** — clear task states (raw → cooking → done → burned), timer urgency, parallel activity
- **Game Dev Tycoon** — development phase progression, team members at desks with visible work states, progress indicators
- **Stardew Valley** — ambient life (NPCs walking routes, seasonal changes), warm pixel art quality

## What NOT to do

- Don't animate everything at the same intensity. Healthy progress should be calm.
- Don't add screen shake, flash effects, or sound for normal events.
- Don't make agents wander randomly. All movement is purposeful and driven by the pipeline state.
- Don't prioritize animation polish over readability. A clear static scene beats a confusing animated one.
- Don't implement complex pathfinding. All paths are pre-computed waypoint sequences.
- Don't fight the adapter pipeline. It already produces the right data — consume `TransitionPlan`, don't re-derive transitions from raw state.
