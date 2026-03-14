import { Actor, Circle, Color, Font, GraphicsGroup, Rectangle, Scene, Text, TextAlign, vec } from 'excalibur';

import { ROLE_TYPE_COLORS } from '../../../../shared/constants/role-types.js';
import type { CanonicalRunStatus } from '../../../../shared/types/canonical.js';
import { planTransitions } from '../choreography/transition-planner.js';
import {
  ENGINE_HEIGHT,
  ENGINE_WIDTH,
  FLOOR_COLOR,
  LABEL_COLOR,
  TILE_SIZE,
  WALL_COLOR,
} from '../constants/dimensions.js';
import { createFacilityLayout } from '../layout/facility-layout.js';
import { resolvePositions } from '../layout/position-resolver.js';
import { ALL_ROOMS } from '../layout/room-definitions.js';
import { mapRunToTilemap } from '../mappers/run-to-tilemap.js';
import { diffTilemapConfigs } from '../state/tilemap-differ.js';
import type {
  FacilityLayout,
  ResolvedPositions,
  RoomDefinition,
  TilemapAgentState,
  TilemapArtifactState,
  TilemapSceneConfig,
} from '../types.js';

const WALL_THICKNESS = 2;
const AGENT_RADIUS = 10;
const ORCHESTRATOR_RADIUS = 12;
const ARTIFACT_SIZE = 8;

// ---------------------------------------------------------------------------
// Agent status → color mapping
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  idle: '#888899',
  working: '#44cc44',
  done: '#4488cc',
  blocked: '#cc8844',
  concerned: '#cc4444',
};

/**
 * Tilemap scene that renders the facility with placeholder visuals and
 * responds to run status updates through the 4-layer pipeline:
 *   state mapper → position resolver → differ → transition planner
 */
export class TilemapScene extends Scene {
  private layout!: FacilityLayout;
  private prevConfig: TilemapSceneConfig | undefined;
  private prevPositions: ResolvedPositions | undefined;

  // Actor registries for updating positions
  private agentActors = new Map<string, Actor>();
  private artifactActors = new Map<string, Actor>();
  private orchestratorActor: Actor | undefined;

  constructor() {
    super();
    this.backgroundColor = Color.fromHex(FLOOR_COLOR);
  }

  override onInitialize(): void {
    this.layout = createFacilityLayout();
    this.buildFacility();
    this.positionCamera();
  }

  /** Apply a new run status, running the full pipeline. */
  updateStatus(status: CanonicalRunStatus): void {
    const config = mapRunToTilemap(status);
    const positions = resolvePositions(config, this.layout);

    if (this.prevConfig === undefined) {
      this.applyFullState(config, positions);
    } else {
      const diff = diffTilemapConfigs(this.prevConfig, config);
      if (diff.hasChanges) {
        // Plan transitions (logged for debugging, not animated yet)
        planTransitions(diff, this.prevPositions!, positions, this.layout);
        // For now, snap to new state
        this.applyFullState(config, positions);
      }
    }

    this.prevConfig = config;
    this.prevPositions = positions;
  }

  // ---------------------------------------------------------------------------
  // Full state application (placeholder rendering)
  // ---------------------------------------------------------------------------

  /** Render all agents, artifacts, and orchestrator at their resolved positions. */
  private applyFullState(config: TilemapSceneConfig, positions: ResolvedPositions): void {
    // Clear previous dynamic actors
    this.clearDynamicActors();

    // Orchestrator
    this.orchestratorActor = this.createOrchestratorActor(
      positions.orchestrator.x,
      positions.orchestrator.y,
      config.orchestrator.status,
    );
    this.add(this.orchestratorActor);

    // Agents
    for (const agent of config.agents) {
      const pos = positions.agents.find((p) => p.entityId === agent.id);
      if (pos === undefined) continue;

      const actor = this.createAgentActor(agent, pos.x, pos.y);
      this.agentActors.set(agent.id, actor);
      this.add(actor);
    }

    // Artifacts
    for (const artifact of config.artifacts) {
      const pos = positions.artifacts.find((p) => p.entityId === artifact.id);
      if (pos === undefined) continue;

      const actor = this.createArtifactActor(artifact, pos.x, pos.y);
      this.artifactActors.set(artifact.id, actor);
      this.add(actor);
    }
  }

  /** Remove all dynamic actors (agents, artifacts, orchestrator). */
  private clearDynamicActors(): void {
    if (this.orchestratorActor !== undefined) {
      this.remove(this.orchestratorActor);
      this.orchestratorActor = undefined;
    }
    for (const actor of this.agentActors.values()) {
      this.remove(actor);
    }
    this.agentActors.clear();
    for (const actor of this.artifactActors.values()) {
      this.remove(actor);
    }
    this.artifactActors.clear();
  }

