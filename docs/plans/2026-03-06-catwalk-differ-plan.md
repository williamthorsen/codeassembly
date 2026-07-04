# Catwalk config differ implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a pure-function structural differ that compares two `CatwalkSceneConfig` snapshots and produces typed change descriptors for animation transitions.

**Architecture:** Four sub-differs (orchestrator, agents, gates, artifacts) composed into a top-level `diffCatwalkConfig` function. Each sub-differ is a pure function with no side effects. Diff types are co-located with existing scene config types in `types.ts`.

**Tech Stack:** TypeScript (strict mode), Vitest

---

## Conventions

- **Test runner:** `pnpm run ws test` from `packages/factory/`
- **Single test file:** `pnpm run ws test -- --testPathPattern catwalk-differ`
- **Typecheck:** `pnpm run ws typecheck` from `packages/factory/`
- **Source root:** `packages/factory/src/client/visualizations/catwalk/`
- **Import style:** Relative `.js` extensions (NodeNext resolution)
- **Descriptions:** Every non-trivial function gets a `/** ... */` one-liner

---

### Task 1: Add diff types to types.ts

**Files:**

- Modify: `packages/factory/src/client/visualizations/catwalk/types.ts`

**Step 1: Add the diff type definitions**

Append these types after the existing `CarriedArtifactConfig` interface at the end of `types.ts`:

```typescript
// ---------------------------------------------------------------------------
// Diff types — produced by catwalk-differ.ts
// ---------------------------------------------------------------------------

export interface OrchestratorDiff {
  moved: { from: number; to: number } | null;
  workingChanged: { from: boolean; to: boolean } | null;
}

export interface AgentStateDiff {
  agentId: string;
  from: AgentAnimationState;
  to: AgentAnimationState;
}

export interface AgentDiffs {
  stateChanged: AgentStateDiff[];
  added: AgentConfig[];
  removed: AgentConfig[];
}

export interface GateDiffs {
  opened: GateConfig[];
}

export interface ArtifactDiffs {
  added: StationArtifactConfig[];
}

export interface CatwalkDiff {
  orchestrator: OrchestratorDiff;
  agents: AgentDiffs;
  gates: GateDiffs;
  artifacts: ArtifactDiffs;
  hasChanges: boolean;
}
```

**Step 2: Typecheck**

Run: `cd packages/factory && pnpm run ws typecheck`
Expected: PASS (types are just definitions, no usage yet)

**Step 3: Commit**

```bash
git add packages/factory/src/client/visualizations/catwalk/types.ts
git commit -m "factory|feat: Add CatwalkDiff types for structural scene config diffing"
```

---

### Task 2: Implement and test diffOrchestrator

**Files:**

- Create: `packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts`
- Create: `packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts`

**Step 1: Write the failing tests for diffOrchestrator**

Create the test file. Tests use inline `OrchestratorConfig` fixtures — no factory helpers needed since the types are small.

