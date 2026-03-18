import { TILE_SIZE } from '../constants/dimensions.js';
import { ZONE_DEFINITIONS } from '../constants/zone-definitions.js';
import type { FacilityLayout, Position, SlotDefinition, SlotType, TileCoord, ZoneDefinition } from '../types.js';

/** Convert a tile coordinate to pixel-space center position. */
function tileToPixel(tile: TileCoord): Position {
  return {
    x: tile.col * TILE_SIZE + TILE_SIZE / 2,
    y: tile.row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Compute the pixel-space center of a zone's bounding rectangle. */
function computeZoneCenter(zone: ZoneDefinition): Position {
  return {
    x: (zone.bounds.col + zone.bounds.width / 2) * TILE_SIZE,
    y: (zone.bounds.row + zone.bounds.height / 2) * TILE_SIZE,
  };
}

/**
 * Build a corridor waypoint path between two zones by connecting their doorways
 * through the shared corridor junction point.
 */
function buildCorridorPath(from: ZoneDefinition, to: ZoneDefinition): Position[] {
  const fromDoor = from.doors[0];
  const toDoor = to.doors[0];
  if (fromDoor === undefined) {
    throw new Error(`Zone "${from.id}" has no doors; cannot build corridor path`);
  }
  if (toDoor === undefined) {
    throw new Error(`Zone "${to.id}" has no doors; cannot build corridor path`);
  }

  const fromDoorPixel = tileToPixel(fromDoor.tile);
  const toDoorPixel = tileToPixel(toDoor.tile);

  // Build a path through the corridor: exit from door, traverse junction, enter destination door
  // The junction is the midpoint between the two doors in the gap between zones
  const junction: Position = {
    x: (fromDoorPixel.x + toDoorPixel.x) / 2,
    y: (fromDoorPixel.y + toDoorPixel.y) / 2,
  };

  return [fromDoorPixel, junction, toDoorPixel];
}

/**
 * Create the office facility layout query object.
 * Converts tile-space zone and slot definitions into pixel-space positions,
 * defines corridor paths between zones, and provides lookup methods.
 */
export function createOfficeLayout(): FacilityLayout {
  const zones = ZONE_DEFINITIONS;

  // Build slot position lookup
  const slotPositions = new Map<string, Position>();
  for (const zone of zones) {
    for (const slot of zone.slots) {
      slotPositions.set(slot.id, tileToPixel(slot.tile));
    }
  }

  // Build zone center lookup
  const zoneCenters = new Map<string, Position>();
  for (const zone of zones) {
    zoneCenters.set(zone.id, computeZoneCenter(zone));
  }

  // Build slot definition lookup
  const slotById = new Map<string, SlotDefinition>();
  for (const zone of zones) {
    for (const slot of zone.slots) {
      slotById.set(slot.id, slot);
    }
  }

  // Build zone lookup
  const zoneById = new Map<string, ZoneDefinition>();
  for (const zone of zones) {
    zoneById.set(zone.id, zone);
  }

  // Pre-compute corridor paths for all 6 directional pairs
  const corridorPaths = new Map<string, Position[]>();
  for (const from of zones) {
    for (const to of zones) {
      if (from.id === to.id) continue;
      const key = `${from.id}->${to.id}`;
      corridorPaths.set(key, buildCorridorPath(from, to));
    }
  }

  function slotPosition(slotId: string): Position {
    const pos = slotPositions.get(slotId);
    if (pos === undefined) {
      throw new Error(`Unknown slot ID: "${slotId}"`);
    }
    return { ...pos };
  }

  function zoneCenter(zoneId: string): Position {
    const center = zoneCenters.get(zoneId);
    if (center === undefined) {
      throw new Error(`Unknown zone ID: "${zoneId}"`);
    }
    return { ...center };
  }

  function slotsInZone(zoneId: string, type?: SlotType): SlotDefinition[] {
    const zone = zoneById.get(zoneId);
    if (zone === undefined) {
      throw new Error(`Unknown zone ID: "${zoneId}"`);
    }
    if (type === undefined) {
      return [...zone.slots];
    }
    return zone.slots.filter((s) => s.type === type);
  }

  function corridorPath(fromZoneId: string, toZoneId: string): Position[] {
    const key = `${fromZoneId}->${toZoneId}`;
    const path = corridorPaths.get(key);
    if (path === undefined) {
      throw new Error(`No corridor path from "${fromZoneId}" to "${toZoneId}"`);
    }
    return [...path];
  }

  function slotDefinition(slotId: string): SlotDefinition | undefined {
    return slotById.get(slotId);
  }

  return {
    slotPosition,
    zoneCenter,
    slotsInZone,
    corridorPath,
    slotDefinition,
    zones,
  };
}
