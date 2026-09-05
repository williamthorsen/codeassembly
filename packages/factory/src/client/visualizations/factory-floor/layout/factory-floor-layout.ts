import {
  ACCENT_BAR_H,
  AGENT_SPACING,
  BOUNDARY_GAP,
  CHUTE_PLATFORM_OFFSET,
  CHUTE_RAIL_OFFSET,
  CODER_ROOM_LEFT,
  CODER_ROOM_RIGHT,
  CODER_X,
  ENGINE_HEIGHT,
  LAYOUT_MARGIN,
  LOWER_AGENT_SPACING,
  LOWER_LEFT_MARGIN,
  LOWER_PLATFORM_Y,
  LOWER_RIGHT_MARGIN,
  ORCH_ROOM_LEFT,
  ORCH_ROOM_RIGHT,
  PLATFORM_WIDTH,
  RAIL_OVERSHOOT,
  RAIL_Y,
  SPRITE_SIZE,
  STATION_ZONE,
  SUBAGENT_SPRITE_BOTTOM_PADDING_PX,
  SUMMARY_X,
  UPPER_LEFT_MARGIN,
  UPPER_PLATFORM_Y,
  UPPER_STATION_GAP,
} from '../constants/dimensions.ts';
import type { Zone } from '../types.ts';

export interface StationLayoutEntry {
  agentCount: number;
  absent?: boolean | undefined;
}

export interface FactoryFloorLayoutConfig {
  stations: readonly StationLayoutEntry[];
}

export interface Position {
  x: number;
  y: number;
}

export interface ChuteEndpoints {
  topX: number;
  topY: number;
  botX: number;
  botY: number;
}

