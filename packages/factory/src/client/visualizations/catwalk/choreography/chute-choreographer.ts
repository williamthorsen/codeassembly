import type { Actor } from 'excalibur';
import { vec } from 'excalibur';

import { FlyingArtifactActor } from '../actors/FlyingArtifactActor.js';
import type { GateActor } from '../actors/GateActor.js';
import type { OrchestratorActor } from '../actors/OrchestratorActor.js';
import type { StationAgentActor } from '../actors/StationAgentActor.js';
import type { CatwalkLayoutResult } from '../layout/catwalk-layout.js';
import type { CatwalkDiff, StationArtifactConfig } from '../types.js';

/** Callbacks that the scene provides so the choreographer can spawn temporary actors and add artifacts. */
export interface SceneRefs {
  orchestrator: OrchestratorActor | undefined;
  agents: Map<string, StationAgentActor>;
  gates: Map<string, GateActor>;
  agentCountByStation: Map<number, number>;
  addActor: (actor: Actor) => void;
  addArtifact: (artifact: StationArtifactConfig, layout: CatwalkLayoutResult) => void;
}

/**
 * Suppress the known killed-actor error that Excalibur raises when an actor
 * is killed mid-animation (e.g., scene cleared during playback). Log any
 * unexpected rejection so it surfaces for debugging.
 */
function suppressKilledActorError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes('Actor has been killed')) {
    console.error('Unexpected animation error:', error);
  }
}

/**
 * Sequences chute animations and orchestrator movement based on a CatwalkDiff.
 * When the orchestrator moves AND input artifacts appear at the destination, choreographs a
 * delivery sequence: ascend from origin -> walk -> descend at destination -> land.
 * Otherwise falls back to immediate application.
 */
export async function choreograph(diff: CatwalkDiff, layout: CatwalkLayoutResult, refs: SceneRefs): Promise<void> {
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
 * Execute the sequenced delivery animation: ascend from origin -> pick up -> walk ->
 * descend at destination -> land static inputs at destination.
 */
async function choreographDelivery(
  diff: CatwalkDiff,
  layout: CatwalkLayoutResult,
  refs: SceneRefs,
  deliveryArtifacts: StationArtifactConfig[],
): Promise<void> {
  const orchestrator = refs.orchestrator;
  if (orchestrator === undefined || diff.orchestrator.moved === null) return;

  const moved = diff.orchestrator.moved;
  const originStation = moved.from;
  const destStation = moved.to;

  // Non-delivery artifacts: everything except the delivery inputs -- fade in immediately
  const deliverySet = new Set(deliveryArtifacts);
  const nonDeliveryArtifacts = diff.artifacts.added.filter((a) => !deliverySet.has(a));

  // Apply non-delivery changes immediately (agent states, gates, badge, working, non-delivery artifacts)
  applyAgentChanges(diff, refs);
  applyGateChanges(diff, refs);
  if (diff.orchestrator.codeBadgeChanged !== null) {
    orchestrator.setCodeBadge(diff.orchestrator.codeBadgeChanged.to);
  }
  if (diff.orchestrator.workingChanged !== null) {
    orchestrator.setWorking(diff.orchestrator.workingChanged.to);
  }
  for (const artifact of nonDeliveryArtifacts) {
    refs.addArtifact(artifact, layout);
  }

  // Step 1: Ascend -- flying artifacts rise up the origin station chute
  // Use a default chute position at the origin (slot 0) since the source output's
  // agent slot may differ from the delivery artifact's
  const ascendPromises: Promise<void>[] = [];
  const originAgentCount = Math.max(refs.agentCountByStation.get(originStation) ?? 1, 1);
  for (const artifact of deliveryArtifacts) {
    const endpoints = layout.chuteEndpoints(originStation, 0, originAgentCount);
    const flyer = new FlyingArtifactActor({ label: artifact.label, color: artifact.color }, endpoints, 'ascend');
    refs.addActor(flyer);
    ascendPromises.push(flyer.ascend().catch(suppressKilledActorError));
  }
  await Promise.all(ascendPromises);

  // Step 2: Pick up -- update carried artifacts
  if (diff.orchestrator.carriedChanged !== null) {
    orchestrator.setCarriedArtifacts(diff.orchestrator.carriedChanged.to);
  }

  // Step 3: Walk -- slide orchestrator to destination
  const destPos = layout.orchestratorPosition(destStation);
  await orchestrator.animateMoveTo(vec(destPos.x, destPos.y)).catch(suppressKilledActorError);

  // Step 4: Descend -- flying artifacts drop down the destination station chute
  const descendPromises: Promise<void>[] = [];
  const destAgentCount = Math.max(refs.agentCountByStation.get(destStation) ?? 1, 1);
  for (const artifact of deliveryArtifacts) {
    const endpoints = layout.chuteEndpoints(destStation, 0, destAgentCount);
    const flyer = new FlyingArtifactActor({ label: artifact.label, color: artifact.color }, endpoints, 'descend');
    refs.addActor(flyer);
    descendPromises.push(flyer.descend().catch(suppressKilledActorError));
  }
  await Promise.all(descendPromises);

  // Step 5: Clear carried artifacts and land static inputs at destination station
  orchestrator.setCarriedArtifacts([]);
  for (const artifact of deliveryArtifacts) {
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
    orchestrator.animateMoveTo(vec(pos.x, pos.y)).catch(suppressKilledActorError);
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
