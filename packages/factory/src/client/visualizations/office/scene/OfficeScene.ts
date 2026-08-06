import { Actor, Canvas, Color, type ImageSource, Rectangle, Scene, vec } from 'excalibur';

import type { CanonicalRunStatus } from '../../../../shared/types/canonical.js';
import { loadSceneSprites } from '../../shared/load-scene-sprites.js';
import { mapRunToLogicalScene } from '../../shared/run-to-logical-scene.js';
import type { LogicalSceneState } from '../../shared/types.js';
import { CANVAS_HEIGHT_PX, CANVAS_WIDTH_PX, TILE_SIZE } from '../constants/dimensions.js';
import { GOVERNOR_ZONE, PREP_ZONE, WORKSHOP_ZONE } from '../constants/zone-definitions.js';
import { createOfficeLayout } from '../layout/office-layout.js';
import { resolvePositions } from '../layout/position-resolver.js';
import { mapLogicalToOffice } from '../mappers/logical-to-office.js';
import {
  getCharacterSprite,
  getFloorImageSource,
  getOfficeImageSource,
  getShadowImageSource,
  getSingleSprite,
  getWallImageSource,
  loadOfficeSprites,
} from '../sprites/office-sprite-loader.js';
import { DIR_DOWN, DIR_UP, FURNITURE_MANIFEST, resolveCharacterName } from '../sprites/sprite-definitions.js';
import { diffOfficeConfigs } from '../state/office-differ.js';
import type { AnimationHandle } from '../transitions/transition-executor.js';
import { executeTransitions } from '../transitions/transition-executor.js';
import { planTransitions } from '../transitions/transition-planner.js';
import type {
  EntityKind,
  FacilityLayout,
  OfficeDiff,
  OfficeSceneConfig,
  Position,
  ResolvedPositions,
} from '../types.js';

// -- Visual constants --

const ARTIFACT_WIDTH = 24;
const ARTIFACT_HEIGHT = 12;
const SIDE_WALL_COLOR = '#b0a898';

// Tile source pixel coordinates in sprite sheets
const FLOOR_TILE_SX = 96; // col 3 * 32
const FLOOR_TILE_SY = 0; // row 0 * 32
const GRAY_TILE_SX = 288; // col 9 * 32
const GRAY_TILE_SY = 0; // row 0 * 32
const WALL_UPPER_SX = 32; // col 1 * 32
const WALL_UPPER_SY = 256; // row 8 * 32
const WALL_BASE_SX = 32; // col 1 * 32
const WALL_BASE_SY = 288; // row 9 * 32
const SHADOW_SX = 0; // col 0 * 32
const SHADOW_SY = 0; // row 0 * 32

// -- OfficeScene --

/**
 * Excalibur scene that renders the office visualization with LimeZu tileset sprites.
 * Pipeline: CanonicalRunStatus -> LogicalSceneState -> adapter -> differ -> position resolver -> render.
 */
export class OfficeScene extends Scene {
  private readonly layout: FacilityLayout;
  private status: CanonicalRunStatus;
  private prevConfig: OfficeSceneConfig | undefined;
  private prevPositions: ResolvedPositions | undefined;
  private activeAnimation: AnimationHandle | undefined;

  // Actor registries for incremental updates
  private agentActors = new Map<string, Actor>();
  private artifactActors = new Map<string, Actor>();
  private orchestratorActor: Actor | undefined;

  constructor(status: CanonicalRunStatus) {
    super();
    this.status = status;
    this.layout = createOfficeLayout();
    this.backgroundColor = Color.fromHex('#e8e4e0');
  }

  override onInitialize(): void {
    // If sprite loading fails the scene will render with fallback/empty graphics.
    // This is intentional silent degradation — the office remains interactive but visually broken.
    // TODO(#333): consider aborting initialization or retrying on sprite-load failure.
    void loadSceneSprites(loadOfficeSprites, '[OfficeScene] Failed to load sprites:');

    this.drawBackground();
    this.placeFurniture();
    this.updateStatus(this.status);
    this.positionCamera();
  }

  /** Apply a new run status, running the full visualization pipeline. */
  updateStatus(status: CanonicalRunStatus): void {
    this.status = status;
    this.updateState(mapRunToLogicalScene(status));
  }

