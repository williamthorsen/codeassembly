import { type Actor, vec } from 'excalibur';

import { FlyingArtifactActor } from '../../catwalk/actors/FlyingArtifactActor.ts';
import type { OrchestratorActor } from '../../catwalk/actors/OrchestratorActor.ts';
import type { StationAgentActor } from '../../catwalk/actors/StationAgentActor.ts';
import { runAnimationSuppressingErrors } from '../../shared/run-animation-suppressing-errors.ts';
import type { FactoryFloorLayoutResult } from '../layout/factory-floor-layout.ts';
import type { FactoryFloorDiff, StationArtifactConfig } from '../types.ts';

/** Callbacks the scene provides for the choreographer to spawn actors and track artifacts. */
export interface FloorSceneRefs {
  orchestrator: OrchestratorActor | undefined;
  agents: Map<string, StationAgentActor>;
  agentCountByStation: Map<number, number>;
  addActor: (actor: Actor) => void;
  addArtifact: (artifact: StationArtifactConfig, layout: FactoryFloorLayoutResult) => void;
}

/**
 * Sequences animations for the factory-floor layout. Handles both chute-based
 * deliveries (upper/lower zones) and direct horizontal walks (rail-level stations).
 */
export async function choreographFloor(
  diff: FactoryFloorDiff,
  layout: FactoryFloorLayoutResult,
  refs: FloorSceneRefs,
): Promise<void> {
  if (diff.orchestrator.moved === null || refs.orchestrator === undefined) {
    applyImmediate(diff, layout, refs);
    return;
  }

  const deliveryArtifacts = diff.artifacts.added.filter(
    (a) => a.stationIndex === diff.orchestrator.moved?.to && a.slot === 'input',
  );

  if (deliveryArtifacts.length > 0) {
    await choreographDelivery(diff, layout, refs, deliveryArtifacts);
  } else {
    applyImmediate(diff, layout, refs);
  }
}

/**
 * Execute the sequenced delivery animation. For upper/lower zone destinations,
 * artifacts ascend/descend via chutes. For rail-level destinations (Coder, Summary),
 * the orchestrator walks directly along the rail.
 */
async function choreographDelivery(
  diff: FactoryFloorDiff,
  layout: FactoryFloorLayoutResult,
  refs: FloorSceneRefs,
  deliveryArtifacts: StationArtifactConfig[],
): Promise<void> {
  const orchestrator = refs.orchestrator;
  if (orchestrator === undefined || diff.orchestrator.moved === null) return;

  const moved = diff.orchestrator.moved;
  const originStation = moved.from;
  const destStation = moved.to;

  const deliverySet = new Set(deliveryArtifacts);
  const nonDeliveryArtifacts = diff.artifacts.added.filter((a) => !deliverySet.has(a));

  // Apply non-delivery changes immediately
  applyAgentChanges(diff, refs);
  if (diff.orchestrator.codeBadgeChanged !== null) {
    orchestrator.setCodeBadge(diff.orchestrator.codeBadgeChanged.to);
  }
  if (diff.orchestrator.workingChanged !== null) {
    orchestrator.setWorking(diff.orchestrator.workingChanged.to);
  }
  for (const artifact of nonDeliveryArtifacts) {
    refs.addArtifact(artifact, layout);
  }

  const destZone = layout.zoneOf(destStation);
  const hasChute = destZone === 'upper' || destZone === 'lower';

  if (hasChute && layout.hasChute(originStation)) {
    // Step 1: Ascend from origin chute
    const originAgentCount = Math.max(refs.agentCountByStation.get(originStation) ?? 1, 1);
    const ascendPromises: Promise<void>[] = [];
    for (const artifact of deliveryArtifacts) {
      const endpoints = layout.chuteEndpoints(originStation, 0, originAgentCount);
      const direction = layout.zoneOf(originStation) === 'upper' ? 'descend' : 'ascend';
      const flyer = new FlyingArtifactActor({ label: artifact.label, color: artifact.color }, endpoints, direction);
      refs.addActor(flyer);
      ascendPromises.push(
        runAnimationSuppressingErrors(() => (direction === 'ascend' ? flyer.ascend() : flyer.descend())),
      );
    }
    await Promise.all(ascendPromises);
  }

  // Step 2: Pick up carried artifacts
  if (diff.orchestrator.carriedChanged !== null) {
    orchestrator.setCarriedArtifacts(diff.orchestrator.carriedChanged.to);
  }

  // Step 3: Walk to destination
  const destPos = layout.orchestratorPosition(destStation);
  await runAnimationSuppressingErrors(() => orchestrator.animateMoveTo(vec(destPos.x, destPos.y)));

  if (hasChute) {
    // Step 4: Descend/ascend at destination chute
    const destAgentCount = Math.max(refs.agentCountByStation.get(destStation) ?? 1, 1);
    const descendPromises: Promise<void>[] = [];
    for (const artifact of deliveryArtifacts) {
      const endpoints = layout.chuteEndpoints(destStation, 0, destAgentCount);
      const direction = destZone === 'upper' ? 'ascend' : 'descend';
      const flyer = new FlyingArtifactActor({ label: artifact.label, color: artifact.color }, endpoints, direction);
      refs.addActor(flyer);
      descendPromises.push(
        runAnimationSuppressingErrors(() => (direction === 'ascend' ? flyer.ascend() : flyer.descend())),
      );
    }
    await Promise.all(descendPromises);
  }

  // Step 5: Clear carried and land static artifacts
  orchestrator.setCarriedArtifacts([]);
  for (const artifact of deliveryArtifacts) {
    refs.addArtifact(artifact, layout);
  }
}

/** Apply all diff changes immediately without animation sequencing. */
function applyImmediate(diff: FactoryFloorDiff, layout: FactoryFloorLayoutResult, refs: FloorSceneRefs): void {
  const orchestrator = refs.orchestrator;

  if (orchestrator !== undefined) {
    if (diff.orchestrator.moved !== null) {
      const pos = layout.orchestratorPosition(diff.orchestrator.moved.to);
      // Fire-and-forget: no sequencing needed
      void runAnimationSuppressingErrors(() => orchestrator.animateMoveTo(vec(pos.x, pos.y)));
    }

    if (diff.orchestrator.workingChanged !== null) {
      orchestrator.setWorking(diff.orchestrator.workingChanged.to);
    }

    if (diff.orchestrator.carriedChanged !== null) {
      orchestrator.setCarriedArtifacts(diff.orchestrator.carriedChanged.to);
    }

    if (diff.orchestrator.codeBadgeChanged !== null) {
      orchestrator.setCodeBadge(diff.orchestrator.codeBadgeChanged.to);
    }
  }

  applyAgentChanges(diff, refs);

  for (const artifact of diff.artifacts.added) {
    refs.addArtifact(artifact, layout);
  }
}

/** Apply agent state changes and removals. */
function applyAgentChanges(diff: FactoryFloorDiff, refs: FloorSceneRefs): void {
  for (const change of diff.agents.stateChanged) {
    const actor = refs.agents.get(change.agentId);
    if (actor !== undefined) {
      actor.animateToState(change.to);
    }
  }

  for (const agent of diff.agents.removed) {
    const actor = refs.agents.get(agent.id);
    if (actor !== undefined) {
      actor.animateToState('deactivated');
      refs.agents.delete(agent.id);
    }
  }
}
