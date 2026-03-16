---
name: office-visual-design
description: Visual design principles for the office visualization — palette, tile selection, composition, and spatial quality
user-invocable: false
---

# Office visual design

Principles for visual design work on the CodeAssembly office visualization. This skill encodes taste, not mechanics — it helps agents make judgment calls about color, composition, texture, and placement.

## Settled decisions

These are not open for re-evaluation:

- **The visualization is a place, not a diagram.** Rooms, walls, corridors, furnished interiors. The building exists before any data populates it.
- **Warm, light office aesthetic.** Inspired by The Sims, Stardew Valley, Habbo Hotel. No dark mode. No cyberpunk. No near-black backgrounds. Comfortable for extended viewing.
- **Three-zone layout.** Prep area (top-left), workshop (top-right), governor's office (bottom-right). Info panel occupies bottom-left.
- **Decorative items at the periphery.** Plants in corners, bookshelves against walls. Workstations hold functional items only — desks, monitors, boards. No mid-room decoration.
- **LimeZu tilesets are the art source.** Modern Office Revamped + Modern Interiors. No mixing with other tileset families.

## Palette

The palette is warm, muted, and professional. Avoid saturated primaries and cool-dominant schemes.

### Canvas and structure

| Element                | Color                                          | Notes                                 |
| ---------------------- | ---------------------------------------------- | ------------------------------------- |
| Page background        | `#e8e4e0`                                      | Light warm gray, surrounds the canvas |
| Room floors            | Cream tile (sheet 96,0)                        | Warm off-white                        |
| Transition strip       | Gray tile (sheet 288,0)                        | Neutral connector between zones       |
| Side walls             | `#b0a898`                                      | Warm taupe, solid fill                |
| North walls            | Tile sheet (32,256) upper + (32,288) baseboard | Two rows tall                         |
| Floor shadows          | Tile sheet (0,0)                               | Draw at row y+2 below north walls     |
| Info panel placeholder | `#ddd9d4`                                      | Slightly darker than page background  |

### Semantic colors

| Role                 | Color                   | Used for                                       |
| -------------------- | ----------------------- | ---------------------------------------------- |
| Analyst phases       | `#4488cc`               | Architecture, planning — blue                  |
| Author phases        | `#b8960a`               | Implementation — amber                         |
| Reviewer phases      | `#cc4444`               | Code review, silent failure, test review — red |
| Orchestrator/summary | `#4a9` or similar green | Consolidated findings, final summary           |

### UI text

| Element        | Color                  |
| -------------- | ---------------------- |
| Primary text   | `#333`                 |
| Secondary text | `#555`                 |
| Muted text     | `#888`                 |
| Room labels    | `rgba(80,80,100,0.55)` |
| Agent labels   | `rgba(60,60,80,0.65)`  |

## Tileset catalog

Base path: `/Users/william/Library/Mobile Documents/com~apple~CloudDocs/Resources/Tilesets/`

### Modern Office Revamped v1.2

Office-specific furniture. The primary source for desks, monitors, whiteboards, and office equipment.

- **Singles** (individual furniture items, 64x96 PNG each): `4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_{NNN}.png`
- Key singles used in prototypes: 100 (plant), 130 (monitor), 133 (review monitor), 170 (whiteboard), 172 (analysis board), 174 (data dashboard), 180 (desk), 200 (bookshelf), 227 (coder PC)
- Browse the full catalog (152+ items) to find the right piece. Don't default to the items above — they were chosen quickly. Better options may exist.

### Modern Interiors

Broader interiors: rooms, characters, animated objects, UI elements.

- **Room builder subfiles** (32x32 tile sheets): `1_Interiors/32x32/Room_Bulder_subfiles_32x32/`
  - `Room_Builder_Floors_32x32.png` — floor tiles
  - `Room_Builder_Walls_32x32.png` — wall tiles
  - `Room_Builder_Floor_Shadows_32x32.png` — shadows below north walls
- **Characters** (idle sprites, 32x64): `2_Characters/Old/Single_Characters_Legacy/32x32/{Name}_idle_32x32.png`
  - Direction: column 0 = down (facing camera), 1 = left, 2 = right, 3 = up
  - Current cast: Adam (orchestrator), Alex (architect), Amelia (planner), Bob (code reviewer), Ash (silent failure reviewer), Dan (coder), Rob (test reviewer)
