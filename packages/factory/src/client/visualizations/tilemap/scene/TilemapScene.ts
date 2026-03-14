import { Actor, BaseAlign, Color, Font, Rectangle, Scene, Text, TextAlign, vec } from 'excalibur';

import {
  ENGINE_HEIGHT,
  ENGINE_WIDTH,
  FACILITY_ROOMS,
  FLOOR_COLOR,
  LABEL_COLOR,
  type RoomDef,
  TILE_SIZE,
  WALL_COLOR,
} from '../constants/dimensions.js';

const WALL_THICKNESS = 2;
const FURNITURE_COLOR = '#666688';
const DESK_WIDTH = 2; // tiles
const DESK_HEIGHT = 1; // tiles
const MONITOR_COLOR = '#88aacc';
const MONITOR_SIZE = 6; // pixels

/**
 * Static tilemap scene that renders a furnished office facility using colored rectangles
 * as placeholders for tile layers. This provides the infrastructure scaffold for the
 * tilemap visualization while actual tileset integration is deferred to a later phase.
 */
export class TilemapScene extends Scene {
  constructor() {
    super();
    this.backgroundColor = Color.fromHex(FLOOR_COLOR);
  }

  override onInitialize(): void {
    this.buildFacility();
    this.positionCamera();
  }

  /** Render the full placeholder facility: rooms, walls, furniture, labels. */
  private buildFacility(): void {
    for (const room of FACILITY_ROOMS) {
      this.addRoom(room);
      this.addRoomLabel(room);
    }

    // Add placeholder furniture to non-corridor rooms
    for (const room of FACILITY_ROOMS) {
      if (room.id !== 'corridor') {
        this.addFurniture(room);
      }
    }
  }

  /** Draw a filled rectangle for a room and an outline for its walls. */
  private addRoom(room: RoomDef): void {
    const x = room.tileX * TILE_SIZE;
    const y = room.tileY * TILE_SIZE;
    const w = room.tileW * TILE_SIZE;
    const h = room.tileH * TILE_SIZE;

    // Room floor fill
    const floor = new Actor({ pos: vec(x + w / 2, y + h / 2) });
    floor.graphics.use(
      new Rectangle({
        width: w,
        height: h,
        color: Color.fromHex(room.color),
      }),
    );
    this.add(floor);

    // Wall outlines (four edges)
    this.addWallSegment(x, y, w, WALL_THICKNESS); // top
    this.addWallSegment(x, y + h - WALL_THICKNESS, w, WALL_THICKNESS); // bottom
    this.addWallSegment(x, y, WALL_THICKNESS, h); // left
    this.addWallSegment(x + w - WALL_THICKNESS, y, WALL_THICKNESS, h); // right
  }

  /** Draw a thin wall segment at the given pixel position and size. */
  private addWallSegment(x: number, y: number, w: number, h: number): void {
    const wall = new Actor({ pos: vec(x + w / 2, y + h / 2) });
    wall.graphics.use(
      new Rectangle({
        width: w,
        height: h,
        color: Color.fromHex(WALL_COLOR),
      }),
    );
    wall.z = 1;
    this.add(wall);
  }

  /** Add a centered text label inside a room. */
  private addRoomLabel(room: RoomDef): void {
    const centerX = (room.tileX + room.tileW / 2) * TILE_SIZE;
    const centerY = (room.tileY + room.tileH / 2) * TILE_SIZE;

    const labelActor = new Actor({ pos: vec(centerX, centerY) });
    const text = new Text({
      text: room.label,
      font: new Font({
        family: 'monospace',
        size: 11,
        bold: true,
        color: Color.fromHex(LABEL_COLOR),
        textAlign: TextAlign.Center,
        baseAlign: BaseAlign.Middle,
      }),
    });
    labelActor.graphics.use(text);
    labelActor.z = 3;
    this.add(labelActor);
  }

  /** Add placeholder furniture (desks and monitors) inside a room. */
  private addFurniture(room: RoomDef): void {
    const roomPixelX = room.tileX * TILE_SIZE;
    const roomPixelY = room.tileY * TILE_SIZE;
    const roomPixelW = room.tileW * TILE_SIZE;
    const roomPixelH = room.tileH * TILE_SIZE;

    // Place desks based on room type
    const deskPositions = this.computeDeskPositions(room);

    for (const deskPos of deskPositions) {
      const deskW = DESK_WIDTH * TILE_SIZE;
      const deskH = DESK_HEIGHT * TILE_SIZE;
      const dx = roomPixelX + deskPos.offsetX;
      const dy = roomPixelY + deskPos.offsetY;

      // Desk rectangle
      const desk = new Actor({ pos: vec(dx + deskW / 2, dy + deskH / 2) });
      desk.graphics.use(
        new Rectangle({
          width: deskW,
          height: deskH,
          color: Color.fromHex(FURNITURE_COLOR),
        }),
      );
      desk.z = 2;
      this.add(desk);

      // Small monitor on top of desk
      const monitor = new Actor({ pos: vec(dx + deskW / 2, dy + deskH / 2 - 4) });
      monitor.graphics.use(
        new Rectangle({
          width: MONITOR_SIZE * 2,
          height: MONITOR_SIZE,
          color: Color.fromHex(MONITOR_COLOR),
        }),
      );
      monitor.z = 2;
      this.add(monitor);
    }

    // Add a subtle room interior highlight along the bottom edge
    const highlightY = roomPixelY + roomPixelH - TILE_SIZE * 0.75;
    const highlight = new Actor({ pos: vec(roomPixelX + roomPixelW / 2, highlightY) });
    highlight.graphics.use(
      new Rectangle({
        width: roomPixelW - TILE_SIZE,
        height: 1,
        color: Color.fromHex('#444466'),
      }),
    );
    highlight.z = 1;
    this.add(highlight);
  }

  /** Compute desk offset positions within a room based on its ID. */
  private computeDeskPositions(room: RoomDef): Array<{ offsetX: number; offsetY: number }> {
    const innerPad = TILE_SIZE;
    const deskW = DESK_WIDTH * TILE_SIZE;
    const roomPixelW = room.tileW * TILE_SIZE;

    switch (room.id) {
      case 'control':
        // Single desk centered
        return [{ offsetX: (roomPixelW - deskW) / 2, offsetY: innerPad }];

      case 'analysis':
        // Two desks side by side
        return [
          { offsetX: innerPad, offsetY: innerPad },
          { offsetX: roomPixelW - innerPad - deskW, offsetY: innerPad },
        ];

      case 'workshop':
        // Single desk centered
        return [{ offsetX: (roomPixelW - deskW) / 2, offsetY: innerPad }];

      case 'review-bay':
        // Three desks in a row
        return [
          { offsetX: innerPad, offsetY: innerPad },
          { offsetX: innerPad + deskW + TILE_SIZE / 2, offsetY: innerPad },
          { offsetX: innerPad + 2 * (deskW + TILE_SIZE / 2), offsetY: innerPad },
        ];

      case 'commons':
        // Two desks centered
        return [
          { offsetX: innerPad, offsetY: innerPad },
          { offsetX: roomPixelW - innerPad - deskW, offsetY: innerPad },
        ];

      default:
        return [];
    }
  }

  /** Center the camera on the facility. */
  private positionCamera(): void {
    this.camera.pos = vec(ENGINE_WIDTH / 2, ENGINE_HEIGHT / 2);
    this.camera.zoom = 1;
  }
}
