import type { CanonicalRunStatus } from 'codeassembly-run-core';
import { Actor, BaseAlign, Color, Font, Rectangle, Scene, Text, vec } from 'excalibur';

import { ROLE_TYPE_COLORS } from '../../../../shared/constants/role-type-colors.js';
import { ChuteActor } from '../../catwalk/actors/ChuteActor.js';
import { OrchestratorActor } from '../../catwalk/actors/OrchestratorActor.js';
import { StationAgentActor } from '../../catwalk/actors/StationAgentActor.js';
import { loadAllCatwalkSprites } from '../../catwalk/sprites/catwalk-sprite-loader.js';
import { loadSceneSprites } from '../../shared/load-scene-sprites.js';
import { choreographFloor, type FloorSceneRefs } from '../choreography/floor-choreographer.js';
import { ENGINE_HEIGHT, ENGINE_WIDTH, LABEL_Y_OFFSET } from '../constants/dimensions.js';
import {
  computeFactoryFloorLayout,
  type FactoryFloorLayoutResult,
  type StationLayoutEntry,
} from '../layout/factory-floor-layout.js';
import { mapRunToFactoryFloor } from '../mappers/run-to-factory-floor.js';
import { artifactKey, diffFactoryFloorConfig } from '../state/factory-floor-differ.js';
import type { FactoryFloorDiff, FactoryFloorSceneConfig, StationArtifactConfig } from '../types.js';

const RAIL_HEIGHT = 3;
const RAIL_OPACITY = 0.6;
const RAIL_COLOR = '#FFD700';
const ZONE_BOUNDARY_COLOR = '#444444';
const ZONE_BOUNDARY_HEIGHT = 1;
const ROOM_LINE_COLOR = '#444444';
const ROOM_LINE_WIDTH = 1;

/** Excalibur scene that renders an orchestration run as a three-zone factory floor layout. */
export class FactoryFloorScene extends Scene {
  private status: CanonicalRunStatus;
  private layout: FactoryFloorLayoutResult | undefined;
  private prevConfig: FactoryFloorSceneConfig | undefined;

  private orchestratorRef: OrchestratorActor | undefined;
  private agentRefs = new Map<string, StationAgentActor>();
  private artifactKeySet = new Set<string>();
  private cachedAgentCountByStation = new Map<number, number>();

  private choreographyInProgress = false;
  private pendingDiff:
    { diff: FactoryFloorDiff; config: FactoryFloorSceneConfig; layout: FactoryFloorLayoutResult } | undefined;

  constructor(status: CanonicalRunStatus) {
    super();
    this.status = status;
    this.backgroundColor = Color.fromHex('#1a1a2e');
  }

  override onInitialize(): void {
    // The animation cache is populated before the returned promise settles, so buildScene may run immediately.
    void loadSceneSprites(loadAllCatwalkSprites, 'Failed to load catwalk sprites:');
    this.buildScene();
    this.positionCamera();
  }

  /** Apply diff-driven updates on subsequent calls; full rebuild on the first call or artifact regression. */
  updateStatus(status: CanonicalRunStatus): void {
    this.status = status;
    const nextConfig = mapRunToFactoryFloor(status);

    if (this.prevConfig === undefined || hasArtifactRegression(this.prevConfig, nextConfig)) {
      this.resetScene();
    } else {
      const diff = diffFactoryFloorConfig(this.prevConfig, nextConfig);
      if (diff.hasChanges) {
        const layoutEntries = buildLayoutEntries(nextConfig);
        const layout = computeFactoryFloorLayout({ stations: layoutEntries });
        this.layout = layout;
        this.applyDiff(diff, nextConfig, layout);
      }
      this.prevConfig = nextConfig;
    }
  }

  private resetScene(): void {
    this.choreographyInProgress = false;
    this.pendingDiff = undefined;
    this.orchestratorRef = undefined;
    this.agentRefs.clear();
    this.artifactKeySet.clear();
    this.cachedAgentCountByStation.clear();
    this.clear();
    this.buildScene();
    this.positionCamera();
  }

