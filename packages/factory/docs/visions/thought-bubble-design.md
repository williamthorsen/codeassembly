# Thought bubble design

## Overview

Thought bubbles are the **primary glance-level information channel** in the tilemap visualization. Each agent in the factory has a thought bubble that cycles through content every 4-6 seconds, staggered across agents so they don't all update at once. The bubble border color signals severity: normal (no border), amber (warning), or red (critical).

This document describes the data model, content derivation rules, severity mapping, stagger algorithm, and integration plan for the thought bubble system.

## Data model

### `ThoughtBubbleConfig`

One config per agent in the run. Produced by `mapRunToThoughtBubbles()`.

```typescript
interface ThoughtBubbleConfig {
  agentId: string; // Unique ID: "arch", "plan", "coder", "reviewer-0", "simp", "holi"
  agentRole: string; // Human-readable role: "architect", "correctness-reviewer"
  roleType: RoleType; // Color theming: "analyst", "planner", "author", "reviewer"
  phase: PhaseName; // Which pipeline phase: "architecture", "review", etc.
  texts: ThoughtBubbleText[]; // Cycling content (1-3 items typically)
  severity: ThoughtBubbleSeverity; // Border color signal
  staggerOffsetMs: number; // Delay before cycling starts (ms)
}
```

### `ThoughtBubbleText`

A single piece of cycling content within a bubble.

```typescript
interface ThoughtBubbleText {
  content: string; // Display text
  category: ThoughtBubbleCategory; // Styling hint: "task" | "progress" | "finding" | "waiting" | "idle"
}
```

### `ThoughtBubbleSeverity`

Visual severity for border coloring.

```typescript
type ThoughtBubbleSeverity = 'normal' | 'warning' | 'critical';
```

### `ThoughtBubbleCategory`

Content category, used by the renderer to select icons or text styling.

```typescript
type ThoughtBubbleCategory = 'task' | 'progress' | 'finding' | 'waiting' | 'idle';
```

## Content derivation rules

The mapper derives bubble text from `CanonicalRunStatus` based on each agent's current state.

### State resolution

Each agent is in one of five text states: `working`, `completed`, `idle`, `failed`, or `waiting`. The state determines which content categories appear:

| Agent state | Primary text                                       | Additional text              |
| ----------- | -------------------------------------------------- | ---------------------------- |
| `idle`      | "Standing by..." or "Waiting for {role} to finish" | --                           |
| `working`   | Phase-specific task description                    | --                           |
| `completed` | Phase-specific completion summary                  | Progress text from artifacts |
| `failed`    | "Something went wrong..."                          | --                           |
| `waiting`   | "Waiting for input..."                             | --                           |

### Phase-specific task descriptions

| Phase          | Working text                        | Completed text                                          |
| -------------- | ----------------------------------- | ------------------------------------------------------- |
| Architecture   | "Analyzing architectural impact..." | "Impact: {impactLevel}"                                 |
| Planning       | "Building implementation plan..."   | "Plan: {stepCount} steps"                               |
| Implementation | "Implementing changes..."           | "Implementation complete"                               |
| Review         | "Reviewing code..."                 | "Review complete" + finding text                        |
| Simplifier     | "Simplifying code..."               | "Found simplification opportunities" or "Code is clean" |
| Holistic       | "Reviewing holistic quality..."     | "Holistic: {criticality} criticality"                   |

### Finding text (reviewers only)

When a reviewer has completed with findings, a `finding`-category text is added:

| Criticality | Label         | Example text                            |
| ----------- | ------------- | --------------------------------------- |
| `high`      | `F` (fatal)   | "Found F: missing null check in parser" |
| `medium`    | `W` (warning) | "Found W: unvalidated user input"       |
| `low`       | `T` (trivial) | "Found T: style inconsistency"          |
| `none`      | --            | No finding text added                   |

The finding text includes the reviewer's `reason` field as a snippet when available.

### Progress text (from artifacts)

When a phase has produced artifacts, a `progress`-category text is added:

| Artifact type    | Example text                  |
| ---------------- | ----------------------------- |
| Change summaries | "2 change summaries produced" |
| Other artifacts  | "3 artifacts produced"        |

## Severity mapping

Severity determines the thought bubble's border color in the renderer.

