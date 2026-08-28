import type { CanonicalRunStatus } from 'codeassembly-run-core';
import { Actor, Color, Rectangle, Scene, vec } from 'excalibur';

import { ROLE_TYPE_COLORS } from '../../../../shared/constants/role-types.js';
import { loadSceneSprites } from '../../shared/load-scene-sprites.js';
import { ArtifactActor } from '../actors/ArtifactActor.js';
import { CatwalkStationActor } from '../actors/CatwalkStationActor.js';
import { ChuteActor } from '../actors/ChuteActor.js';
import { GateActor } from '../actors/GateActor.js';
import { OrchestratorActor } from '../actors/OrchestratorActor.js';
import { StationAgentActor } from '../actors/StationAgentActor.js';
import { choreograph, type SceneRefs } from '../choreography/chute-choreographer.js';
import { CAMERA_TOP_MARGIN, DIVIDER_WIDTH, ENGINE_HEIGHT, ENGINE_WIDTH, RAIL_Y } from '../constants/dimensions.js';
import { type CatwalkLayoutResult, computeCatwalkLayout, type StationLayoutEntry } from '../layout/catwalk-layout.js';
import { mapRunToCatwalk } from '../mappers/run-to-catwalk.js';
import { loadAllCatwalkSprites } from '../sprites/catwalk-sprite-loader.js';
import { artifactKey, diffCatwalkConfig } from '../state/catwalk-differ.js';
import type { CatwalkDiff, CatwalkSceneConfig, StationArtifactConfig } from '../types.js';

const RAIL_HEIGHT = 3;
const RAIL_OPACITY = 0.6;
const RAIL_COLOR = '#FFD700';

const GROUND_LINE_HEIGHT = 2;
const GROUND_LINE_COLOR = '#444444';

const DIVIDER_COLOR = '#666666';

/** Excalibur scene that renders an orchestration run as a catwalk with stations, agents, gates, chutes, and artifacts. */
export class CatwalkScene extends Scene {
  private status: CanonicalRunStatus;
  private layout: CatwalkLayoutResult | undefined;
  private prevConfig: CatwalkSceneConfig | undefined;

  // Actor registry -- populated by buildScene(), updated by applyDiff()
  private orchestratorRef: OrchestratorActor | undefined;
  private agentRefs = new Map<string, StationAgentActor>();
  private gateRefs = new Map<string, GateActor>();
  private artifactKeySet = new Set<string>();
  /** Composite-keyed artifact count: `${stationIndex}:${agentSlotIndex}` for outputs, `${stationIndex}:input` for inputs. */
  private artifactCountByKey = new Map<string, number>();
  /** Cached agent count per station, updated at the start of each diff application. */
  private cachedAgentCountByStation = new Map<number, number>();

  // Choreography guard -- prevents overlapping animations
  private choreographyInProgress = false;
  private pendingDiff: { diff: CatwalkDiff; config: CatwalkSceneConfig; layout: CatwalkLayoutResult } | undefined;

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

  /** Apply diff-driven animations on subsequent calls; full rebuild on the first call or artifact regression. */
  updateStatus(status: CanonicalRunStatus): void {
    this.status = status;
    const nextConfig = mapRunToCatwalk(status);

    if (this.prevConfig === undefined || hasArtifactRegression(this.prevConfig, nextConfig)) {
      this.resetScene();
    } else {
      const diff = diffCatwalkConfig(this.prevConfig, nextConfig);
      if (diff.hasChanges) {
        const layoutEntries = buildLayoutEntries(nextConfig);
        const layout = computeCatwalkLayout({ stations: layoutEntries });
        this.layout = layout;
        this.applyDiff(diff, nextConfig, layout);
      }
      this.prevConfig = nextConfig;
    }
  }

  /** Clear the scene completely and rebuild from the current status. Cancels any in-flight choreography. */
  private resetScene(): void {
    this.choreographyInProgress = false;
    this.pendingDiff = undefined;
    this.orchestratorRef = undefined;
    this.agentRefs.clear();
    this.gateRefs.clear();
    this.artifactKeySet.clear();
    this.artifactCountByKey.clear();
    this.cachedAgentCountByStation.clear();
    this.clear();
    this.buildScene();
    this.positionCamera();
  }