  private applyDiff(diff: FactoryFloorDiff, config: FactoryFloorSceneConfig, layout: FactoryFloorLayoutResult): void {
    if (this.choreographyInProgress) {
      this.pendingDiff = { diff, config, layout };
      return;
    }

    this.cachedAgentCountByStation = buildAgentCountByStation(config);

    // Fade out orchestrator when moving to a sentinel station index
    if (diff.orchestrator.moved !== null && diff.orchestrator.moved.to < 0 && this.orchestratorRef !== undefined) {
      this.orchestratorRef.fadeOut();
      this.orchestratorRef = undefined;
    }

    // Create orchestrator if needed
    if (diff.orchestrator.moved !== null && diff.orchestrator.moved.to >= 0 && this.orchestratorRef === undefined) {
      const pos = layout.orchestratorPosition(diff.orchestrator.moved.to);
      const orchestratorActor = new OrchestratorActor({ working: config.orchestrator.working }, vec(pos.x, pos.y));
      orchestratorActor.setCarriedArtifacts(config.orchestrator.carriedArtifacts);
      orchestratorActor.setCodeBadge(config.orchestrator.codeBadge);
      this.add(orchestratorActor);
      this.orchestratorRef = orchestratorActor;
    }

    this.addDiffAgents(diff, layout);

    const refs = this.buildSceneRefs();
    this.choreographyInProgress = true;

    void this.runChoreography(diff, layout, refs);
  }

  /** Run the choreographer to completion, then apply whatever diff arrived while it was animating. */
  private async runChoreography(
    diff: FactoryFloorDiff,
    layout: FactoryFloorLayoutResult,
    refs: FloorSceneRefs,
  ): Promise<void> {
    try {
      await choreographFloor(diff, layout, refs);
      this.choreographyInProgress = false;

      if (
        diff.orchestrator.celebratingChanged !== null &&
        diff.orchestrator.celebratingChanged.to &&
        this.orchestratorRef !== undefined
      ) {
        this.orchestratorRef.celebrate();
      }

      this.positionCamera();
    } catch (error: unknown) {
      console.error('Choreography error:', error);
      this.choreographyInProgress = false;
    }

    // Apply any buffered diff so the scene does not get stuck
    if (this.pendingDiff !== undefined) {
      const pending = this.pendingDiff;
      this.pendingDiff = undefined;
      this.applyDiff(pending.diff, pending.config, pending.layout);
    }
  }

  private buildSceneRefs(): FloorSceneRefs {
    return {
      orchestrator: this.orchestratorRef,
      agents: this.agentRefs,
      agentCountByStation: this.cachedAgentCountByStation,
      addActor: (actor: Actor) => {
        this.add(actor);
      },
      addArtifact: (artifact: StationArtifactConfig, layout: FactoryFloorLayoutResult) => {
        this.addSingleArtifact(artifact, layout);
      },
    };
  }

  private addDiffAgents(diff: FactoryFloorDiff, layout: FactoryFloorLayoutResult): void {
    for (const agent of diff.agents.added) {
      const agentCountAtStation = this.cachedAgentCountByStation.get(agent.stationIndex) ?? 1;
      const pos = layout.agentPosition(agent.stationIndex, agent.slotIndex, agentCountAtStation);
      const actor = new StationAgentActor(
        { id: agent.id, role: agent.role, color: ROLE_TYPE_COLORS[agent.roleType], state: agent.state },
        vec(pos.x, pos.y),
      );
      actor.fadeIn();
      this.add(actor);
      this.agentRefs.set(agent.id, actor);

      this.addLabel(agent.role, ROLE_TYPE_COLORS[agent.roleType], pos.x, pos.y);
    }
  }