### Criticality to severity

| `Criticality` value | `ThoughtBubbleSeverity` | Border color   |
| ------------------- | ----------------------- | -------------- |
| `'high'`            | `'critical'`            | Red            |
| `'medium'`          | `'warning'`             | Amber          |
| `'low'`             | `'normal'`              | None (default) |
| `'none'`            | `'normal'`              | None (default) |
| `undefined`         | `'normal'`              | None (default) |

### Per-agent severity sources

| Agent           | Severity source                                                        |
| --------------- | ---------------------------------------------------------------------- |
| Architect       | Always `'normal'`                                                      |
| Planner         | Always `'normal'`                                                      |
| Coder           | Always `'normal'`                                                      |
| Reviewer (each) | Highest of `criticality` and `reReviewCriticality` from `ReviewerInfo` |
| Simplifier      | `'warning'` if `actionableFindings === true`, otherwise `'normal'`     |
| Holistic        | From `holisticReview.criticality`                                      |

## Stagger algorithm

Bubbles cycle content every 4-6 seconds (determined by the renderer). The stagger offset prevents all bubbles from updating simultaneously, creating a natural, distributed rhythm.

### Algorithm

```
staggerOffsetMs = agentIndex * STAGGER_INTERVAL_MS
```

Where:

- `agentIndex` is the sequential position of the agent (0 for architect, 1 for planner, etc.)
- `STAGGER_INTERVAL_MS = 800` (0.8 seconds between each agent's start)

### Example with 7 agents

| Agent      | Index | Offset |
| ---------- | ----- | ------ |
| Architect  | 0     | 0ms    |
| Planner    | 1     | 800ms  |
| Coder      | 2     | 1600ms |
| Reviewer 1 | 3     | 2400ms |
| Reviewer 2 | 4     | 3200ms |
| Simplifier | 5     | 4000ms |
| Holistic   | 6     | 4800ms |

With a 5-second cycle time, all 7 agents complete one offset cycle in 4.8 seconds, meaning each agent transitions at a unique moment within any given cycle.

### Skipped phases

When phases are decided to not run (`phaseDecisions[phase].run === false`), the agent is excluded entirely. The stagger offsets of subsequent agents shift down to fill the gap, preserving even spacing.

## Integration plan

### Data flow

```
CanonicalRunStatus
  → mapRunToThoughtBubbles()
  → ThoughtBubbleConfig[]
  → Tilemap renderer (future)
```

### Mapper location

```
packages/factory/src/client/visualizations/tilemap/
  types.ts                                    # ThoughtBubbleConfig, ThoughtBubbleText, etc.
  mappers/
    run-to-thought-bubbles.ts                 # mapRunToThoughtBubbles()
    __tests__/
      run-to-thought-bubbles.test.ts          # Tests
```

### Renderer integration (future)

The tilemap renderer will:

1. Call `mapRunToThoughtBubbles(status)` whenever run status updates
2. For each `ThoughtBubbleConfig`, create or update a bubble actor positioned near the agent sprite
3. Start a cycling timer with `staggerOffsetMs` delay, rotating through `texts[]` every 4-6 seconds
4. Set border color based on `severity`: `'critical'` = red, `'warning'` = amber, `'normal'` = none
5. Use `category` to select text styling or small icons (wrench for task, chart for progress, magnifying glass for finding, hourglass for waiting, ellipsis for idle)
6. Implement freeze-on-hover: when the user hovers over a bubble, pause cycling and show a tooltip with expanded detail

### Diffing strategy

Unlike the catwalk visualization which uses structural diffing (`CatwalkDiff`) to drive incremental updates, thought bubbles can use a simpler approach: regenerate all `ThoughtBubbleConfig[]` on each status poll and let the renderer diff text content to decide whether to restart or continue cycling. The stagger offsets are deterministic, so they don't need to be preserved across updates.

### Relationship to catwalk mapper

The thought bubble mapper is independent of `mapRunToCatwalk()`. Both consume `CanonicalRunStatus` but produce different output types for different visualization layers. They share the same phase inference utilities (`findCurrentPhase`, `isPhaseEvaluated`, etc.) and constants (`PHASE_NAMES`, `PHASE_ROLE`, `PHASE_ROLE_TYPE`).