```typescript
import { describe, expect, it } from 'vitest';

import type { OrchestratorConfig } from '../../types.js';
import { diffOrchestrator } from '../catwalk-differ.js';

/** Minimal orchestrator config factory. */
function orchestrator(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    stationIndex: 0,
    working: false,
    carriedArtifacts: [],
    codeBadge: null,
    ...overrides,
  };
}

describe('diffOrchestrator', () => {
  it('returns nulls when nothing changed', () => {
    const prev = orchestrator({ stationIndex: 2, working: true });
    const next = orchestrator({ stationIndex: 2, working: true });
    const diff = diffOrchestrator(prev, next);

    expect(diff.moved).toBeNull();
    expect(diff.workingChanged).toBeNull();
  });

  it('detects orchestrator moved forward', () => {
    const prev = orchestrator({ stationIndex: 1 });
    const next = orchestrator({ stationIndex: 3 });
    const diff = diffOrchestrator(prev, next);

    expect(diff.moved).toEqual({ from: 1, to: 3 });
  });

  it('detects orchestrator moved to completed position', () => {
    const prev = orchestrator({ stationIndex: 5 });
    const next = orchestrator({ stationIndex: 6 });
    const diff = diffOrchestrator(prev, next);

    expect(diff.moved).toEqual({ from: 5, to: 6 });
  });

  it('detects working toggled on', () => {
    const prev = orchestrator({ working: false });
    const next = orchestrator({ working: true });
    const diff = diffOrchestrator(prev, next);

    expect(diff.workingChanged).toEqual({ from: false, to: true });
  });

  it('detects working toggled off', () => {
    const prev = orchestrator({ working: true });
    const next = orchestrator({ working: false });
    const diff = diffOrchestrator(prev, next);

    expect(diff.workingChanged).toEqual({ from: true, to: false });
  });

  it('detects both moved and working changed', () => {
    const prev = orchestrator({ stationIndex: 0, working: true });
    const next = orchestrator({ stationIndex: 2, working: false });
    const diff = diffOrchestrator(prev, next);

    expect(diff.moved).toEqual({ from: 0, to: 2 });
    expect(diff.workingChanged).toEqual({ from: true, to: false });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: FAIL — module `../catwalk-differ.js` does not exist

**Step 3: Write minimal implementation**

Create `packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts`:

```typescript
import type { OrchestratorConfig, OrchestratorDiff } from '../types.js';

/** Compare two orchestrator configs and return position/working changes. */
export function diffOrchestrator(prev: OrchestratorConfig, next: OrchestratorConfig): OrchestratorDiff {
  const moved = prev.stationIndex !== next.stationIndex ? { from: prev.stationIndex, to: next.stationIndex } : null;

  const workingChanged = prev.working !== next.working ? { from: prev.working, to: next.working } : null;

  return { moved, workingChanged };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts \
       packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts
git commit -m "factory|feat: Implement diffOrchestrator with tests"
```

---

### Task 3: Implement and test diffAgents

**Files:**

- Modify: `packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts`
- Modify: `packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts`

**Step 1: Write the failing tests for diffAgents**

Add to the test file, after the existing `diffOrchestrator` describe block:

```typescript
import type { AgentConfig, OrchestratorConfig } from '../../types.js';
import { diffAgents, diffOrchestrator } from '../catwalk-differ.js';

// Add this factory alongside the orchestrator factory:

/** Minimal agent config factory. */
function agent(id: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id,
    role: id,
    roleType: 'author',
    stationIndex: 0,
    slotIndex: 0,
    state: 'idle',
    ...overrides,
  };
}