  private addSingleArtifact(_artifact: StationArtifactConfig, _layout: FactoryFloorLayoutResult): void {
    // Artifact rendering is deferred to visual polish pass; track keys for diff detection
    const key = artifactKey(_artifact);
    if (this.artifactKeySet.has(key)) return;
    this.artifactKeySet.add(key);
  }

  private buildScene(): void {
    const config = mapRunToFactoryFloor(this.status);
    const layoutEntries = buildLayoutEntries(config);
    const layout = computeFactoryFloorLayout({ stations: layoutEntries });
    this.layout = layout;
    this.prevConfig = config;
    this.cachedAgentCountByStation = buildAgentCountByStation(config);

    this.drawRail(layout);
    this.drawZoneBoundaries(layout);
    this.drawRooms(layout);
    this.addChutes(config, layout);
    this.addAgents(config, layout);
    this.addLabels(config, layout);
    this.addOrchestrator(config, layout);
  }

  private drawRail(layout: FactoryFloorLayoutResult): void {
    const { x1, x2, y } = layout.railEndpoints();
    const width = x2 - x1;
    const midX = (x1 + x2) / 2;

    const rail = new Actor({ pos: vec(midX, y) });
    rail.graphics.use(
      new Rectangle({
        width,
        height: RAIL_HEIGHT,
        color: Color.fromHex(RAIL_COLOR),
      }),
    );
    rail.graphics.opacity = RAIL_OPACITY;
    this.add(rail);
  }

  private drawZoneBoundaries(layout: FactoryFloorLayoutResult): void {
    // Upper boundary line
    const upper = layout.upperBoundaryEndpoints();
    this.drawHorizontalLine(upper.x1, upper.x2, upper.y);

    // Lower boundary line
    const lower = layout.lowerBoundaryEndpoints();
    this.drawHorizontalLine(lower.x1, lower.x2, lower.y);
  }

  private drawHorizontalLine(x1: number, x2: number, y: number): void {
    const width = x2 - x1;
    const midX = (x1 + x2) / 2;

    const line = new Actor({ pos: vec(midX, y) });
    line.graphics.use(
      new Rectangle({
        width,
        height: ZONE_BOUNDARY_HEIGHT,
        color: Color.fromHex(ZONE_BOUNDARY_COLOR),
      }),
    );
    this.add(line);
  }

  private drawVerticalLine(x: number, y1: number, y2: number): void {
    const height = y2 - y1;
    const midY = (y1 + y2) / 2;

    const line = new Actor({ pos: vec(x, midY) });
    line.graphics.use(
      new Rectangle({
        width: ROOM_LINE_WIDTH,
        height,
        color: Color.fromHex(ROOM_LINE_COLOR),
      }),
    );
    this.add(line);
  }

  private drawRooms(layout: FactoryFloorLayoutResult): void {
    const coder = layout.coderRoomBounds();
    const orch = layout.orchestratorRoomBounds();

    // Coder room left wall
    this.drawVerticalLine(coder.left, coder.top, coder.bottom);
    // Shared wall between coder and orchestrator rooms
    this.drawVerticalLine(coder.right, coder.top, coder.bottom);
    // Orchestrator room right wall
    this.drawVerticalLine(orch.right, orch.top, orch.bottom);
  }

  private addChutes(config: FactoryFloorSceneConfig, layout: FactoryFloorLayoutResult): void {
    const agentCountByStation = buildAgentCountByStation(config);

    for (const agent of config.agents) {
      if (!layout.hasChute(agent.stationIndex)) continue;

      const agentCountAtStation = agentCountByStation.get(agent.stationIndex) ?? 1;
      const endpoints = layout.chuteEndpoints(agent.stationIndex, agent.slotIndex, agentCountAtStation);
      const station = config.stations[agent.stationIndex];
      const dimmed = station?.absent === true;
      this.add(new ChuteActor({ dimmed }, endpoints));
    }
  }