  /** Apply a new logical scene state, running the spatial pipeline. */
  private updateState(logical: LogicalSceneState): void {
    try {
      const nextConfig = mapLogicalToOffice(logical);
      const nextPositions = resolvePositions(nextConfig, this.layout);

      if (this.prevConfig === undefined || this.prevPositions === undefined) {
        this.applyFullState(nextConfig, nextPositions);
      } else {
        const diff = diffOfficeConfigs(this.prevConfig, nextConfig);
        if (diff.hasChanges) {
          if (hasStructuralChanges(diff)) {
            // Structural changes (moves, adds, removes) require cancelling
            // in-progress walks and snapping entities to their intended targets
            // so interrupted walks don't strand them at intermediate positions.
            this.activeAnimation?.cancel();
            this.activeAnimation = undefined;
            this.snapToPositions(this.prevPositions);
          }
          // Non-structural changes (status, carried, badge) are additive:
          // new transitions queue behind any in-progress walk on the actor's
          // action list, so the walk continues to completion.
          const plan = planTransitions(diff, this.prevPositions, nextPositions, this.layout);
          this.activeAnimation = executeTransitions(plan, this.buildTransitionContext(nextConfig, nextPositions));
        }
      }

      this.prevConfig = nextConfig;
      this.prevPositions = nextPositions;
    } catch (error) {
      // Intentional silent degradation: the scene freezes at its last good state.
      // prevConfig is NOT updated on failure, so the next call will re-attempt a full render.
      console.error('[OfficeScene] updateState failed:', error);
    }
  }

