# Prototype tilemap facility - notes

## Overview

A single self-contained HTML file (`prototype-tilemap-facility.html`) that renders a top-down pixel-art tech facility using real tileset assets from the Modern Interiors and Modern Office Revamped packs. The facility represents a CodeAssembly orchestration run in the **review phase**, with 7 agents at workstations across 4 rooms connected by corridors.

## Tilesets used

All tiles are from 32x32 scale sprite sheets, embedded as base64 data URIs for portability. The HTML file is ~408 KB total.

| Asset key           | Source file                                                                             | Size       | Purpose                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `officeRoomBuilder` | `Modern_Office_Revamped_v1.2/1_Room_Builder_Office/Room_Builder_Office_32x32.png`       | 14 KB      | Wall textures (lavender + gray variants)                                                          |
| `officeSheet`       | `Modern_Office_Revamped_v1.2/Modern_Office_32x32.png`                                   | 110 KB     | Desks, chairs, monitors, plants, bookshelves, charts                                              |
| `conferenceHall`    | `moderninteriors-win/1_Interiors/32x32/Theme_Sorter_32x32/13_Conference_Hall_32x32.png` | 16 KB      | Conference room items (not heavily used)                                                          |
| `walls`             | `moderninteriors-win/.../Room_Builder_Walls_32x32.png`                                  | 46 KB      | Loaded but not currently drawn (office room builder walls used instead)                           |
| `floors`            | `moderninteriors-win/.../Room_Builder_Floors_32x32.png`                                 | 71 KB      | Floor tiles (cream for rooms, gray for corridors)                                                 |
| `floorShadows`      | `moderninteriors-win/.../Room_Builder_Floor_Shadows_32x32.png`                          | 3 KB       | Subtle depth shadows at wall/floor transitions                                                    |
| Character sprites   | `moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/`                  | ~3 KB each | 7 different characters: Adam (idle, orchestrator), Alex/Amelia/Dan/Bob/Ash/Rob (sitting at desks) |

## Facility composition

The facility is a 30x22 tile grid (960x704 native pixels, rendered at 2x = 1920x1408 CSS pixels).

### Rooms

- **Control room** (9x7 tiles, top-right) -- Orchestrator's station with large display/chart on back wall, 3-wide desk with dual monitors. Adam stands idle facing forward.
- **Analysis lab** (9x7 tiles, top-left) -- Two desks side by side for architect (Alex) and planner (Amelia), each with a monitor. Bookshelf on back wall, decorative plant.
- **Coder's workshop** (9x9 tiles, bottom-left) -- Triple-monitor workstation with a 3-wide desk. Dan sits at the main desk. Side equipment table and plant.
- **Review bay** (12x9 tiles, bottom-right) -- Three identical desk+monitor setups for the parallel reviewers (Bob, Ash, Rob). Plants flank the room.
- **Corridor** (gray floor tiles, L-shaped) -- Connects all four rooms with doorway openings.

### Wall types

- Upper rooms use lavender/marble wall texture (officeRoomBuilder y=96)
- Lower rooms use gray wall texture (officeRoomBuilder y=160)
- Thin dark border lines separate rooms

### Characters

Each character uses a different sprite from the `Single_Characters_Legacy` set:

| Agent role              | Character | Sprite                                        | Position                 |
| ----------------------- | --------- | --------------------------------------------- | ------------------------ |
| Orchestrator            | Adam      | `Adam_idle_32x32.png` (standing, facing down) | Control room, near desk  |
| Architect               | Alex      | `Alex_sit_32x32.png` (sitting, facing up)     | Analysis lab, left desk  |
| Planner                 | Amelia    | `Amelia_sit_32x32.png` (sitting, facing up)   | Analysis lab, right desk |
| Coder                   | Dan       | `Dan_sit_32x32.png` (sitting, facing up)      | Workshop, main desk      |
| Code reviewer           | Bob       | `Bob_sit_32x32.png` (sitting, facing up)      | Review bay, desk 1       |
| Silent failure reviewer | Ash       | `Ash_sit_32x32.png` (sitting, facing up)      | Review bay, desk 2       |
| Test reviewer           | Rob       | `Rob_sit_32x32.png` (sitting, facing up)      | Review bay, desk 3       |

