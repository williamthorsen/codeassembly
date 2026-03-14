# Vision research session summary

Session date: 2026-03-13
Issue: https://github.com/williamthorsen/codeassembly/issues/293

## Process

Used a "competing visions" pattern: dispatch 3 parallel agents with identical context but different creative lenses, then compare and synthesize. Two rounds of 3 agents each, followed by a tilemap prototype round.

The pattern itself was captured as a future skill: https://github.com/williamthorsen/codeassembly/issues/294

## Round 1: Three divergent visions

**Lenses:**

- A: "Evolve the factory" — build on existing factory-floor metaphor
- B: "Start from the developer's mind" — information-first, work backward to visuals
- C: "Steal from the best" — synthesize from existing tools (DAW, mission control, Figma)

**Key findings:**

- **Vision B was the clear winner for information architecture.** Progressive disclosure (glance → hover → click), timing strip for instant bottleneck visibility, zero-to-two-click access to any artifact. This must inform any final design.
- Vision A had the right _kind_ of spatial experience (agents at stations, physical artifacts) but was purely decorative.
- Vision C (DAW timeline) was too traditional — a planning tool, not a world.
- All three were too dark (near-black backgrounds). Palette must be comfortable for extended viewing.

**Deliverables:** `vision-{a,b,c}-*.md` + `vision-{a,b,c}-mockup.html`

## Round 2: Refined direction with tighter constraints

Incorporated the Civilization/governor insight, the reference image aesthetic, mandatory developer questions, and the artifact drill-down as tertiary (not primary) interaction.

**Lenses:**

- D: "The vertical facility" — multi-level cross-section, gravity = dependency flow
- E: "The workshop floor" — single-level, intimate 3/4 view, close camera
- F: "The empire view" — multi-run oversight + spatial zoom into single run

**Key findings:**

- **Vision D won for spatial arrangement** — vertical multi-level layout with gravity-driven flow, review bay expanding for parallel reviewers.
- **Vision E had the best interaction details** — cycling/staggered/freeze-on-hover thought bubbles, glowing time-rings, red tether lines for blocking, routing board as persistent pipeline overview.
- **Vision F uniquely addressed multi-run oversight** — empire grid with facility zoom. Orthogonal to D and E; could wrap around either.
- **Vision E had the better sidebar** for artifact drill-down.
- The "misty teal" palette instruction was too prescriptive — resulted in washed-out, low-contrast designs across all three.

**Deliverables:** `vision-{d,e,f}-*.md` + `vision-{d,e,f}-mockup.html`

## Critical insight: "Place, not diagram"

The fundamental gap across all six visions: they visualize logical flows but don't create a **place**. They're dashboards with pixel-art decoration, not worlds you inhabit.

A real game world (Civilization, Warcraft) has:

- **Terrain** that exists before any data populates it
- **Architecture** with interior logic (rooms, doors, corridors)
- **Characters that inhabit the space** — they move between locations with purpose
- **Physics of flow** — artifacts are carried, conveyed, shipped through physical space
- **Player agency** — the governor commands, not just observes

None of the six visions achieved this. They all committed the same sin: arranged information spatially and called it a world.

## The Civilization / governor insight

The developer overseeing AI orchestrations is a **governor**, not a reader:

- **Notification-driven attention** — problems surface themselves; healthy progress stays quiet
- **Outcome-level summaries** — "reviewer found 2 warnings, coder fixed them" not 47 lines of findings
- **Trust signals** — visual indicators for "this went well" vs "this needs scrutiny" without reading content
- **Compulsive watchability** — the world is alive, progress is satisfying, you want it open
- **Multi-run awareness** — eventually overseeing several concurrent runs (like Civ cities)
- **Commands, not just observation** — cancel a run, schedule another review, add comments to course-correct

## The interactivity insight (not yet designed)

Future vision: the governor doesn't just watch, they **command**:

