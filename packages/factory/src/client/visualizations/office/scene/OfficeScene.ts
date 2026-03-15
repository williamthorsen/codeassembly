import { Actor, Circle, Color, Font, Label, Rectangle, Scene, TextAlign, vec } from 'excalibur';

import { getRoleTypeColor } from '../../../../shared/constants/role-types.js';
import type { LogicalSceneState } from '../../shared/types.js';
import { CANVAS_HEIGHT_PX, CANVAS_WIDTH_PX, TILE_SIZE } from '../constants/dimensions.js';
import { createOfficeLayout } from '../layout/office-layout.js';
import { resolvePositions } from '../layout/position-resolver.js';
import { mapLogicalToOffice } from '../mappers/logical-to-office.js';
import { diffOfficeConfigs } from '../state/office-differ.js';
import type { FacilityLayout, OfficeSceneConfig, Position, ResolvedPositions } from '../types.js';

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const AGENT_RADIUS = 12;
const ORCHESTRATOR_RADIUS = 16;
const ARTIFACT_WIDTH = 24;
const ARTIFACT_HEIGHT = 12;

const ZONE_COLORS: Record<string, string> = {
  prep: '#4A90D9',
  workshop: '#D97B4A',
  governor: '#6B8E23',
};

const ZONE_BORDER_OPACITY = 0.3;
const ZONE_FILL_OPACITY = 0.08;

// ---------------------------------------------------------------------------
// OfficeScene
// ---------------------------------------------------------------------------

/**
 * Excalibur scene that renders the office visualization pipeline:
 * LogicalSceneState -> adapter -> differ -> position resolver -> transition planner -> render.
 * Uses geometric placeholders for all entities.
 */
export class OfficeScene extends Scene {
  private readonly layout: FacilityLayout;
  private prevConfig: OfficeSceneConfig | undefined;

  // Actor registries for incremental updates
  private agentActors = new Map<string, Actor>();
  private artifactActors = new Map<string, Actor>();
  private orchestratorActor: Actor | undefined;

  constructor() {
    super();
    this.layout = createOfficeLayout();
    this.backgroundColor = Color.fromHex('#e8e4e0');
  }

  override onInitialize(): void {
    this.drawZones();
    this.positionCamera();
  }

  /** Apply a new logical scene state, running the full pipeline. */
  updateState(logical: LogicalSceneState): void {
    const nextConfig = mapLogicalToOffice(logical);
    const nextPositions = resolvePositions(nextConfig, this.layout);

    if (this.prevConfig === undefined) {
      this.applyFullState(nextConfig, nextPositions);
    } else {
      const diff = diffOfficeConfigs(this.prevConfig, nextConfig);
      if (diff.hasChanges) {
        // Teleport entities to new positions (no animation in this ticket)
        this.applyFullState(nextConfig, nextPositions);
      }
    }

    this.prevConfig = nextConfig;
  }

  /** Clear all entity actors and rebuild from scratch. */
  private applyFullState(config: OfficeSceneConfig, positions: ResolvedPositions): void {
    this.clearEntities();

    // Place orchestrator
    this.placeOrchestrator(config, positions.orchestrator);

    // Place agents
    for (const agent of config.agents) {
      const pos = positions.agents.get(agent.id);
      if (pos !== undefined) {
        this.placeAgent(agent.id, agent.roleType, pos);
      }
    }

    // Place artifacts
    for (const artifact of config.artifacts) {
      const pos = positions.artifacts.get(artifact.id);
      if (pos !== undefined) {
        this.placeArtifact(artifact.id, artifact.color, pos);
      }
    }
  }

  /** Remove all entity actors from the scene. */
  private clearEntities(): void {
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

  /** Draw zone rectangles as labeled geometric areas. */
  private drawZones(): void {
    for (const zone of this.layout.zones) {
      const x = zone.bounds.col * TILE_SIZE;
      const y = zone.bounds.row * TILE_SIZE;
      const width = zone.bounds.width * TILE_SIZE;
      const height = zone.bounds.height * TILE_SIZE;
      const color = ZONE_COLORS[zone.id] ?? '#888888';

      // Zone fill
      const fill = new Actor({ pos: vec(x + width / 2, y + height / 2) });
      fill.graphics.use(
        new Rectangle({
          width,
          height,
          color: Color.fromHex(color),
        }),
      );
      fill.graphics.opacity = ZONE_FILL_OPACITY;
      this.add(fill);

      // Zone border
      const border = new Actor({ pos: vec(x + width / 2, y + height / 2) });
      border.graphics.use(
        new Rectangle({
          width,
          height,
          color: Color.Transparent,
          strokeColor: Color.fromHex(color),
          lineWidth: 2,
        }),
      );
      border.graphics.opacity = ZONE_BORDER_OPACITY;
      this.add(border);

      // Zone label
      const label = new Label({
        text: zone.label,
        pos: vec(x + width / 2, y + 12),
        font: new Font({
          family: 'monospace',
          size: 10,
          color: Color.fromHex(color),
          textAlign: TextAlign.Center,
        }),
      });
      this.add(label);
    }
  }

  /** Place a colored circle for an agent at the given position. */
  private placeAgent(agentId: string, roleType: string, pos: Position): void {
    const color = getRoleTypeColor(roleType);
    const actor = new Actor({ pos: vec(pos.x, pos.y) });
    actor.graphics.use(
      new Circle({
        radius: AGENT_RADIUS,
        color: Color.fromHex(color),
      }),
    );
    this.add(actor);
    this.agentActors.set(agentId, actor);
  }

  /** Place a larger circle for the orchestrator at the given position. */
  private placeOrchestrator(_config: OfficeSceneConfig, pos: Position): void {
    const actor = new Actor({ pos: vec(pos.x, pos.y) });
    actor.graphics.use(
      new Circle({
        radius: ORCHESTRATOR_RADIUS,
        color: Color.fromHex('#FF55FF'),
      }),
    );
    this.add(actor);
    this.orchestratorActor = actor;
  }

  /** Place a colored rectangle for an artifact at the given position. */
  private placeArtifact(artifactId: string, color: string, pos: Position): void {
    const actor = new Actor({ pos: vec(pos.x, pos.y) });
    actor.graphics.use(
      new Rectangle({
        width: ARTIFACT_WIDTH,
        height: ARTIFACT_HEIGHT,
        color: Color.fromHex(color),
      }),
    );
    this.add(actor);
    this.artifactActors.set(artifactId, actor);
  }

  /** Center the camera on the facility. */
  private positionCamera(): void {
    this.camera.pos = vec(CANVAS_WIDTH_PX / 2, CANVAS_HEIGHT_PX / 2);
  }
}
