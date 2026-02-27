import { Actor, Color, Scene, vec } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';
import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { AgentActor } from '../actors/AgentActor.js';
import { ArtifactActor } from '../actors/ArtifactActor.js';
import { GateActor } from '../actors/GateActor.js';
import { StationActor } from '../actors/StationActor.js';
import type { AgentConfig, SceneConfig } from '../mappers/run-to-scene.js';
import { createSceneConfig, PHASE_NAMES } from '../mappers/run-to-scene.js';
import { diffAgents } from '../state/agent-differ.js';
import { resolveAgentStates } from '../state/agent-state-resolver.js';

const STATION_SPACING = 150;
const START_X = 200;

const AGENTS_PER_ROW = 3;
const AGENT_H_SPACING = 36; // 32px sprite + 4px gap
const AGENT_V_SPACING = 38; // 32px sprite + 6px gap

/** Compute the screen position for an agent based on its config. */
function agentPosition(agent: AgentConfig) {
  const col = agent.stackOffset % AGENTS_PER_ROW;
  const row = Math.floor(agent.stackOffset / AGENTS_PER_ROW);
  const xOffset = (col - (AGENTS_PER_ROW - 1) / 2) * AGENT_H_SPACING;
  return vec(START_X + agent.stationIndex * STATION_SPACING + xOffset, 320 - row * AGENT_V_SPACING);
}

export class FactoryScene extends Scene {
  private agentMap = new Map<string, AgentActor>();
  private prevAgentConfigs: AgentConfig[] = [];
  private status: CanonicalRunStatus;

  constructor(status: CanonicalRunStatus) {
    super();
    this.status = status;
    this.backgroundColor = Color.fromHex(PALETTE.black);
  }

  override onInitialize(): void {
    this.buildScene();
    this.fitCamera();
  }

  updateStatus(status: CanonicalRunStatus): void {
    this.status = status;
    const config = createSceneConfig(this.status);
    this.rebuildStaticElements(config);
    this.updateAgents(config);
    this.fitCamera();
  }

  private buildScene() {
    const config = createSceneConfig(this.status);
    this.buildStaticElements(config);
    this.updateAgents(config);
  }

  private buildStaticElements(config: SceneConfig) {
    const platform = new Actor({
      pos: vec(600, 400),
      width: 1100,
      height: 20,
      color: Color.fromHex(PALETTE.darkGray),
    });
    this.add(platform);

    config.stations.forEach((station, i) => {
      const stationActor = new StationActor(station.phase, station.active, vec(START_X + i * STATION_SPACING, 350));
      this.add(stationActor);
    });

    config.gates.forEach((gate, i) => {
      const gateActor = new GateActor(gate.open, vec(START_X + (i + 0.5) * STATION_SPACING, 380));
      this.add(gateActor);
    });

    config.artifacts.forEach((artifact) => {
      const artifactActor = new ArtifactActor(
        artifact.type,
        vec(START_X + artifact.stationIndex * STATION_SPACING + 30, 340),
      );
      this.add(artifactActor);
    });
  }

  /** Remove all actors and rebuild static elements (platform, stations, gates, artifacts). */
  private rebuildStaticElements(config: SceneConfig) {
    // Remove non-agent actors by clearing the full scene and re-adding agents
    this.clear();

    // Re-add existing agent actors that survived the diff
    for (const agentActor of this.agentMap.values()) {
      this.add(agentActor);
    }

    this.buildStaticElements(config);
  }

  /** Fade an agent to transparent over 300ms, then remove it from the scene. */
  private fadeOutAndKill(actor: AgentActor): void {
    void actor.actions
      .fade(0, 300)
      .toPromise()
      .catch(() => {})
      .finally(() => {
        actor.kill();
      });
  }

  /** Apply incremental agent updates: add, remove, move, and update animation states. */
  private updateAgents(config: SceneConfig) {
    const nextAgentConfigs = config.agents;
    const diff = diffAgents(this.prevAgentConfigs, nextAgentConfigs);
    const stateInfos = resolveAgentStates(nextAgentConfigs, this.status);

    // Build a lookup from role to resolved animation state
    const stateByRole = new Map(stateInfos.map((info) => [info.role, info.animationState]));

    // Remove agents no longer present with a fade-out transition
    for (const removed of diff.removed) {
      const actor = this.agentMap.get(removed.role);
      if (actor !== undefined) {
        this.agentMap.delete(removed.role);
        this.fadeOutAndKill(actor);
      }
    }

    // Add new agents
    for (const added of diff.added) {
      const actor = new AgentActor(added.role, added.roleType, agentPosition(added));
      this.agentMap.set(added.role, actor);
      this.add(actor);
    }

    // Move agents that changed position
    for (const { next } of diff.moved) {
      const actor = this.agentMap.get(next.role);
      if (actor !== undefined) {
        actor.walkTo(agentPosition(next)).catch((error: unknown) => {
          console.warn(`[FactoryScene] walkTo failed for agent "${next.role}":`, error);
        });
      }
    }

    // Apply animation states to all current agents
    for (const nextAgent of nextAgentConfigs) {
      const actor = this.agentMap.get(nextAgent.role);
      const animationState = stateByRole.get(nextAgent.role);
      if (actor !== undefined && animationState !== undefined) {
        actor.setAnimationState(animationState);
      } else if (actor !== undefined && animationState === undefined) {
        console.warn(`[FactoryScene] No animation state resolved for agent "${nextAgent.role}"`);
      }
    }

    this.prevAgentConfigs = nextAgentConfigs;
  }

  /** Adjust camera position and zoom so that all stations fit within the viewport. */
  private fitCamera(): void {
    const margin = 40;
    const stationCount = PHASE_NAMES.length;
    const stationHalfWidth = 50;

    const left = START_X - stationHalfWidth - margin;
    const right = START_X + (stationCount - 1) * STATION_SPACING + stationHalfWidth + margin;
    const bottom = 420 + margin; // platform bottom edge + margin
    const top = 260 - margin; // conservative top for agent stacks

    const contentWidth = right - left;
    const contentHeight = bottom - top;
    const zoomX = 1200 / contentWidth;
    const zoomY = 600 / contentHeight;

    this.camera.zoom = Math.min(zoomX, zoomY, 1); // never zoom in past 1x
    this.camera.pos = vec((left + right) / 2, (top + bottom) / 2);
  }
}