describe('diffAgents', () => {
  it('returns empty arrays when nothing changed', () => {
    const agents = [agent('arch', { state: 'working' })];
    const diff = diffAgents(agents, agents);

    expect(diff.stateChanged).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('detects a single agent state change', () => {
    const prev = [agent('arch', { state: 'working' })];
    const next = [agent('arch', { state: 'resting' })];
    const diff = diffAgents(prev, next);

    expect(diff.stateChanged).toEqual([{ agentId: 'arch', from: 'working', to: 'resting' }]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('detects multiple agent state changes', () => {
    const prev = [agent('arch', { state: 'working' }), agent('coder', { state: 'idle' })];
    const next = [agent('arch', { state: 'resting' }), agent('coder', { state: 'working' })];
    const diff = diffAgents(prev, next);

    expect(diff.stateChanged).toHaveLength(2);
    expect(diff.stateChanged[0]).toEqual({ agentId: 'arch', from: 'working', to: 'resting' });
    expect(diff.stateChanged[1]).toEqual({ agentId: 'coder', from: 'idle', to: 'working' });
  });

  it('detects an added agent', () => {
    const prev = [agent('arch')];
    const reviewer = agent('reviewer-0', { stationIndex: 3 });
    const next = [agent('arch'), reviewer];
    const diff = diffAgents(prev, next);

    expect(diff.added).toEqual([reviewer]);
    expect(diff.removed).toEqual([]);
    expect(diff.stateChanged).toEqual([]);
  });

  it('detects a removed agent', () => {
    const reviewer = agent('reviewer-0', { stationIndex: 3 });
    const prev = [agent('arch'), reviewer];
    const next = [agent('arch')];
    const diff = diffAgents(prev, next);

    expect(diff.removed).toEqual([reviewer]);
    expect(diff.added).toEqual([]);
    expect(diff.stateChanged).toEqual([]);
  });

  it('handles mixed add, remove, and state change', () => {
    const prev = [agent('arch', { state: 'working' }), agent('reviewer-0', { state: 'idle' })];
    const next = [agent('arch', { state: 'resting' }), agent('reviewer-1', { state: 'working', slotIndex: 1 })];
    const diff = diffAgents(prev, next);

    expect(diff.stateChanged).toEqual([{ agentId: 'arch', from: 'working', to: 'resting' }]);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]?.id).toBe('reviewer-1');
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]?.id).toBe('reviewer-0');
  });

  it('ignores slotIndex changes when state is unchanged', () => {
    const prev = [agent('reviewer-0', { slotIndex: 0, state: 'working' })];
    const next = [agent('reviewer-0', { slotIndex: 1, state: 'working' })];
    const diff = diffAgents(prev, next);

    expect(diff.stateChanged).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });
});
```

**Step 2: Run tests to verify the new tests fail**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: FAIL — `diffAgents` is not exported from `../catwalk-differ.js`

**Step 3: Write implementation**

Add to `catwalk-differ.ts`:

```typescript
import type { AgentConfig, AgentDiffs, AgentStateDiff, OrchestratorConfig, OrchestratorDiff } from '../types.js';

/** Compare two agent arrays by id, detecting state changes, additions, and removals. */
export function diffAgents(prev: readonly AgentConfig[], next: readonly AgentConfig[]): AgentDiffs {
  const prevById = new Map(prev.map((a) => [a.id, a]));
  const nextById = new Map(next.map((a) => [a.id, a]));

  const stateChanged: AgentStateDiff[] = [];
  const added: AgentConfig[] = [];
  const removed: AgentConfig[] = [];

  for (const [id, nextAgent] of nextById) {
    const prevAgent = prevById.get(id);
    if (prevAgent === undefined) {
      added.push(nextAgent);
    } else if (prevAgent.state !== nextAgent.state) {
      stateChanged.push({ agentId: id, from: prevAgent.state, to: nextAgent.state });
    }
  }

  for (const [id, prevAgent] of prevById) {
    if (!nextById.has(id)) {
      removed.push(prevAgent);
    }
  }

  return { stateChanged, added, removed };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts \
       packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts
git commit -m "factory|feat: Implement diffAgents with tests"
```

---

### Task 4: Implement and test diffGates

**Files:**

- Modify: `packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts`
- Modify: `packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts`

**Step 1: Write the failing tests for diffGates**

Add to the test file:

```typescript
import type { AgentConfig, GateConfig, OrchestratorConfig } from '../../types.js';
import { diffAgents, diffGates, diffOrchestrator } from '../catwalk-differ.js';

// Add this factory:

/** Minimal gate config factory. */
function gate(left: number, right: number, open = false): GateConfig {
  return { betweenStations: [left, right], open };
}

describe('diffGates', () => {
  it('returns empty array when nothing changed', () => {
    const gates = [gate(0, 1, false), gate(1, 2, true)];
    const diff = diffGates(gates, gates);

    expect(diff.opened).toEqual([]);
  });

  it('detects a single gate opened', () => {
    const prev = [gate(0, 1, false), gate(1, 2, false)];
    const next = [gate(0, 1, true), gate(1, 2, false)];
    const diff = diffGates(prev, next);

    expect(diff.opened).toEqual([{ betweenStations: [0, 1], open: true }]);
  });

  it('detects multiple gates opened', () => {
    const prev = [gate(0, 1, false), gate(1, 2, false), gate(2, 3, false)];
    const next = [gate(0, 1, true), gate(1, 2, true), gate(2, 3, false)];
    const diff = diffGates(prev, next);

    expect(diff.opened).toHaveLength(2);
    expect(diff.opened[0]?.betweenStations).toEqual([0, 1]);
    expect(diff.opened[1]?.betweenStations).toEqual([1, 2]);
  });

  it('ignores gates that were already open', () => {
    const prev = [gate(0, 1, true), gate(1, 2, true)];
    const next = [gate(0, 1, true), gate(1, 2, true)];
    const diff = diffGates(prev, next);

    expect(diff.opened).toEqual([]);
  });
});
```

**Step 2: Run tests to verify the new tests fail**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: FAIL — `diffGates` is not exported

**Step 3: Write implementation**

Add to `catwalk-differ.ts`:

```typescript
import type {
  AgentConfig,
  AgentDiffs,
  AgentStateDiff,
  GateConfig,
  GateDiffs,
  OrchestratorConfig,
  OrchestratorDiff,
} from '../types.js';

/** Compare two gate arrays by index, detecting gates that transitioned from closed to open. */
export function diffGates(prev: readonly GateConfig[], next: readonly GateConfig[]): GateDiffs {
  const opened: GateConfig[] = [];

  for (let i = 0; i < next.length; i++) {
    const prevGate = prev[i];
    const nextGate = next[i];
    if (prevGate !== undefined && nextGate !== undefined && !prevGate.open && nextGate.open) {
      opened.push(nextGate);
    }
  }

  return { opened };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts \
       packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts
git commit -m "factory|feat: Implement diffGates with tests"
```

---

### Task 5: Implement and test diffArtifacts

**Files:**

- Modify: `packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts`
- Modify: `packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts`

**Step 1: Write the failing tests for diffArtifacts**

Add to the test file:

```typescript
import type { AgentConfig, GateConfig, OrchestratorConfig, StationArtifactConfig } from '../../types.js';
import { diffAgents, diffArtifacts, diffGates, diffOrchestrator } from '../catwalk-differ.js';

// Add this factory:

/** Minimal station artifact config factory. */
function artifact(
  stationIndex: number,
  label: string,
  overrides: Partial<StationArtifactConfig> = {},
): StationArtifactConfig {
  return {
    stationIndex,
    label,
    color: '#ffffff',
    slot: 'output',
    ...overrides,
  };
}

describe('diffArtifacts', () => {
  it('returns empty array when nothing changed', () => {
    const artifacts = [artifact(0, 'architecture')];
    const diff = diffArtifacts(artifacts, artifacts);

    expect(diff.added).toEqual([]);
  });

  it('detects a single artifact added', () => {
    const prev: StationArtifactConfig[] = [];
    const newArtifact = artifact(0, 'architecture');
    const next = [newArtifact];
    const diff = diffArtifacts(prev, next);

    expect(diff.added).toEqual([newArtifact]);
  });

  it('detects multiple artifacts added at different stations', () => {
    const prev = [artifact(0, 'architecture')];
    const planArtifact = artifact(1, 'plan');
    const codeArtifact = artifact(2, 'code');
    const next = [artifact(0, 'architecture'), planArtifact, codeArtifact];
    const diff = diffArtifacts(prev, next);

    expect(diff.added).toHaveLength(2);
    expect(diff.added).toEqual([planArtifact, codeArtifact]);
  });

  it('detects artifact with version bump as new', () => {
    const prev = [artifact(2, 'code', { version: 1 })];
    const v2Artifact = artifact(2, 'code', { version: 2 });
    const next = [artifact(2, 'code', { version: 1 }), v2Artifact];
    const diff = diffArtifacts(prev, next);

    expect(diff.added).toEqual([v2Artifact]);
  });

  it('treats artifacts without version as version 0 for identity', () => {
    const prev = [artifact(0, 'architecture')];
    const next = [artifact(0, 'architecture')];
    const diff = diffArtifacts(prev, next);

    expect(diff.added).toEqual([]);
  });
});
```

**Step 2: Run tests to verify the new tests fail**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: FAIL — `diffArtifacts` is not exported

**Step 3: Write implementation**

Add to `catwalk-differ.ts`:

```typescript
import type {
  AgentConfig,
  AgentDiffs,
  AgentStateDiff,
  ArtifactDiffs,
  GateConfig,
  GateDiffs,
  OrchestratorConfig,
  OrchestratorDiff,
  StationArtifactConfig,
} from '../types.js';

/** Build a composite identity key for an artifact (artifacts lack a single stable id). */
function artifactKey(a: StationArtifactConfig): string {
  return `${String(a.stationIndex)}:${a.label}:${String(a.version ?? 0)}`;
}

/** Compare two artifact arrays, detecting newly added artifacts by composite key. */
export function diffArtifacts(
  prev: readonly StationArtifactConfig[],
  next: readonly StationArtifactConfig[],
): ArtifactDiffs {
  const prevKeys = new Set(prev.map(artifactKey));
  const added = next.filter((a) => !prevKeys.has(artifactKey(a)));
  return { added };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts \
       packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts
git commit -m "factory|feat: Implement diffArtifacts with tests"
```

---

### Task 6: Implement and test diffCatwalkConfig (top-level composer)

**Files:**

- Modify: `packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts`
- Modify: `packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts`

**Step 1: Write the failing tests for diffCatwalkConfig**

Add to the test file. These tests use full `CatwalkSceneConfig` objects built from the existing per-sub-config factories:

```typescript
import type {
  AgentConfig,
  CatwalkSceneConfig,
  GateConfig,
  OrchestratorConfig,
  StationArtifactConfig,
  StationConfig,
} from '../../types.js';
import { diffAgents, diffArtifacts, diffCatwalkConfig, diffGates, diffOrchestrator } from '../catwalk-differ.js';

// Add this factory:

/** Minimal station config factory. */
function station(phase: string): StationConfig {
  return { phase: phase as StationConfig['phase'], label: phase, color: '#888', absent: false, skipped: false };
}

/** Minimal full scene config factory. */
function sceneConfig(overrides: Partial<CatwalkSceneConfig> = {}): CatwalkSceneConfig {
  return {
    orchestrator: orchestrator(),
    stations: [station('architecture'), station('planning')],
    agents: [agent('arch')],
    gates: [gate(0, 1, false)],
    artifacts: [],
    ...overrides,
  };
}

describe('diffCatwalkConfig', () => {
  it('returns hasChanges false when configs are identical', () => {
    const config = sceneConfig();
    const diff = diffCatwalkConfig(config, config);

    expect(diff.hasChanges).toBe(false);
    expect(diff.orchestrator.moved).toBeNull();
    expect(diff.orchestrator.workingChanged).toBeNull();
    expect(diff.agents.stateChanged).toEqual([]);
    expect(diff.agents.added).toEqual([]);
    expect(diff.agents.removed).toEqual([]);
    expect(diff.gates.opened).toEqual([]);
    expect(diff.artifacts.added).toEqual([]);
  });

  it('returns hasChanges true when orchestrator moved', () => {
    const prev = sceneConfig({ orchestrator: orchestrator({ stationIndex: 0 }) });
    const next = sceneConfig({ orchestrator: orchestrator({ stationIndex: 1 }) });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.orchestrator.moved).toEqual({ from: 0, to: 1 });
  });

  it('returns hasChanges true when an agent state changes', () => {
    const prev = sceneConfig({ agents: [agent('arch', { state: 'working' })] });
    const next = sceneConfig({ agents: [agent('arch', { state: 'resting' })] });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.agents.stateChanged).toHaveLength(1);
  });

  it('returns hasChanges true when a gate opens', () => {
    const prev = sceneConfig({ gates: [gate(0, 1, false)] });
    const next = sceneConfig({ gates: [gate(0, 1, true)] });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.gates.opened).toHaveLength(1);
  });

  it('returns hasChanges true when an artifact is added', () => {
    const newArtifact = artifact(0, 'architecture');
    const prev = sceneConfig({ artifacts: [] });
    const next = sceneConfig({ artifacts: [newArtifact] });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.artifacts.added).toEqual([newArtifact]);
  });

  it('detects changes across all sub-diffs simultaneously', () => {
    const prev = sceneConfig({
      orchestrator: orchestrator({ stationIndex: 0, working: true }),
      agents: [agent('arch', { state: 'working' })],
      gates: [gate(0, 1, false)],
      artifacts: [],
    });
    const next = sceneConfig({
      orchestrator: orchestrator({ stationIndex: 1, working: false }),
      agents: [agent('arch', { state: 'resting' })],
      gates: [gate(0, 1, true)],
      artifacts: [artifact(0, 'architecture')],
    });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.orchestrator.moved).not.toBeNull();
    expect(diff.orchestrator.workingChanged).not.toBeNull();
    expect(diff.agents.stateChanged).toHaveLength(1);
    expect(diff.gates.opened).toHaveLength(1);
    expect(diff.artifacts.added).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify the new tests fail**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: FAIL — `diffCatwalkConfig` is not exported

**Step 3: Write implementation**

Add to `catwalk-differ.ts`:

```typescript
import type {
  AgentConfig,
  AgentDiffs,
  AgentStateDiff,
  ArtifactDiffs,
  CatwalkDiff,
  CatwalkSceneConfig,
  GateConfig,
  GateDiffs,
  OrchestratorConfig,
  OrchestratorDiff,
  StationArtifactConfig,
} from '../types.js';

/** Compute the structural diff between two CatwalkSceneConfig snapshots. */
export function diffCatwalkConfig(prev: CatwalkSceneConfig, next: CatwalkSceneConfig): CatwalkDiff {
  const orchestrator = diffOrchestrator(prev.orchestrator, next.orchestrator);
  const agents = diffAgents(prev.agents, next.agents);
  const gates = diffGates(prev.gates, next.gates);
  const artifacts = diffArtifacts(prev.artifacts, next.artifacts);

  const hasChanges =
    orchestrator.moved !== null ||
    orchestrator.workingChanged !== null ||
    agents.stateChanged.length > 0 ||
    agents.added.length > 0 ||
    agents.removed.length > 0 ||
    gates.opened.length > 0 ||
    artifacts.added.length > 0;

  return { orchestrator, agents, gates, artifacts, hasChanges };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/factory && pnpm run ws test -- --testPathPattern catwalk-differ`
Expected: PASS (all tests across all describe blocks)

**Step 5: Run full checks**

Run: `cd packages/factory && pnpm run ws typecheck && pnpm run ws test && pnpm run ws lint`
Expected: All pass

**Step 6: Commit**

```bash
git add packages/factory/src/client/visualizations/catwalk/state/catwalk-differ.ts \
       packages/factory/src/client/visualizations/catwalk/state/__tests__/catwalk-differ.test.ts
git commit -m "factory|feat: Implement diffCatwalkConfig composer with tests"
```

---

### Task 7: Final verification

**Step 1: Run full project checks from root**

Run: `pnpm run check`
Expected: All pass (typecheck, format, lint, tests)

**Step 2: Review coverage**

Run: `cd packages/factory && pnpm run ws test:coverage -- --testPathPattern catwalk-differ`
Expected: 100% line/branch coverage for `catwalk-differ.ts` (all paths exercised by tests)