Sit sprites are 768x64 (24 frames of 32x64). Each frame is 32 pixels wide, 64 pixels tall. 6 animation frames per direction, 4 directions (down/left/right/up). Frame 0 of direction 3 (up-facing) is used for seated agents.

## Interactions

### Overlays (HTML positioned over canvas)

1. **Thought bubbles** (4 total):
   - Architect: "Checking error handling patterns..."
   - Coder: "+142 -38 across 4 files"
   - Silent failure reviewer: red-bordered "FATAL: Missing null check in handler.ts"
   - Code reviewer: "Found W: unbounded array growth"

2. **Time indicators** (6 total):
   - Green for normal pace (architecture 2:30, planning 3:45, reviewers 1:24/2:08/1:55)
   - Amber for slow (coder 5:12)

3. **Artifact objects** (7 small colored rectangles on desks):
   - Blue: architecture-assessment.md, implementation-plan.md
   - Yellow: change-summary.md, commit badge
   - Red: code-review.md, silent-failure-review.md (clickable), test-review.md

4. **Room labels** and **agent name labels** as semi-transparent text

### Clickable artifact

The silent-failure-review.md artifact (on Ash's desk) has a pulsing red glow animation and a "click to inspect" hint. Clicking it opens a modal overlay showing:

- Severity badge: "F -- Fatal" in red
- Finding: "Missing null check on payment handler response" with explanation
- File reference: `src/payment/handler.ts:42`
- Syntax-highlighted code snippet with the problematic line highlighted
- Dismissible via close button, backdrop click, or Escape key

### Pipeline status bar

Below the facility, a horizontal bar shows the pipeline phases: architecture (completed), planning (completed), implementation (completed), review (active, 3/3), summary (pending).

## What would change in a real Excalibur implementation

1. **Tile rendering**: Instead of drawing tiles directly via canvas `drawImage`, Excalibur's `TileMap` class would manage the grid. Each tile would reference a `SpriteSheet` backed by the same tileset PNGs, using `Sprite.fromSpriteSheet()` with source rectangle coordinates.

2. **Characters**: `AgentActor` instances extending `ex.Actor` with `SpriteSheet`-based animations. The sit/idle sprite sheets would drive frame-by-frame animation (6 frames per direction). Walking between rooms would use Excalibur's `Actions` system for path-following.

3. **State-driven layout**: The hardcoded room/desk positions would come from the `run-to-scene` mapper, converting `CanonicalRunStatus` data into `SceneConfig`. Agent positions would be computed from station assignments, not hardcoded.

4. **Dynamic overlays**: Thought bubbles and time indicators would be React components rendered outside the Excalibur canvas but positioned using world-to-screen coordinate transforms (`engine.worldToScreenCoordinates()`). They would update reactively as run data streams in.

5. **Artifact interaction**: Clicking an artifact actor in Excalibur would emit an event that React listens to, opening the detail panel. The panel content would be populated from actual `run-index.json` artifact data rather than hardcoded HTML.

6. **Animation**: Characters would animate continuously (idle bob, typing, thinking). Phase transitions would trigger walking animations between rooms. Completed phases could show celebration animations.

7. **Camera**: Excalibur's camera could follow the currently active agent or provide smooth pan/zoom across the facility. The prototype has no camera control.

8. **Tiling**: A proper implementation would use a tile map editor (Tiled) to design the facility layout, export as JSON, and load it via Excalibur's tilemap support. This prototype composes the facility programmatically with hardcoded coordinates.

## Build process

The HTML is generated by `build-prototype.cjs` which:

1. Reads the tileset PNGs from the local tilesets directory
2. Converts each to a base64 data URI
3. Embeds them into a template HTML string
4. Writes the self-contained HTML file

To regenerate: `node build-prototype.cjs` (from this directory).