  /** Clear all entity actors and rebuild from scratch. */
  private applyFullState(config: OfficeSceneConfig, positions: ResolvedPositions): void {
    this.clearEntities();

    // Place orchestrator
    this.placeOrchestrator(positions.orchestrator);

    // Place agents
    for (const agent of config.agents) {
      const pos = positions.agents.get(agent.id);
      if (pos !== undefined) {
        this.placeAgent(agent.id, agent.phase, pos);
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

  /**
   * Snap all entity actors to their resolved target positions.
   * Call after cancelling animations to prevent interrupted walks
   * from stranding entities at intermediate corridor positions.
   */
  private snapToPositions(positions: ResolvedPositions): void {
    if (this.orchestratorActor !== undefined) {
      this.orchestratorActor.pos.x = positions.orchestrator.x;
      this.orchestratorActor.pos.y = positions.orchestrator.y;
    }

    for (const [id, pos] of positions.agents) {
      const actor = this.agentActors.get(id);
      if (actor !== undefined) {
        actor.pos.x = pos.x;
        actor.pos.y = pos.y;
      }
    }

    for (const [id, pos] of positions.artifacts) {
      const actor = this.artifactActors.get(id);
      if (actor !== undefined) {
        actor.pos.x = pos.x;
        actor.pos.y = pos.y;
      }
    }
  }

  /** Draw the tiled background onto a single Canvas graphic actor. */
  private drawBackground(): void {
    const floorImage = getFloorImageSource();
    const wallImage = getWallImageSource();
    const shadowImage = getShadowImageSource();

    const bgCanvas = new Canvas({
      width: CANVAS_WIDTH_PX,
      height: CANVAS_HEIGHT_PX,
      draw: (ctx) => {
        drawFloors(ctx, floorImage);
        drawTransitionStrip(ctx, floorImage);
        drawNorthWalls(ctx, wallImage);
        drawFloorShadows(ctx, shadowImage);
        drawSideWalls(ctx);
        drawZoneBoundaryWall(ctx);
      },
    });

    const bgActor = new Actor({ pos: vec(0, 0), anchor: vec(0, 0), z: 0 });
    bgActor.graphics.use(bgCanvas);
    this.add(bgActor);
  }

  /** Place static furniture actors from the manifest. */
  private placeFurniture(): void {
    for (const item of FURNITURE_MANIFEST) {
      const actor = new Actor({
        pos: vec(item.tx * TILE_SIZE, item.ty * TILE_SIZE),
        anchor: vec(0, 0),
        z: 1,
      });

      if (item.asset !== undefined) {
        actor.graphics.use(getSingleSprite(item.asset));
      } else if (item.region !== undefined) {
        const region = item.region;
        const officeImage = getOfficeImageSource();
        const regionCanvas = new Canvas({
          width: region.sw,
          height: region.sh,
          draw: (ctx) => {
            ctx.drawImage(officeImage.image, region.sx, region.sy, region.sw, region.sh, 0, 0, region.sw, region.sh);
          },
        });
        actor.graphics.use(regionCanvas);
      }

      this.add(actor);
    }
  }

  /** Place a character sprite for an agent at the given position. */
  private placeAgent(agentId: string, phase: string, pos: Position): Actor {
    const characterName = resolveCharacterName(phase, agentId);
    const sprite = getCharacterSprite(characterName, DIR_UP);
    const actor = new Actor({ pos: vec(pos.x, pos.y), anchor: vec(0.5, 1), z: 2 });
    actor.graphics.use(sprite);
    this.add(actor);
    this.agentActors.set(agentId, actor);
    return actor;
  }

  /** Place the orchestrator (Adam) sprite facing the camera. */
  private placeOrchestrator(pos: Position): Actor {
    const sprite = getCharacterSprite('Adam', DIR_DOWN);
    const actor = new Actor({ pos: vec(pos.x, pos.y), anchor: vec(0.5, 1), z: 2 });
    actor.graphics.use(sprite);
    this.add(actor);
    this.orchestratorActor = actor;
    return actor;
  }

  /** Place a colored rectangle for an artifact at the given position. */
  private placeArtifact(artifactId: string, color: string, pos: Position): Actor {
    const actor = new Actor({ pos: vec(pos.x, pos.y), z: 3 });
    actor.graphics.use(
      new Rectangle({
        width: ARTIFACT_WIDTH,
        height: ARTIFACT_HEIGHT,
        color: Color.fromHex(color),
      }),
    );
    this.add(actor);
    this.artifactActors.set(artifactId, actor);
    return actor;
  }

  /** Look up an actor by entity ID and kind from the registries. */
  private findActor(entityId: string, entityKind: EntityKind): Actor | undefined {
    switch (entityKind) {
      case 'orchestrator':
        return this.orchestratorActor;
      case 'agent':
        return this.agentActors.get(entityId);
      case 'artifact':
        return this.artifactActors.get(entityId);
    }
  }

  /** Remove an entity's actor from the scene and registries. */
  private removeEntityActor(entityId: string, entityKind: EntityKind): void {
    switch (entityKind) {
      case 'orchestrator':
        if (this.orchestratorActor !== undefined) {
          this.remove(this.orchestratorActor);
          this.orchestratorActor = undefined;
        }
        break;
      case 'agent': {
        const actor = this.agentActors.get(entityId);
        if (actor !== undefined) {
          this.remove(actor);
          this.agentActors.delete(entityId);
        }
        break;
      }
      case 'artifact': {
        const actor = this.artifactActors.get(entityId);
        if (actor !== undefined) {
          this.remove(actor);
          this.artifactActors.delete(entityId);
        }
        break;
      }
    }
  }

  /** Update the sprite direction for an entity's actor using the given config snapshot. */
  private updateEntitySprite(
    actor: Actor,
    entityId: string,
    entityKind: EntityKind,
    direction: number,
    config: OfficeSceneConfig,
  ): void {
    if (entityKind === 'orchestrator') {
      actor.graphics.use(getCharacterSprite('Adam', direction));
    } else if (entityKind === 'agent') {
      const agentState = config.agents.find((a) => a.id === entityId);
      const phase = agentState?.phase ?? 'implementation';
      const characterName = resolveCharacterName(phase, entityId);
      actor.graphics.use(getCharacterSprite(characterName, direction));
    }
    // Artifacts have no directional sprites
  }

  /** Build a TransitionContext that bridges the executor to scene internals. */
  private buildTransitionContext(
    nextConfig: OfficeSceneConfig,
    nextPositions: ResolvedPositions,
  ): import('../transitions/transition-executor.js').TransitionContext {
    return {
      findActor: (entityId, entityKind) => this.findActor(entityId, entityKind),
      createAgent: (agentId, pos, phase) => this.placeAgent(agentId, phase, pos),
      createArtifact: (artifactId, pos, color) => this.placeArtifact(artifactId, color, pos),
      createOrchestrator: (pos) => this.placeOrchestrator(pos),
      removeActor: (entityId, entityKind) => this.removeEntityActor(entityId, entityKind),
      updateSprite: (actor, entityId, entityKind, direction) =>
        this.updateEntitySprite(actor, entityId, entityKind, direction, nextConfig),
      config: nextConfig,
      nextPositions,
      layout: this.layout,
    };
  }

  /** Center the camera on the facility. */
  private positionCamera(): void {
    this.camera.pos = vec(CANVAS_WIDTH_PX / 2, CANVAS_HEIGHT_PX / 2);
  }
}

// -- Diff classification --

/**
 * Check whether a diff contains structural changes that affect entity
 * positions or lifecycle (moves, additions, removals). Non-structural
 * changes (status, carried artifacts, badges, zone activity) are additive
 * and do not require cancelling in-progress walk animations.
 */
function hasStructuralChanges(diff: OfficeDiff): boolean {
  if (diff.orchestrator.moved !== null) return true;
  if (diff.agents.some((a) => a.moved !== null)) return true;
  if (diff.artifacts.added.length > 0 || diff.artifacts.removed.length > 0) return true;
  return false;
}

// region | Background drawing helpers (use Canvas2D API directly)

/** Draw a single tile from a sprite sheet image onto the canvas. */
function drawTile(
  ctx: CanvasRenderingContext2D,
  image: ImageSource,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
): void {
  ctx.drawImage(image.image, sx, sy, TILE_SIZE, TILE_SIZE, dx, dy, TILE_SIZE, TILE_SIZE);
}

/** Fill all room areas with cream floor tiles. */
function drawFloors(ctx: CanvasRenderingContext2D, floorImage: ImageSource): void {
  const cols = CANVAS_WIDTH_PX / TILE_SIZE;
  const rows = CANVAS_HEIGHT_PX / TILE_SIZE;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      drawTile(ctx, floorImage, FLOOR_TILE_SX, FLOOR_TILE_SY, c * TILE_SIZE, r * TILE_SIZE);
    }
  }
}

/** Draw the gray transition strip at row 12 across the full width. */
function drawTransitionStrip(ctx: CanvasRenderingContext2D, floorImage: ImageSource): void {
  const cols = CANVAS_WIDTH_PX / TILE_SIZE;
  for (let c = 0; c < cols; c++) {
    drawTile(ctx, floorImage, GRAY_TILE_SX, GRAY_TILE_SY, c * TILE_SIZE, 12 * TILE_SIZE);
  }
}

/** Draw north walls (upper + baseboard) for prep, workshop, and governor zones. */
function drawNorthWalls(ctx: CanvasRenderingContext2D, wallImage: ImageSource): void {
  // Prep and workshop north walls at rows 0-1
  const prepStart = PREP_ZONE.bounds.col;
  const workshopEnd = WORKSHOP_ZONE.bounds.col + WORKSHOP_ZONE.bounds.width;

  for (let c = prepStart; c < workshopEnd; c++) {
    // Skip zone boundary wall column (drawn separately as solid fill)
    if (c === 12) continue;
    drawTile(ctx, wallImage, WALL_UPPER_SX, WALL_UPPER_SY, c * TILE_SIZE, 0);
    drawTile(ctx, wallImage, WALL_BASE_SX, WALL_BASE_SY, c * TILE_SIZE, TILE_SIZE);
  }

  // Governor's office north wall at rows 13-14
  const govStart = GOVERNOR_ZONE.bounds.col;
  const govEnd = govStart + GOVERNOR_ZONE.bounds.width;
  const govDoorCols = new Set<number>();
  for (const door of GOVERNOR_ZONE.doors) {
    for (let d = -1; d <= 1; d++) {
      govDoorCols.add(door.tile.col + d);
    }
  }

  for (let c = govStart; c < govEnd; c++) {
    if (govDoorCols.has(c)) continue;
    drawTile(ctx, wallImage, WALL_UPPER_SX, WALL_UPPER_SY, c * TILE_SIZE, 13 * TILE_SIZE);
    drawTile(ctx, wallImage, WALL_BASE_SX, WALL_BASE_SY, c * TILE_SIZE, 14 * TILE_SIZE);
  }
}

/** Draw floor shadow tiles below each north wall. */
function drawFloorShadows(ctx: CanvasRenderingContext2D, shadowImage: ImageSource): void {
  // Shadow at row 2 for prep/workshop walls
  const prepStart = PREP_ZONE.bounds.col;
  const workshopEnd = WORKSHOP_ZONE.bounds.col + WORKSHOP_ZONE.bounds.width;
  for (let c = prepStart; c < workshopEnd; c++) {
    drawTile(ctx, shadowImage, SHADOW_SX, SHADOW_SY, c * TILE_SIZE, 2 * TILE_SIZE);
  }

  // Shadow at row 15 for governor wall
  const govStart = GOVERNOR_ZONE.bounds.col;
  const govEnd = govStart + GOVERNOR_ZONE.bounds.width;
  for (let c = govStart; c < govEnd; c++) {
    drawTile(ctx, shadowImage, SHADOW_SX, SHADOW_SY, c * TILE_SIZE, 15 * TILE_SIZE);
  }
}

/** Draw solid-fill side walls along the left and right borders. */
function drawSideWalls(ctx: CanvasRenderingContext2D): void {
  const rows = CANVAS_HEIGHT_PX / TILE_SIZE;
  ctx.fillStyle = SIDE_WALL_COLOR;

  // Left wall (column 0)
  ctx.fillRect(0, 0, TILE_SIZE, rows * TILE_SIZE);

  // Right wall (last column) - only for rows covered by zones
  const rightCol = CANVAS_WIDTH_PX - TILE_SIZE;
  ctx.fillRect(rightCol, 0, TILE_SIZE, 12 * TILE_SIZE);
  ctx.fillRect(rightCol, 13 * TILE_SIZE, TILE_SIZE, 9 * TILE_SIZE);
}

/** Draw the vertical wall strip between the prep and workshop zones. */
function drawZoneBoundaryWall(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = SIDE_WALL_COLOR;
  ctx.fillRect(12 * TILE_SIZE, 0, TILE_SIZE, 12 * TILE_SIZE);
}

// endregion | Background drawing helpers (use Canvas2D API directly)
