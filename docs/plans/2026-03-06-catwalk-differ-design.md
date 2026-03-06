# Catwalk config differ design

Issue: #182 — Implement catwalk config differ
Date: 2026-03-06

## Goal

Create a structural differ that compares old and new `CatwalkSceneConfig` snapshots to produce change descriptors, enabling animated transitions instead of full-scene teardown.

## Design decision: structured diff object

We evaluated three approaches:

1. **Structured diff object** (chosen) — strongly typed fields per sub-config, each produced by a focused sub-differ
2. **Change descriptor list** — flat discriminated-union array, natural for sequential animation but harder to query
3. **Hybrid** — both representations; deferred because animation sequencing belongs in a future choreographer layer

The structured approach provides the strongest typing, the cleanest test boundaries, and avoids prematurely solving animation sequencing.

## Types

```typescript
interface OrchestratorDiff {
  moved: { from: number; to: number } | null;
  workingChanged: { from: boolean; to: boolean } | null;
}

interface AgentStateDiff {
  agentId: string;
  from: AgentAnimationState;
  to: AgentAnimationState;
}

interface AgentDiffs {
  stateChanged: AgentStateDiff[];
  added: AgentConfig[];
  removed: AgentConfig[];
}

interface GateDiffs {
  opened: GateConfig[];
}

interface ArtifactDiffs {
  added: StationArtifactConfig[];
}

interface CatwalkDiff {
  orchestrator: OrchestratorDiff;
  agents: AgentDiffs;
  gates: GateDiffs;
  artifacts: ArtifactDiffs;
  hasChanges: boolean;
}
```

### Design rationale

- **Stations excluded** — derived from phase decisions at run start; static within a run.
- **Gates are monotonic** — only transition closed→open within a run. `GateDiffs` only has `opened`.
- **Artifacts are append-only** — `ArtifactDiffs` only has `added`.
- **`carriedArtifacts`/`codeBadge` omitted** — Milestone 3/4 fields, currently always empty. Trivial to add later as new fields on `OrchestratorDiff`.
- **`hasChanges`** — convenience boolean for short-circuiting when nothing changed.

## Sub-differ functions

### `diffOrchestrator(prev, next) → OrchestratorDiff`

Compare `stationIndex` and `working` fields. Emit `moved` and/or `workingChanged` when values differ; null when unchanged.

### `diffAgents(prev, next) → AgentDiffs`

Build id-keyed maps for both snapshots.

- **Added**: ids in next but not prev.
- **Removed**: ids in prev but not next.
- **State changed**: ids in both where `state` differs.
- Slot/position changes are ignored (layout concern, not animation trigger).

### `diffGates(prev, next) → GateDiffs`

Pair gates by array index (gate count is stable within a run). Collect gates where `open` transitioned `false → true`.

### `diffArtifacts(prev, next) → ArtifactDiffs`

Use composite key `${stationIndex}:${label}:${version ?? 0}` for identity. Collect entries in next whose key doesn't appear in prev.

### `diffCatwalkConfig(prev, next) → CatwalkDiff`

Calls all four sub-differs. Computes `hasChanges` as logical OR of any non-empty sub-diff.

## File structure

```
src/client/visualizations/catwalk/
  state/
    catwalk-differ.ts
    __tests__/
      catwalk-differ.test.ts
  types.ts                     ← diff types added here
```

## Test plan

| Sub-differ          | Test cases                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `diffOrchestrator`  | no change; moved forward; moved to completed (index 6); working toggled on/off; both changed |
| `diffAgents`        | no change; single state change; multiple changes; agent added; agent removed; mixed          |
| `diffGates`         | no change; single opened; multiple opened; already-open stays open                           |
| `diffArtifacts`     | no change; single added; multiple at different stations; version bump                        |
| `diffCatwalkConfig` | identical → `hasChanges: false`; single sub-diff → true; all sub-diffs changed               |

Tests use inline `CatwalkSceneConfig` fixtures (not `createMockRunStatus`, since the differ operates at the scene-config level).

## Scope exclusions

- Animation choreography (future milestone — consumes diff to build animation queue)
- `carriedArtifacts` / `codeBadge` diffing (Milestone 3/4)
- Station diffing (static within a run)