- "Cancel this run" → facility powers down
- "Schedule another review round" → new reviewer walks to station
- "Add a comment to course-correct" → message delivered to agent
- "Prioritize this run" → more agents assigned, facility gets more active

This transforms the visualization from a monitor into a control interface.

## Round 3: Tilemap prototype with real assets

The breakthrough: source real pixel-art tilesets and compose the facility from actual tiles.

**Tileset research:** Evaluated 10+ tilesets. See `tileset-research.md`.

**Selected tilesets:**

- **LimeZu Modern Interiors** ($1.50) — rooms, furniture, monitors, 327 character sprites with walk/idle/sit/read animations, 100+ animated objects. [itch.io link](https://limezu.itch.io/moderninteriors)
- **LimeZu Modern Office Revamped** ($2.50) — office desks, cubicles, monitors, whiteboards. [itch.io link](https://limezu.itch.io/modern-office-revamped)

**Why these won:**

- Clean, light aesthetic (solves "too dark" problem)
- Massive breadth (thousands of tiles, full character system)
- Office-specific furnishings (desks, monitors, conference rooms, control rooms)
- $4 total
- The hospital and office design examples demonstrated exactly the "sense of place" we'd been missing

**Also considered for future use:**

- DithArt Sci-Fi series — best sci-fi aesthetic, could be used for an alternate theme
- Cute SCKR Mars Base ($1.69) — compelling Mars colony metaphor, warm palette

**Tileset location:** `/Users/william/Library/Mobile Documents/com~apple~CloudDocs/Resources/Tilesets/`

**Prototype in progress:** An agent is composing a facility from the actual tiles — rooms with furnished workstations, character sprites at desks, thought bubbles, time indicators, and a clickable artifact drill-down. Output: `prototype-tilemap-facility.html` + `prototype-notes.md`.

## Design decisions carried forward

These are settled and should inform all future work:

1. **Vision B's information architecture is the gold standard.** Progressive disclosure: glance (thought bubbles, time indicators, agent animation) → hover (tooltips with detail) → click (artifact content panel).

2. **The six mandatory developer questions** must all be answerable:
   - "What are my minions up to right now?" → glance
   - "What are they stuck on?" → glance
   - "What code have they produced and what problems have they solved?" → glance + click
   - "How long has each one spent on task?" → glance
   - "Who is waiting for whom?" → glance
   - "Where is the friction and waste in the process?" → glance + hover

3. **Artifact drill-down is tertiary.** The primary loop is: watch → notice (things surface themselves) → acknowledge or drill down. Content viewing is a power-user escape hatch.

4. **Thought bubbles are the primary glance-level information channel.** Cycling content, staggered timing, freeze-on-hover, red border for alerts.

5. **Time-on-task must be visible without hovering.** Glowing rings or timer badges, color-coded green → amber → red.

6. **Blocking relationships must be spatially visible.** Tether lines, stopped conveyors, or thought bubble "Waiting for..." text.

7. **Notification-driven attention.** The visualization draws the eye to problems; healthy progress stays calm.

8. **The palette must be comfortable for extended viewing.** Light/mid-tone dominant. No large areas of near-black.

9. **The visualization must be a place, not a diagram.** Rooms, walls, corridors, furnished interiors. The building exists before any data populates it.

## Files produced

```
packages/factory/docs/visions/
├── SESSION-SUMMARY.md          (this file)
├── tileset-research.md         (tileset evaluation)
├── vision-a-factory-evolved.md (round 1)
├── vision-a-mockup.html
├── vision-b-information-first.md
├── vision-b-mockup.html
├── vision-c-synthesized.md
├── vision-c-mockup.html
├── vision-d-vertical-facility.md (round 2)
├── vision-d-mockup.html
├── vision-e-workshop-floor.md
├── vision-e-mockup.html
├── vision-f-empire-view.md
├── vision-f-mockup.html
├── prototype-tilemap-facility.html (round 3, in progress)
└── prototype-notes.md              (round 3, in progress)
```