  private addAgents(config: FactoryFloorSceneConfig, layout: FactoryFloorLayoutResult): void {
    const agentCountByStation = buildAgentCountByStation(config);

    for (const agent of config.agents) {
      const agentCountAtStation = agentCountByStation.get(agent.stationIndex) ?? 1;
      const pos = layout.agentPosition(agent.stationIndex, agent.slotIndex, agentCountAtStation);
      const stationAgentActor = new StationAgentActor(
        { id: agent.id, role: agent.role, color: ROLE_TYPE_COLORS[agent.roleType], state: agent.state },
        vec(pos.x, pos.y),
      );
      this.add(stationAgentActor);
      this.agentRefs.set(agent.id, stationAgentActor);
    }
  }

  private addLabels(config: FactoryFloorSceneConfig, layout: FactoryFloorLayoutResult): void {
    const agentCountByStation = buildAgentCountByStation(config);

    for (const agent of config.agents) {
      const agentCountAtStation = agentCountByStation.get(agent.stationIndex) ?? 1;
      const pos = layout.agentPosition(agent.stationIndex, agent.slotIndex, agentCountAtStation);
      this.addLabel(agent.role, ROLE_TYPE_COLORS[agent.roleType], pos.x, pos.y);
    }
  }

  /** Create a text label beneath an agent at the given position. */
  private addLabel(role: string, color: string, x: number, y: number): void {
    const label = new Text({
      text: role,
      color: Color.fromHex(color),
      font: new Font({
        size: 10,
        bold: true,
        family: 'monospace',
        baseAlign: BaseAlign.Top,
      }),
    });

    const labelActor = new Actor({ pos: vec(x, y + LABEL_Y_OFFSET) });
    labelActor.graphics.use(label);
    // Anchor (0.5, 0) centers text horizontally on x, with top at the label y position.
    labelActor.graphics.anchor = vec(0.5, 0);
    this.add(labelActor);
  }

  private addOrchestrator(config: FactoryFloorSceneConfig, layout: FactoryFloorLayoutResult): void {
    if (config.orchestrator.stationIndex < 0) return;

    const pos = layout.orchestratorPosition(config.orchestrator.stationIndex);
    const orchestratorActor = new OrchestratorActor({ working: config.orchestrator.working }, vec(pos.x, pos.y));
    orchestratorActor.setCarriedArtifacts(config.orchestrator.carriedArtifacts);
    orchestratorActor.setCodeBadge(config.orchestrator.codeBadge);

    if (config.orchestrator.celebrating) {
      orchestratorActor.celebrate();
    }

    this.add(orchestratorActor);
    this.orchestratorRef = orchestratorActor;
  }

  private positionCamera(): void {
    if (this.layout === undefined) return;

    this.camera.zoom = Math.min(1, ENGINE_WIDTH / this.layout.platformWidth);
    this.camera.pos = vec(this.layout.platformWidth / 2, ENGINE_HEIGHT / 2);
  }
}

/** Build a lookup map of station index to agent count. */
function buildAgentCountByStation(config: FactoryFloorSceneConfig): Map<number, number> {
  const counts = new Map<number, number>();
  for (const agent of config.agents) {
    counts.set(agent.stationIndex, (counts.get(agent.stationIndex) ?? 0) + 1);
  }
  return counts;
}

/** Build station layout entries from the scene config. */
function buildLayoutEntries(config: FactoryFloorSceneConfig): StationLayoutEntry[] {
  const agentCountByStation = buildAgentCountByStation(config);
  return config.stations.map((station, index) => ({
    agentCount: agentCountByStation.get(index) ?? 0,
    ...(station.absent && { absent: true }),
  }));
}

/** Detect whether any artifact key present in prevConfig is absent from nextConfig. */
function hasArtifactRegression(prev: FactoryFloorSceneConfig, next: FactoryFloorSceneConfig): boolean {
  const nextKeys = new Set(next.artifacts.map(artifactKey));
  return prev.artifacts.some((a) => !nextKeys.has(artifactKey(a)));
}