  // ---------------------------------------------------------------------------
  // Actor factories
  // ---------------------------------------------------------------------------

  private createOrchestratorActor(x: number, y: number, status: string): Actor {
    const color = status === 'done' ? '#4488cc' : '#ff55ff';
    const actor = new Actor({ pos: vec(x, y) });
    actor.graphics.use(new Circle({ radius: ORCHESTRATOR_RADIUS, color: Color.fromHex(color) }));
    actor.z = 10;
    return actor;
  }

  private createAgentActor(agent: TilemapAgentState, x: number, y: number): Actor {
    const roleColor = ROLE_TYPE_COLORS[agent.roleType] ?? '#888899';
    const borderColor = STATUS_COLORS[agent.status] ?? '#888899';

    const actor = new Actor({ pos: vec(x, y) });

    const group = new GraphicsGroup({
      members: [
        { graphic: new Circle({ radius: AGENT_RADIUS, color: Color.fromHex(borderColor) }), offset: vec(0, 0) },
        { graphic: new Circle({ radius: AGENT_RADIUS - 3, color: Color.fromHex(roleColor) }), offset: vec(0, 0) },
      ],
    });
    actor.graphics.use(group);

    actor.z = 10;
    return actor;
  }

  private createArtifactActor(artifact: TilemapArtifactState, x: number, y: number): Actor {
    const actor = new Actor({ pos: vec(x, y) });
    actor.graphics.use(
      new Rectangle({
        width: ARTIFACT_SIZE,
        height: ARTIFACT_SIZE,
        color: Color.fromHex(artifact.color),
      }),
    );
    actor.z = 8;
    return actor;
  }

  // ---------------------------------------------------------------------------
  // Facility rendering (static rooms)
  // ---------------------------------------------------------------------------

  /** Render the full placeholder facility using the new room definitions. */
  private buildFacility(): void {
    for (const room of ALL_ROOMS) {
      this.addRoom(room);
      this.addRoomLabel(room);
    }
  }

  /** Draw a filled rectangle for a room and an outline for its walls. */
  private addRoom(room: RoomDefinition): void {
    const x = room.bounds.x * TILE_SIZE;
    const y = room.bounds.y * TILE_SIZE;
    const w = room.bounds.w * TILE_SIZE;
    const h = room.bounds.h * TILE_SIZE;

    // Room floor fill
    const roomColor = this.roomColor(room.id);
    const floor = new Actor({ pos: vec(x + w / 2, y + h / 2) });
    floor.graphics.use(new Rectangle({ width: w, height: h, color: Color.fromHex(roomColor) }));
    this.add(floor);

    // Wall outlines
    this.addWallSegment(x, y, w, WALL_THICKNESS);
    this.addWallSegment(x, y + h - WALL_THICKNESS, w, WALL_THICKNESS);
    this.addWallSegment(x, y, WALL_THICKNESS, h);
    this.addWallSegment(x + w - WALL_THICKNESS, y, WALL_THICKNESS, h);
  }

  /** Room-specific floor colors. */
  private roomColor(roomId: string): string {
    const colors: Record<string, string> = {
      analysis: '#3e3a5a',
      control: '#3a3a5e',
      workshop: '#3a4a5e',
      'review-bay': '#4a3a5e',
      delivery: '#3a3a4e',
    };
    return colors[roomId] ?? '#2a2a3e';
  }

  /** Draw a thin wall segment at the given pixel position and size. */
  private addWallSegment(x: number, y: number, w: number, h: number): void {
    const wall = new Actor({ pos: vec(x + w / 2, y + h / 2) });
    wall.graphics.use(new Rectangle({ width: w, height: h, color: Color.fromHex(WALL_COLOR) }));
    wall.z = 1;
    this.add(wall);
  }

  /** Add a centered text label inside a room. */
  private addRoomLabel(room: RoomDefinition): void {
    const centerX = (room.bounds.x + room.bounds.w / 2) * TILE_SIZE;
    const centerY = (room.bounds.y + room.bounds.h / 2) * TILE_SIZE;

    const labelActor = new Actor({ pos: vec(centerX, centerY) });
    labelActor.graphics.use(
      new Text({
        text: room.label,
        font: new Font({
          family: 'monospace',
          size: 11,
          bold: true,
          color: Color.fromHex(LABEL_COLOR),
          textAlign: TextAlign.Center,
        }),
      }),
    );
    labelActor.z = 3;
    this.add(labelActor);
  }

  /** Center the camera on the facility. */
  private positionCamera(): void {
    this.camera.pos = vec(ENGINE_WIDTH / 2, ENGINE_HEIGHT / 2);
    this.camera.zoom = 1;
  }
}
