import type { Actor } from 'excalibur';
import { vec } from 'excalibur';

import { FlyingArtifactActor } from '../actors/FlyingArtifactActor.js';
import type { GateActor } from '../actors/GateActor.js';
import type { OrchestratorActor } from '../actors/OrchestratorActor.js';
import type { StationAgentActor } from '../actors/StationAgentActor.js';
import type { CatwalkLayoutResult, ChuteEndpoints } from '../layout/catwalk-layout.js';
import type { CatwalkDiff, CatwalkSceneConfig, StationArtifactConfig } from '../types.js';

/** Callbacks that the scene provides so the choreographer can spawn temporary actors and add artifacts. */
export interface SceneRefs {
  orchestrator: OrchestratorActor | undefined;
  agents: Map<string, StationAgentActor>;
  gates: Map<string, GateActor>;
  addActor: (actor: Actor) => void;
  addArtifact: (artifact: StationArtifactConfig, layout: CatwalkLayoutResult) => void;
}

/**
 * Sequences chute animations and orchestrator movement based on a CatwalkDiff.
 * When the orchestrator moves AND new artifacts are present, choreographs a delivery sequence:
 * ascend -> pick up -> walk -> descend. Otherwise falls back to immediate application.
 */
export async function choreograph(
  diff: CatwalkDiff,
  config: CatwalkSceneConfig,
  layout: CatwalkLayoutResult,
  refs: SceneRefs,
): Promise<void> {
  const isDelivery = diff.orchestrator.moved !== null && diff.artifacts.added.length > 0;

  if (isDelivery && refs.orchestrator !== undefined && diff.orchestrator.moved !== null) {
    await choreographDelivery(diff, config, layout, refs);
  } else {
    applyImmediate(diff, layout, refs);
  }
}

/** Execute the sequenced delivery animation: ascend -> pick up -> walk -> descend -> land. */
async function choreographDelivery(
  diff: CatwalkDiff,
  _config: CatwalkSceneConfig,
  layout: CatwalkLayoutResult,
  refs: SceneRefs,
): Promise<void> {
  const orchestrator = refs.orchestrator;
  if (orchestrator === undefined || diff.orchestrator.moved === null) return;

  const moved = diff.orchestrator.moved;
  const originStation = moved.from;
  const destStation = moved.to;

  // Identify artifacts at the origin station
  const originArtifacts = diff.artifacts.added.filter((a) => a.stationIndex === originStation);
  const otherArtifacts = diff.artifacts.added.filter((a) => a.stationIndex !== originStation);

  // Apply non-delivery changes immediately (agent states, gates, non-origin artifacts)
  applyAgentChanges(diff, refs);
  applyGateChanges(diff, refs);
  for (const artifact of otherArtifacts) {
    refs.addArtifact(artifact, layout);
  }

  // Apply code badge immediately
  if (diff.orchestrator.codeBadgeChanged !== null) {
    orchestrator.setCodeBadge(diff.orchestrator.codeBadgeChanged.to);
  }

  // Apply working state immediately
  if (diff.orchestrator.workingChanged !== null) {
    orchestrator.setWorking(diff.orchestrator.workingChanged.to);
  }

  // Step 1: Ascend -- flying artifacts rise up the origin chute
  const ascendPromises: Promise<void>[] = [];
  for (const artifact of originArtifacts) {
    const endpoints = findStationChuteEndpoints(originStation, layout);
    const flyer = new FlyingArtifactActor({ label: artifact.label, color: artifact.color }, endpoints, 'ascend');
    refs.addActor(flyer);
    ascendPromises.push(flyer.ascend().catch(noop));
  }
  await Promise.all(ascendPromises);

  // Step 2: Pick up -- update carried artifacts
  if (diff.orchestrator.carriedChanged !== null) {
    orchestrator.setCarriedArtifacts(diff.orchestrator.carriedChanged.to);
  }

  // Step 3: Walk -- slide orchestrator to destination
  const destPos = layout.orchestratorPosition(destStation);
  await orchestrator.animateMoveTo(vec(destPos.x, destPos.y)).catch(noop);

  // Step 4: Descend -- flying artifacts drop down the destination chute
  const descendPromises: Promise<void>[] = [];
  for (const artifact of originArtifacts) {
    const endpoints = findStationChuteEndpoints(destStation, layout);
    const flyer = new FlyingArtifactActor({ label: artifact.label, color: artifact.color }, endpoints, 'descend');
    refs.addActor(flyer);
    descendPromises.push(flyer.descend().catch(noop));
  }
  await Promise.all(descendPromises);

  // Step 5: Clear carried artifacts and land artifacts at destination
  orchestrator.setCarriedArtifacts([]);
  for (const artifact of originArtifacts) {
    refs.addArtifact(artifact, layout);
  }
}

/** Apply all diff changes immediately (no sequencing). */
function applyImmediate(diff: CatwalkDiff, layout: CatwalkLayoutResult, refs: SceneRefs): void {
  const orchestrator = refs.orchestrator;

  // Orchestrator position
  if (diff.orchestrator.moved !== null && orchestrator !== undefined) {
    const pos = layout.orchestratorPosition(diff.orchestrator.moved.to);
    // Fire-and-forget: no sequencing needed
    orchestrator.animateMoveTo(vec(pos.x, pos.y)).catch(noop);
  }

  // Orchestrator working state
  if (diff.orchestrator.workingChanged !== null && orchestrator !== undefined) {
    orchestrator.setWorking(diff.orchestrator.workingChanged.to);
  }

  // Carried artifacts
  if (diff.orchestrator.carriedChanged !== null && orchestrator !== undefined) {
    orchestrator.setCarriedArtifacts(diff.orchestrator.carriedChanged.to);
  }

  // Code badge
  if (diff.orchestrator.codeBadgeChanged !== null && orchestrator !== undefined) {
    orchestrator.setCodeBadge(diff.orchestrator.codeBadgeChanged.to);
  }

  applyAgentChanges(diff, refs);
  applyGateChanges(diff, refs);

  for (const artifact of diff.artifacts.added) {
    refs.addArtifact(artifact, layout);
  }
}

/** Apply agent state changes and removals. */
function applyAgentChanges(diff: CatwalkDiff, refs: SceneRefs): void {
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

/** Apply gate open animations. */
function applyGateChanges(diff: CatwalkDiff, refs: SceneRefs): void {
  for (const gate of diff.gates.opened) {
    const key = `${gate.betweenStations[0]}:${gate.betweenStations[1]}`;
    const actor = refs.gates.get(key);
    if (actor !== undefined) {
      actor.animateOpen();
    }
  }
}

/** Compute chute endpoints for the center of a station (slot 0, agent count 1). */
function findStationChuteEndpoints(stationIndex: number, layout: CatwalkLayoutResult): ChuteEndpoints {
  return layout.chuteEndpoints(stationIndex, 0, 1);
}

/** No-op catch handler for actor animation promises that may reject if the actor is killed mid-animation. */
function noop(): void {
  // Intentionally empty — guards against killed actor / cleared scene errors.
}