  /** Dispatch animations to actors via the choreographer. Buffers if a choreography is in progress. */
  private applyDiff(diff: CatwalkDiff, config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    if (this.choreographyInProgress) {
      // Buffer the latest diff; when the current choreography finishes, it will be applied.
      this.pendingDiff = { diff, config, layout };
      return;
    }

    // Cache the agent count per station from the incoming config so that
    // addSingleArtifact (called during choreography) uses the current layout.
    this.cachedAgentCountByStation = buildAgentCountByStation(config);

    // Guard: fade out orchestrator when moving to a negative (sentinel) station index
    if (diff.orchestrator.moved !== null && diff.orchestrator.moved.to < 0 && this.orchestratorRef !== undefined) {
      this.orchestratorRef.fadeOut();
      this.orchestratorRef = undefined;
    }

    // Create orchestrator if it needs to appear and doesn't exist
    if (diff.orchestrator.moved !== null && diff.orchestrator.moved.to >= 0 && this.orchestratorRef === undefined) {
      const pos = layout.orchestratorPosition(diff.orchestrator.moved.to);
      const orchestratorActor = new OrchestratorActor(
        { working: config.orchestrator.working, waiting: config.orchestrator.waiting },
        vec(pos.x, pos.y),
      );
      orchestratorActor.setCarriedArtifacts(config.orchestrator.carriedArtifacts);
      orchestratorActor.setCodeBadge(config.orchestrator.codeBadge);
      this.add(orchestratorActor);
      this.orchestratorRef = orchestratorActor;
    }

    // Apply waiting state immediately (not via choreography animation)
    if (diff.orchestrator.waitingChanged !== null && this.orchestratorRef !== undefined) {
      this.orchestratorRef.setWaiting(diff.orchestrator.waitingChanged.to);
    }

    // Added agents are always handled by the scene directly (not by the choreographer)
    this.addDiffAgents(diff, layout);

    const refs = this.buildSceneRefs();
    this.choreographyInProgress = true;

    void this.runChoreography(diff, layout, refs);
  }