- **Animated objects** (317 items): `3_Animated_Objects/` — potential source for ambient life

### Tile picker tool

A browsable tile picker is available at the artifact path for ticket #293. Use it to explore available tiles with click-to-copy coordinates.

## Tile construction

### Grid

- Tile size: 32x32 pixels
- Furniture singles: 64x96 pixels (2x3 tiles)
- Character idle sprites: 32x64 pixels (1x2 tiles)

### Wall construction

North walls are two tiles tall:

1. Upper wall tile at row `y` — sheet coords (32, 256)
2. Baseboard tile at row `y+1` — sheet coords (32, 288)
3. Floor shadow at row `y+2` — sheet coords (0, 0) on the shadow sheet

South walls (bottom of upper rooms) are a single baseboard row.

Side walls are solid-color fills (`#b0a898`) with a subtle inner-edge stroke at `rgba(80,70,60,0.25)`.

Skip wall tiles at doorway positions (typically 3 tiles wide).

### Floor layering

Draw in this order:

1. Room floors (cream tiles)
2. Transition strip (gray tiles)
3. Gray tiles through doorway openings
4. North walls (on top of floor)
5. Floor shadows (on top of floor, below wall)
6. Side walls
7. Furniture (on top of floor)
8. Characters (on top of everything)

## Composition principles

### Place, not diagram

Every room should look like somewhere people work. Test: if you removed the labels and data overlays, would a viewer recognize this as an office? If it looks like a grid of colored rectangles, it's a diagram.

### Spatial rhythm

- Alternate dense areas (workstations, furniture clusters) with breathing room (open floor, corridors).
- A room that's all furniture feels like a warehouse. A room that's all floor feels empty.
- Group related items: desk + monitor + character form a workstation unit. Don't scatter them.

### Workstation composition

A workstation is a tight cluster: wall-mounted display (on the north wall) → desk (1-2 tiles below) → character (1 tile below desk, facing up toward the display). Keep this vertical stack consistent across all stations.

### Furniture as storytelling

Each piece of furniture should earn its place. Ask: what does this object tell the viewer about this room's purpose?

- Analysis board + whiteboard → this room is for planning
- Multiple review monitors → this room is for parallel evaluation
- Data dashboard + delivery desks → this room is for coordination and output
- Bookshelf, plant → ambient warmth (periphery only)

### Negative space

Leave at least 2 tiles of open floor between workstation clusters. The orchestrator needs walking paths between stations, and visual crowding makes the scene unreadable.

### Scale and proportion

Rooms should feel proportional to their occupancy:

- 2 agents → 11 tiles wide is comfortable
- 4 agents → 23 tiles wide is comfortable
- 1 agent → 17 tiles wide is generous (governor's office includes delivery surface and control console)

## Quality rubric

Use these criteria to evaluate visual output. Ordered by importance.

| Criterion             | Question                                                             | Failure mode                                                        |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Readability**       | Can you identify each room, agent, and furniture item at a glance?   | Visual clutter, overlapping sprites, text over busy backgrounds     |
| **Place quality**     | Does this look like a real office, or a technical diagram?           | Grid-snapped rectangles, no wall depth, uniform floor               |
| **Palette coherence** | Do the colors feel unified and warm?                                 | Jarring accent colors, cool-dominant tones, saturated primaries     |
| **Composition**       | Is there visual rhythm — dense clusters alternating with open space? | Uniform density, furniture scattered randomly, no breathing room    |
| **Periphery rule**    | Are decorative items at room edges, not between workstations?        | Plants between desks, lamps in walkways, bookshelves blocking paths |
| **Storytelling**      | Does the furniture tell you what happens in each room?               | Generic desks everywhere, no room differentiation                   |

## Build script conventions

Prototypes use CJS Node.js scripts that:

1. Read PNG files from the tileset base path
2. Convert to base64 data URIs
3. Embed into a self-contained HTML file with canvas rendering

Output to the artifact directory for the relevant ticket. Name build scripts `build-{name}.cjs` and generated HTML `{name}.html`.

## Reference games

Draw inspiration from these, not their mechanics but their visual quality:

- **The Sims** — room composition, object interaction proximity, warm interior lighting
- **Stardew Valley** — pixel art warmth, natural placement, seasonal color palettes
- **Habbo Hotel** — isometric room design, furniture density, avatar placement in spaces
- **Two Point Hospital** — room-based organization, clear room purposes, staff at stations
