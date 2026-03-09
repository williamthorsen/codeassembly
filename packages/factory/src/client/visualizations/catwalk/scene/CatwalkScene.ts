import { Actor, Color, Rectangle, Scene, vec } from 'excalibur';

import { ROLE_TYPE_COLORS } from '../../../../shared/constants/role-types.js';
import type { CanonicalRunStatus } from '../../../../shared/types/canonical.js';
import {
  ArtifactActor,
  CatwalkStationActor,
  ChuteActor,
  GateActor,
  OrchestratorActor,
  StationAgentActor,
} from '../actors/index.js';
import { choreograph, type SceneRefs } from '../choreography/chute-choreographer.js';
import { ART_H, ENGINE_HEIGHT, ENGINE_WIDTH, GROUND_Y } from '../constants/dimensions.js';
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

const ARTIFACT_Y_OFFSET = 20;
const ARTIFACT_Y_SPACING = 4;

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
  private artifactCountByStation = new Map<number, number>();

  // Choreography guard -- prevents overlapping animations
  private choreographyInProgress = false;
  private pendingDiff: { diff: CatwalkDiff; config: CatwalkSceneConfig; layout: CatwalkLayoutResult } | undefined;

  constructor(status: CanonicalRunStatus) {
    super();
    this.status = status;
    this.backgroundColor = Color.fromHex('#1a1a2e');
  }

  override onInitialize(): void {
    // loadAllCatwalkSprites populates the animation cache synchronously,
    // so buildScene can safely call getAnimation() immediately.
    // The returned promise resolves once image data finishes loading.
    loadAllCatwalkSprites().catch((error: unknown) => {
      console.error('Failed to load catwalk sprites:', error);
    });
    this.buildScene();
    this.fitCamera();
  }

  /** Apply diff-driven animations on subsequent calls; full rebuild on the first call. */
  updateStatus(status: CanonicalRunStatus): void {
    this.status = status;
    const nextConfig = mapRunToCatwalk(status);

    if (this.prevConfig === undefined) {
      this.clear();
      this.buildScene();
      this.fitCamera();
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

  /** Dispatch animations to actors via the choreographer. Buffers if a choreography is in progress. */
  private applyDiff(diff: CatwalkDiff, config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    if (this.choreographyInProgress) {
      // Buffer the latest diff; when the current choreography finishes, it will be applied.
      // Known limitation: only the most recent pending diff is kept. If multiple diffs arrive
      // during one choreography, intermediate diffs are dropped. This is acceptable because
      // the final config always reflects ground truth, and the next diff will reconcile
      // the scene to the correct state.
      this.pendingDiff = { diff, config, layout };
      return;
    }

    // Guard: fade out orchestrator when moving to a negative (sentinel) station index
    if (diff.orchestrator.moved !== null && diff.orchestrator.moved.to < 0 && this.orchestratorRef !== undefined) {
      this.orchestratorRef.fadeOut();
      this.orchestratorRef = undefined;
    }

    // Added agents are always handled by the scene directly (not by the choreographer)
    // because they require constructing actors with scene-specific config
    this.addDiffAgents(diff, config, layout);

    const refs = this.buildSceneRefs();
    this.choreographyInProgress = true;

    choreograph(diff, layout, refs)
      .then(() => {
        this.choreographyInProgress = false;
        this.fitCamera();

        // If another diff arrived while we were animating, apply it now
        if (this.pendingDiff !== undefined) {
          const pending = this.pendingDiff;
          this.pendingDiff = undefined;
          this.applyDiff(pending.diff, pending.config, pending.layout);
        }
        return;
      })
      .catch((error: unknown) => {
        console.error('Choreography error:', error);
        this.choreographyInProgress = false;

        // Apply any buffered diff so the scene does not get stuck
        if (this.pendingDiff !== undefined) {
          const pending = this.pendingDiff;
          this.pendingDiff = undefined;
          this.applyDiff(pending.diff, pending.config, pending.layout);
        }
      });
  }

  /** Build the SceneRefs object that the choreographer needs. */
  private buildSceneRefs(): SceneRefs {
    return {
      orchestrator: this.orchestratorRef,
      agents: this.agentRefs,
      gates: this.gateRefs,
      addActor: (actor: Actor) => {
        this.add(actor);
      },
      addArtifact: (artifact: StationArtifactConfig, layout: CatwalkLayoutResult) => {
        this.addSingleArtifact(artifact, layout);
      },
    };
  }

  /** Add newly appearing agents from a diff (fade in from invisible). */
  private addDiffAgents(diff: CatwalkDiff, config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    const agentCountByStation = buildAgentCountByStation(config);
    for (const agent of diff.agents.added) {
      const agentCountAtStation = agentCountByStation.get(agent.stationIndex) ?? 1;
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

  /** Add a single artifact actor at its stacked position below the ground line. */
  private addSingleArtifact(artifact: StationArtifactConfig, layout: CatwalkLayoutResult): void {
    const key = artifactKey(artifact);
    if (this.artifactKeySet.has(key)) return;
    this.artifactKeySet.add(key);

    const indexAtStation = this.artifactCountByStation.get(artifact.stationIndex) ?? 0;
    this.artifactCountByStation.set(artifact.stationIndex, indexAtStation + 1);

    const stationX = layout.stationX(artifact.stationIndex);
    const groundEndpoints = layout.groundEndpoints();
    const y = groundEndpoints.y + ARTIFACT_Y_OFFSET + indexAtStation * (ART_H + ARTIFACT_Y_SPACING);

    const actor = new ArtifactActor({ label: artifact.label, color: artifact.color }, vec(stationX, y));
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

    this.drawCatwalkRail(layout);
    this.drawGroundLine(layout);
    this.addStations(config, layout);
    this.addChutes(config, layout);
    this.addAgents(config, layout);
    this.addOrchestrator(config, layout);
    this.addGates(config, layout);
    this.addArtifacts(config, layout);
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
      const x = layout.stationX(i);
      const stationActor = new CatwalkStationActor(
        { phase: station.label, color: station.color, absent: station.absent },
        vec(x, GROUND_Y + 60),
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

  /** Places agent actors at their computed station positions with role-based colors.
   *  Populates agentRefs registry. */
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

  /** Places the orchestrator actor on the catwalk rail at the current phase station.
   *  Populates orchestratorRef registry. */
  private addOrchestrator(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    if (config.orchestrator.stationIndex < 0) return;

    const pos = layout.orchestratorPosition(config.orchestrator.stationIndex);
    const orchestratorActor = new OrchestratorActor({ working: config.orchestrator.working }, vec(pos.x, pos.y));
    orchestratorActor.setCarriedArtifacts(config.orchestrator.carriedArtifacts);
    orchestratorActor.setCodeBadge(config.orchestrator.codeBadge);
    this.add(orchestratorActor);
    this.orchestratorRef = orchestratorActor;
  }

  /** Places gate actors between adjacent stations to indicate phase transition progress.
   *  Populates gateRefs registry. */
  private addGates(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    for (const gate of config.gates) {
      const [left, right] = gate.betweenStations;
      const pos = layout.gatePosition(left, right);
      const gateActor = new GateActor({ open: gate.open }, vec(pos.x, pos.y));
      this.add(gateActor);
      this.gateRefs.set(`${left}:${right}`, gateActor);
    }
  }

  /** Stacks artifact actors vertically below the ground line at their producing station.
   *  Populates artifactKeySet and artifactCountByStation registries. */
  private addArtifacts(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    for (const artifact of config.artifacts) {
      const key = artifactKey(artifact);
      this.artifactKeySet.add(key);

      const indexAtStation = this.artifactCountByStation.get(artifact.stationIndex) ?? 0;
      this.artifactCountByStation.set(artifact.stationIndex, indexAtStation + 1);

      const stationX = layout.stationX(artifact.stationIndex);
      const groundEndpoints = layout.groundEndpoints();
      const y = groundEndpoints.y + ARTIFACT_Y_OFFSET + indexAtStation * (ART_H + ARTIFACT_Y_SPACING);

      const artifactActor = new ArtifactActor({ label: artifact.label, color: artifact.color }, vec(stationX, y));
      this.add(artifactActor);
    }
  }

  /** Adjusts the camera zoom and position so the entire scene content fits within the viewport. */
  private fitCamera(): void {
    if (this.layout === undefined) return;

    const { minX, maxX, minY, maxY } = this.layout.bounds;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const zoomX = ENGINE_WIDTH / contentWidth;
    const zoomY = ENGINE_HEIGHT / contentHeight;

    this.camera.zoom = Math.min(zoomX, zoomY, 1);
    this.camera.pos = vec((minX + maxX) / 2, (minY + maxY) / 2);
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
    ...(station.absent ? { absent: true } : {}),
  }));
}