  /** Run the choreographer to completion, then apply whatever diff arrived while it was animating. */
  private async runChoreography(diff: CatwalkDiff, layout: CatwalkLayoutResult, refs: SceneRefs): Promise<void> {
    try {
      await choreograph(diff, layout, refs);
      this.choreographyInProgress = false;

      // Trigger celebration after orchestrator arrives at destination
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

  /** Build the SceneRefs object that the choreographer needs. */
  private buildSceneRefs(): SceneRefs {
    return {
      orchestrator: this.orchestratorRef,
      agents: this.agentRefs,
      gates: this.gateRefs,
      agentCountByStation: this.cachedAgentCountByStation,
      addActor: (actor: Actor) => {
        this.add(actor);
      },
      addArtifact: (artifact: StationArtifactConfig, layout: CatwalkLayoutResult) => {
        this.addSingleArtifact(artifact, layout);
      },
    };
  }

  /** Add newly appearing agents from a diff (fade in from invisible). */
  private addDiffAgents(diff: CatwalkDiff, layout: CatwalkLayoutResult): void {
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
    }
  }

  /** Add a single artifact actor at its stacked position using layout functions. */
  private addSingleArtifact(artifact: StationArtifactConfig, layout: CatwalkLayoutResult): void {
    const key = artifactKey(artifact);
    if (this.artifactKeySet.has(key)) return;
    this.artifactKeySet.add(key);

    const agentCount = Math.max(this.cachedAgentCountByStation.get(artifact.stationIndex) ?? 1, 1);

    // Determine the count key and stack position
    const countKey =
      artifact.slot === 'input'
        ? `${artifact.stationIndex}:input`
        : `${artifact.stationIndex}:${artifact.agentSlotIndex}`;
    const stackIndex = this.artifactCountByKey.get(countKey) ?? 0;
    this.artifactCountByKey.set(countKey, stackIndex + 1);

    const pos =
      artifact.slot === 'input'
        ? layout.inputArtifactPosition(artifact.stationIndex, agentCount, stackIndex)
        : layout.outputArtifactPosition(artifact.stationIndex, artifact.agentSlotIndex, agentCount, stackIndex);

    const actor = new ArtifactActor({ label: artifact.label, color: artifact.color }, vec(pos.x, pos.y));
    actor.fadeIn();
    this.add(actor);
  }

  /** Converts the current run status to a scene config, computes layout, and adds all actors. */
  private buildScene(): void {
    const config = mapRunToCatwalk(this.status);
    const layoutEntries = buildLayoutEntries(config);
    const layout = computeCatwalkLayout({ stations: layoutEntries });
    this.layout = layout;
    this.prevConfig = config;
    this.cachedAgentCountByStation = buildAgentCountByStation(config);

    this.drawCatwalkRail(layout);
    this.drawGroundLine(layout);
    this.addStations(config, layout);
    this.addChutes(config, layout);
    this.addAgents(config, layout);
    this.addOrchestrator(config, layout);
    this.addGates(config, layout);
    this.addArtifacts(config, layout);
    this.addDividers(config, layout);
  }

  /** Draws the horizontal gold rail along the catwalk where the orchestrator travels. */
  private drawCatwalkRail(layout: CatwalkLayoutResult): void {
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

  /** Draws the horizontal ground line beneath the agent stations. */
  private drawGroundLine(layout: CatwalkLayoutResult): void {
    const { x1, x2, y } = layout.groundEndpoints();
    const width = x2 - x1;
    const midX = (x1 + x2) / 2;

    const ground = new Actor({ pos: vec(midX, y) });
    ground.graphics.use(
      new Rectangle({
        width,
        height: GROUND_LINE_HEIGHT,
        color: Color.fromHex(GROUND_LINE_COLOR),
      }),
    );
    this.add(ground);
  }

  /** Places a labeled station marker below the ground line for each workflow phase. */
  private addStations(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    for (const [i, station] of config.stations.entries()) {
      const pos = layout.stationLabelPosition(i);
      const stationActor = new CatwalkStationActor(
        { phase: station.label, color: station.color, absent: station.absent },
        vec(pos.x, pos.y),
      );
      this.add(stationActor);
    }
  }

  /** Adds vertical chute lines connecting the catwalk rail to each agent position. */
  private addChutes(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    const agentCountByStation = buildAgentCountByStation(config);

    for (const agent of config.agents) {
      const agentCountAtStation = agentCountByStation.get(agent.stationIndex) ?? 1;
      const endpoints = layout.chuteEndpoints(agent.stationIndex, agent.slotIndex, agentCountAtStation);
      const station = config.stations[agent.stationIndex];
      const dimmed = station?.absent === true;
      this.add(new ChuteActor({ dimmed }, endpoints));
    }
  }

  /** Places agent actors at their computed station positions with role-based colors. Populates agentRefs registry. */
  private addAgents(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
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

  /** Places the orchestrator actor on the catwalk rail at the current phase station. Populates orchestratorRef registry. */
  private addOrchestrator(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    if (config.orchestrator.stationIndex < 0) return;

    const pos = layout.orchestratorPosition(config.orchestrator.stationIndex);
    const orchestratorActor = new OrchestratorActor(
      { working: config.orchestrator.working, waiting: config.orchestrator.waiting },
      vec(pos.x, pos.y),
    );
    orchestratorActor.setCarriedArtifacts(config.orchestrator.carriedArtifacts);
    orchestratorActor.setCodeBadge(config.orchestrator.codeBadge);

    // Trigger celebration immediately if initial state is celebrating
    if (config.orchestrator.celebrating) {
      orchestratorActor.celebrate();
    }

    this.add(orchestratorActor);
    this.orchestratorRef = orchestratorActor;
  }

  /** Places gate actors between adjacent stations to indicate phase transition progress. Populates gateRefs registry. */
  private addGates(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    for (const gate of config.gates) {
      const [left, right] = gate.betweenStations;
      const pos = layout.gatePosition(left, right);
      const gateActor = new GateActor({ open: gate.open }, vec(pos.x, pos.y));
      this.add(gateActor);
      this.gateRefs.set(`${left}:${right}`, gateActor);
    }
  }

  /** Stacks artifact actors using layout position functions. Populates artifactKeySet and artifactCountByKey registries. */
  private addArtifacts(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    const agentCountByStation = buildAgentCountByStation(config);

    for (const artifact of config.artifacts) {
      const key = artifactKey(artifact);
      this.artifactKeySet.add(key);

      const agentCount = Math.max(agentCountByStation.get(artifact.stationIndex) ?? 1, 1);
      const countKey =
        artifact.slot === 'input'
          ? `${artifact.stationIndex}:input`
          : `${artifact.stationIndex}:${artifact.agentSlotIndex}`;
      const stackIndex = this.artifactCountByKey.get(countKey) ?? 0;
      this.artifactCountByKey.set(countKey, stackIndex + 1);

      const pos =
        artifact.slot === 'input'
          ? layout.inputArtifactPosition(artifact.stationIndex, agentCount, stackIndex)
          : layout.outputArtifactPosition(artifact.stationIndex, artifact.agentSlotIndex, agentCount, stackIndex);

      const artifactActor = new ArtifactActor({ label: artifact.label, color: artifact.color }, vec(pos.x, pos.y));
      this.add(artifactActor);
    }
  }

  /** Draw thin grey vertical dividers between input and output zones at each station with agents. */
  private addDividers(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    const agentCountByStation = buildAgentCountByStation(config);

    for (const i of config.stations.keys()) {
      const agentCount = agentCountByStation.get(i);
      if (agentCount === undefined || agentCount === 0) continue;

      const divider = layout.dividerPosition(i, agentCount);
      const height = divider.y2 - divider.y1;
      const midY = (divider.y1 + divider.y2) / 2;

      const dividerActor = new Actor({ pos: vec(divider.x, midY) });
      dividerActor.graphics.use(
        new Rectangle({
          width: DIVIDER_WIDTH,
          height,
          color: Color.fromHex(DIVIDER_COLOR),
        }),
      );
      this.add(dividerActor);
    }
  }

  /** Position camera to fit the full platform width, centered horizontally with rail near top. */
  private positionCamera(): void {
    if (this.layout === undefined) return;

    this.camera.zoom = Math.min(1, ENGINE_WIDTH / this.layout.platformWidth);
    this.camera.pos = vec(this.layout.platformWidth / 2, RAIL_Y + ENGINE_HEIGHT / 2 - CAMERA_TOP_MARGIN);
  }
}

/** Build a lookup map of station index to agent count for O(1) per-agent lookups. */
function buildAgentCountByStation(config: CatwalkSceneConfig): Map<number, number> {
  const counts = new Map<number, number>();
  for (const agent of config.agents) {
    counts.set(agent.stationIndex, (counts.get(agent.stationIndex) ?? 0) + 1);
  }
  return counts;
}

/** Build station layout entries from the scene config, computing agent counts per station. */
function buildLayoutEntries(config: CatwalkSceneConfig): StationLayoutEntry[] {
  const agentCountByStation = buildAgentCountByStation(config);
  return config.stations.map((station, index) => ({
    agentCount: agentCountByStation.get(index) ?? 0,
    ...(station.absent && { absent: true }),
  }));
}

/** Detect whether any artifact key present in prevConfig is absent from nextConfig. */
function hasArtifactRegression(prev: CatwalkSceneConfig, next: CatwalkSceneConfig): boolean {
  const nextKeys = new Set(next.artifacts.map(artifactKey));
  return prev.artifacts.some((a) => !nextKeys.has(artifactKey(a)));
}
