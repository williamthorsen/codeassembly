import { Actor, Color, Scene, vec } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';
import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { AgentActor } from '../actors/AgentActor.js';
import { ArtifactActor } from '../actors/ArtifactActor.js';
import { GateActor } from '../actors/GateActor.js';
import { StationActor } from '../actors/StationActor.js';
import { createSceneConfig } from '../mappers/run-to-scene.js';

const STATION_SPACING = 150;
const START_X = 200;

export class FactoryScene extends Scene {
  private status: CanonicalRunStatus;

  constructor(status: CanonicalRunStatus) {
    super();
    this.status = status;
    this.backgroundColor = Color.fromHex(PALETTE.black);
  }

  override onInitialize(): void {
    this.buildScene();
  }

  updateStatus(status: CanonicalRunStatus): void {
    this.status = status;
    this.clear();
    this.buildScene();
  }

  private buildScene() {
    const config = createSceneConfig(this.status);

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

    config.agents.forEach((agent) => {
      const agentActor = new AgentActor(agent.role, vec(START_X + agent.stationIndex * STATION_SPACING, 320));
      this.add(agentActor);
    });

    config.artifacts.forEach((artifact) => {
      const artifactActor = new ArtifactActor(
        artifact.type,
        vec(START_X + artifact.stationIndex * STATION_SPACING + 30, 340),
      );
      this.add(artifactActor);
    });
  }
}
