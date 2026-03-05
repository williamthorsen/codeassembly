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
import { ART_H, ENGINE_HEIGHT, ENGINE_WIDTH, GROUND_Y } from '../constants/dimensions.js';
import { type CatwalkLayoutResult, computeCatwalkLayout, type StationLayoutEntry } from '../layout/catwalk-layout.js';
import { mapRunToCatwalk } from '../mappers/run-to-catwalk.js';
import type { CatwalkSceneConfig } from '../types.js';

const RAIL_HEIGHT = 3;
const RAIL_OPACITY = 0.6;
const RAIL_COLOR = '#FFD700';

const GROUND_LINE_HEIGHT = 2;
const GROUND_LINE_COLOR = '#444444';

const ARTIFACT_Y_OFFSET = 20;
const ARTIFACT_Y_SPACING = 4;

export class CatwalkScene extends Scene {
  private status: CanonicalRunStatus;
  private layout: CatwalkLayoutResult | undefined;

  constructor(status: CanonicalRunStatus) {
    super();
    this.status = status;
    this.backgroundColor = Color.fromHex('#111111');
  }

  override onInitialize(): void {
    this.buildScene();
    this.fitCamera();
  }

  updateStatus(status: CanonicalRunStatus): void {
    this.status = status;
    this.clear();
    this.buildScene();
    this.fitCamera();
  }

  private buildScene(): void {
    const config = mapRunToCatwalk(this.status);
    const layoutEntries = buildLayoutEntries(config);
    const layout = computeCatwalkLayout({ stations: layoutEntries });
    this.layout = layout;

    this.drawCatwalkRail(layout);
    this.drawGroundLine(layout);
    this.addStations(config, layout);
    this.addChutes(config, layout);
    this.addAgents(config, layout);
    this.addOrchestrator(config, layout);
    this.addGates(config, layout);
    this.addArtifacts(config, layout);
  }

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
    }
  }

  private addOrchestrator(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    if (config.orchestrator.stationIndex < 0) return;

    const pos = layout.orchestratorPosition(config.orchestrator.stationIndex);
    const orchestratorActor = new OrchestratorActor(
      { working: config.orchestrator.working },
      vec(pos.x, pos.y),
    );
    this.add(orchestratorActor);
  }

  private addGates(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    for (const gate of config.gates) {
      const [left, right] = gate.betweenStations;
      const pos = layout.gatePosition(left, right);
      const gateActor = new GateActor({ open: gate.open }, vec(pos.x, pos.y));
      this.add(gateActor);
    }
  }

  private addArtifacts(config: CatwalkSceneConfig, layout: CatwalkLayoutResult): void {
    // Group artifacts by station for vertical stacking
    const byStation = new Map<number, number>();

    for (const artifact of config.artifacts) {
      const indexAtStation = byStation.get(artifact.stationIndex) ?? 0;
      byStation.set(artifact.stationIndex, indexAtStation + 1);

      const stationX = layout.stationX(artifact.stationIndex);
      const groundEndpoints = layout.groundEndpoints();
      const y = groundEndpoints.y + ARTIFACT_Y_OFFSET + indexAtStation * (ART_H + ARTIFACT_Y_SPACING);

      const artifactActor = new ArtifactActor(
        { label: artifact.label, color: artifact.color },
        vec(stationX, y),
      );
      this.add(artifactActor);
    }
  }

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
  return config.stations.map((station, index) => {
    const agentCount = config.agents.filter((a) => a.stationIndex === index).length;
    return {
      agentCount,
      ...(station.absent ? { absent: true } : {}),
    };
  });
}
