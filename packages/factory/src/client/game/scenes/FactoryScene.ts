import { Color, Scene, vec } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';
import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { AgentActor } from '../actors/AgentActor.js';
import { ArtifactActor } from '../actors/ArtifactActor.js';
import { GateActor } from '../actors/GateActor.js';
import { LadderActor } from '../actors/LadderActor.js';
import { PlatformActor } from '../actors/PlatformActor.js';
import { StationActor } from '../actors/StationActor.js';
import type { LayoutResult } from '../layout/platform-layout.js';
import { computeLayout, REVIEW_STATION_INDEX } from '../layout/platform-layout.js';
import { computeWalkPath, type Waypoint } from '../layout/walk-path.js';
import type { AgentConfig, SceneConfig } from '../mappers/run-to-scene.js';
import { createSceneConfig } from '../mappers/run-to-scene.js';
import { diffAgents } from '../state/agent-differ.js';
import { resolveAgentStates } from '../state/agent-state-resolver.js';

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function walkWithWarning(actor: AgentActor, role: string, waypoints: ReadonlyArray<Waypoint>): Promise<void> {
  return actor.walkPath(waypoints).catch((error: unknown) => {
    console.warn(`[FactoryScene] walkPath failed for agent "${role}":`, error);
  });
}

export class FactoryScene extends Scene {
  private agentMap = new Map<string, AgentActor>();
  private prevAgentConfigs: AgentConfig[] = [];
  private status: CanonicalRunStatus;
  private layout: LayoutResult | undefined;

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
    const reviewerCount = config.agents.filter(
      (a) => a.stationIndex === REVIEW_STATION_INDEX && a.roleType === 'reviewer',
    ).length;
    this.layout = computeLayout(reviewerCount);

    for (const platform of this.layout.platforms) {
      this.add(new PlatformActor(vec(platform.x, platform.y), platform.width, platform.height));
    }

    for (const ladder of this.layout.ladders) {
      this.add(new LadderActor(ladder.x, ladder.bottomY, ladder.topY));
    }

    this.addStations(config, this.layout);
    this.addGates(config, this.layout);

    for (const artifact of config.artifacts) {
      const pos = this.layout.artifactPosition(artifact.stationIndex);
      this.add(new ArtifactActor(artifact.type, vec(pos.x, pos.y)));
    }
  }

  private addStations(config: SceneConfig, layout: LayoutResult): void {
    if (layout.stationPositions.length !== config.stations.length) {
      console.error(
        `[FactoryScene] Station count mismatch: ${String(config.stations.length)} stations but ${String(layout.stationPositions.length)} positions`,
      );
    }
    for (let i = 0; i < config.stations.length; i++) {
      const station = config.stations[i];
      const pos = layout.stationPositions[i];
      if (station === undefined || pos === undefined) continue;
      this.add(new StationActor(station.phase, station.active, vec(pos.x, pos.y)));
    }
  }

  private addGates(config: SceneConfig, layout: LayoutResult): void {
    if (layout.gatePositions.length !== config.gates.length) {
      console.error(
        `[FactoryScene] Gate count mismatch: ${String(config.gates.length)} gates but ${String(layout.gatePositions.length)} positions`,
      );
    }
    for (let i = 0; i < config.gates.length; i++) {
      const gate = config.gates[i];
      const pos = layout.gatePositions[i];
      if (gate === undefined || pos === undefined) continue;
      this.add(new GateActor(gate.open, vec(pos.x, pos.y)));
    }
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

  /**
   * Fade an agent to transparent over 300ms, then remove it from the scene.
   * Fade errors are intentionally ignored because the actor may already have been
   * removed from the scene before the animation completes. The finally block
   * ensures the actor is always killed regardless of fade outcome.
   */
  private fadeOutAndKill(actor: AgentActor): void {
    void actor.actions
      .fade(0, 300)
      .toPromise()
      .catch(() => {
        /* Fade cancelled - actor removed before completion */
      })
      .finally(() => {
        actor.kill();
      });
  }

  /** Apply resolved animation states to all current agent actors. */
  private applyAnimationStates(agents: ReadonlyArray<AgentConfig>): void {
    const stateInfos = resolveAgentStates(agents, this.status);
    const stateByRole = new Map(stateInfos.map((info) => [info.role, info.animationState]));

    for (const agent of agents) {
      const actor = this.agentMap.get(agent.role);
      const animationState = stateByRole.get(agent.role);
      if (actor !== undefined && animationState !== undefined) {
        actor.setAnimationState(animationState);
      } else if (actor !== undefined && animationState === undefined) {
        console.warn(`[FactoryScene] No animation state resolved for agent "${agent.role}"`);
      }
    }
  }

  /** Apply incremental agent updates: add, remove, move, and update animation states. */
  private updateAgents(config: SceneConfig) {
    const nextAgentConfigs = config.agents;
    const diff = diffAgents(this.prevAgentConfigs, nextAgentConfigs);

    // Remove agents no longer present with a fade-out transition
    for (const removed of diff.removed) {
      const actor = this.agentMap.get(removed.role);
      if (actor !== undefined) {
        this.agentMap.delete(removed.role);
        this.fadeOutAndKill(actor);
      }
    }

    // Add new agents (layout must be initialized via buildStaticElements before this point)
    for (const added of diff.added) {
      if (this.layout === undefined) {
        console.warn(`[FactoryScene] Cannot add agent "${added.role}": layout not initialized`);
        continue;
      }
      const pos = this.layout.agentPosition(added.stationIndex, added.stackOffset, added.level, added.approaching);
      const actor = new AgentActor(added.role, added.roleType, vec(pos.x, pos.y));
      this.agentMap.set(added.role, actor);
      this.add(actor);
      if (added.approaching === true) {
        actor.setFacing('right');
      }
    }

    // Move agents that changed position
    for (const { prev, next } of diff.moved) {
      const actor = this.agentMap.get(next.role);
      if (actor !== undefined && this.layout !== undefined) {
        const source = { x: actor.pos.x, y: actor.pos.y };
        const destination = this.layout.agentPosition(
          next.stationIndex,
          next.stackOffset,
          next.level,
          next.approaching,
        );
        const waypoints = computeWalkPath(source, destination, this.layout);

        if (next.role === 'orchestrator') {
          const artifact = config.artifacts.find((a) => a.stationIndex === prev.stationIndex);
          if (artifact !== undefined) {
            actor.showArtifactIndicator(artifact.type);
          }
          void walkWithWarning(actor, next.role, waypoints)
            .then(() => delay(300))
            .finally(() => {
              actor.hideArtifactIndicator();
              actor.setFacing(next.approaching === true ? 'right' : 'left');
            });
        } else {
          void walkWithWarning(actor, next.role, waypoints);
        }
      }
    }

    this.applyAnimationStates(nextAgentConfigs);
    this.prevAgentConfigs = nextAgentConfigs;
  }

  /** Adjust camera position and zoom so that all stations fit within the viewport. */
  private fitCamera(): void {
    if (this.layout === undefined) return;

    const { minX, maxX, minY, maxY } = this.layout.bounds;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const zoomX = 1200 / contentWidth;
    const zoomY = 600 / contentHeight;

    this.camera.zoom = Math.min(zoomX, zoomY, 1); // never zoom in past 1x
    this.camera.pos = vec((minX + maxX) / 2, (minY + maxY) / 2);
  }
}