export interface LineEndpoints {
  x1: number;
  x2: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface RoomBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FactoryFloorLayoutResult {
  bounds: Bounds;
  platformWidth: number;
  /** Station center position (x, y varies by zone). */
  stationPosition(index: number): Position;
  /** Agent position on the platform. Anchor: bottom-center of the agent visual. */
  agentPosition(stationIndex: number, slotIndex: number, agentCount: number): Position;
  /** Orchestrator position on the rail. Always at RAIL_Y. */
  orchestratorPosition(stationIndex: number): Position;
  /** Chute endpoints connecting a platform agent to the rail. Only for upper/lower zones. */
  chuteEndpoints(stationIndex: number, slotIndex: number, agentCount: number): ChuteEndpoints;
  /** Whether a station has a chute (only upper and lower zones). */
  hasChute(stationIndex: number): boolean;
  /** Zone for a station index. */
  zoneOf(stationIndex: number): Zone;
  /** Rail line endpoints. */
  railEndpoints(): LineEndpoints;
  /** Upper platform zone boundary line. */
  upperBoundaryEndpoints(): LineEndpoints;
  /** Lower platform zone boundary line. */
  lowerBoundaryEndpoints(): LineEndpoints;
  /** Coder room rectangle (between upper and lower boundaries). */
  coderRoomBounds(): RoomBounds;
  /** Orchestrator room rectangle (between upper and lower boundaries). */
  orchestratorRoomBounds(): RoomBounds;
}

/** Height of an agent visual (sprite + accent bar minus bottom padding). */
const AGENT_VISUAL_HEIGHT = SPRITE_SIZE + ACCENT_BAR_H - SUBAGENT_SPRITE_BOTTOM_PADDING_PX;

/** Returns the X coordinate for a given station index. */
function stationXForIndex(stationIndex: number, reviewerCount: number, lowerSpacing: number): number {
  switch (stationIndex) {
    case 0:
      return UPPER_LEFT_MARGIN;
    case 1:
      return UPPER_LEFT_MARGIN + UPPER_STATION_GAP;
    case 2:
      return CODER_X;
    case 3: {
      // Reviewers: centered around the reviewer positions
      const effectiveCount = Math.max(reviewerCount, 1);
      const totalWidth = (effectiveCount - 1) * lowerSpacing;
      return LOWER_LEFT_MARGIN + totalWidth / 2;
    }
    case 4:
      // Simplifier: follows last reviewer
      return LOWER_LEFT_MARGIN + Math.max(reviewerCount, 1) * lowerSpacing;
    case 5:
      // Holistic: follows simplifier
      return LOWER_LEFT_MARGIN + (Math.max(reviewerCount, 1) + 1) * lowerSpacing;
    case 6:
      return SUMMARY_X;
    default:
      throw new RangeError(`Station index ${stationIndex} is out of range [0, 6]`);
  }
}

/** Returns the Y coordinate of the platform for a given zone. */
function platformYForZone(zone: Zone): number {
  switch (zone) {
    case 'upper':
      return UPPER_PLATFORM_Y;
    case 'rail':
      return RAIL_Y;
    case 'lower':
      return LOWER_PLATFORM_Y;
    default: {
      const _exhaustive: never = zone;
      return _exhaustive;
    }
  }
}

/**
 * Compute all spatial positions for a factory-floor visualization.
 * The result is deterministic and has no rendering dependencies.
 */
export function computeFactoryFloorLayout(config: FactoryFloorLayoutConfig): FactoryFloorLayoutResult {
  const { stations } = config;

  if (stations.length === 0) {
    throw new RangeError('At least one station is required');
  }

  // Determine reviewer count from station index 3
  const reviewerEntry = stations[3];
  const reviewerCount = reviewerEntry === undefined ? 1 : Math.max(reviewerEntry.agentCount, 1);

  // Compute adaptive lower-zone spacing: all lower agents (reviewers + simplifier + holistic) flow sequentially
  const availableWidth = CODER_ROOM_LEFT - LOWER_RIGHT_MARGIN - LOWER_LEFT_MARGIN;
  const gapCount = reviewerCount + 2; // reviewers + simplifier + holistic
  const lowerSpacing = Math.min(LOWER_AGENT_SPACING, availableWidth / gapCount);

  const pw = PLATFORM_WIDTH;

  // Boundary positions: upper boundary has a gap below agents; lower boundary aligns with sprite tops
  const upperBoundaryY = UPPER_PLATFORM_Y + BOUNDARY_GAP;
  const lowerBoundaryY = LOWER_PLATFORM_Y - AGENT_VISUAL_HEIGHT;

  function zoneOf(stationIndex: number): Zone {
    const zone = STATION_ZONE[stationIndex];
    if (zone === undefined) {
      throw new RangeError(`Station index ${stationIndex} has no zone assignment`);
    }
    return zone;
  }

  function stationPosition(index: number): Position {
    if (index < 0 || index >= stations.length) {
      throw new RangeError(`Station index ${index} is out of range [0, ${stations.length})`);
    }
    const zone = zoneOf(index);
    return {
      x: stationXForIndex(index, reviewerCount, lowerSpacing),
      y: platformYForZone(zone),
    };
  }

  function agentPosition(stationIndex: number, slotIndex: number, agentCount: number): Position {
    const zone = zoneOf(stationIndex);
    const y = platformYForZone(zone);

    if (stationIndex === 3) {
      // Reviewers use adaptive left-anchored spacing
      return {
        x: LOWER_LEFT_MARGIN + slotIndex * lowerSpacing,
        y,
      };
    }

    // Non-reviewer stations: center agents around the station X
    const cx = stationXForIndex(stationIndex, reviewerCount, lowerSpacing);
    const effectiveCount = Math.max(agentCount, 1);
    const totalWidth = (effectiveCount - 1) * AGENT_SPACING;
    return {
      x: cx - totalWidth / 2 + slotIndex * AGENT_SPACING,
      y,
    };
  }

  function orchestratorPosition(stationIndex: number): Position {
    return {
      x: stationXForIndex(stationIndex, reviewerCount, lowerSpacing),
      y: RAIL_Y,
    };
  }

  function hasChute(stationIndex: number): boolean {
    const zone = zoneOf(stationIndex);
    return zone === 'upper' || zone === 'lower';
  }

  function chuteEndpoints(stationIndex: number, slotIndex: number, agentCount: number): ChuteEndpoints {
    const agentPos = agentPosition(stationIndex, slotIndex, agentCount);
    const zone = zoneOf(stationIndex);

    if (zone === 'upper') {
      // Chute runs from rail upward to agent
      return {
        topX: agentPos.x,
        topY: UPPER_PLATFORM_Y - ACCENT_BAR_H - SPRITE_SIZE + SUBAGENT_SPRITE_BOTTOM_PADDING_PX + CHUTE_PLATFORM_OFFSET,
        botX: agentPos.x,
        botY: RAIL_Y - CHUTE_RAIL_OFFSET,
      };
    }

    if (zone === 'lower') {
      // Chute runs from rail downward to agent
      return {
        topX: agentPos.x,
        topY: RAIL_Y + CHUTE_RAIL_OFFSET,
        botX: agentPos.x,
        botY: LOWER_PLATFORM_Y - ACCENT_BAR_H - SPRITE_SIZE + SUBAGENT_SPRITE_BOTTOM_PADDING_PX - CHUTE_PLATFORM_OFFSET,
      };
    }

    // Rail-level stations should not have chutes
    throw new Error(`Station ${stationIndex} is at rail level and has no chute`);
  }

  function railEndpoints(): LineEndpoints {
    return {
      x1: LAYOUT_MARGIN - RAIL_OVERSHOOT,
      x2: pw - LAYOUT_MARGIN + RAIL_OVERSHOOT,
      y: RAIL_Y,
    };
  }

  function upperBoundaryEndpoints(): LineEndpoints {
    return {
      x1: LAYOUT_MARGIN - RAIL_OVERSHOOT,
      x2: pw - LAYOUT_MARGIN + RAIL_OVERSHOOT,
      y: upperBoundaryY,
    };
  }

  function lowerBoundaryEndpoints(): LineEndpoints {
    return {
      x1: LAYOUT_MARGIN - RAIL_OVERSHOOT,
      x2: pw - LAYOUT_MARGIN + RAIL_OVERSHOOT,
      y: lowerBoundaryY,
    };
  }

  function coderRoomBounds(): RoomBounds {
    return {
      left: CODER_ROOM_LEFT,
      right: CODER_ROOM_RIGHT,
      top: upperBoundaryY,
      bottom: lowerBoundaryY,
    };
  }

  function orchestratorRoomBounds(): RoomBounds {
    return {
      left: ORCH_ROOM_LEFT,
      right: ORCH_ROOM_RIGHT,
      top: upperBoundaryY,
      bottom: lowerBoundaryY,
    };
  }

  const bounds: Bounds = {
    minX: 0,
    maxX: pw,
    minY: 0,
    maxY: ENGINE_HEIGHT,
  };

  return {
    stationPosition,
    agentPosition,
    orchestratorPosition,
    chuteEndpoints,
    hasChute,
    zoneOf,
    railEndpoints,
    upperBoundaryEndpoints,
    lowerBoundaryEndpoints,
    coderRoomBounds,
    orchestratorRoomBounds,
    bounds,
    platformWidth: pw,
  };
}
