import {
  ACCENT_BAR_H,
  AGENT_SPACING,
  CHUTE_PLATFORM_OFFSET,
  CHUTE_RAIL_OFFSET,
  CODER_X,
  ENGINE_HEIGHT,
  HOLISTIC_X,
  LAYOUT_MARGIN,
  LOWER_LEFT_MARGIN,
  LOWER_PLATFORM_Y,
  PLATFORM_WIDTH,
  RAIL_OVERSHOOT,
  RAIL_Y,
  REVIEWER_SPACING,
  SIMPLIFIER_X,
  SPRITE_SIZE,
  STATION_ZONE,
  SUBAGENT_SPRITE_BOTTOM_PADDING_PX,
  SUMMARY_X,
  UPPER_LEFT_MARGIN,
  UPPER_PLATFORM_Y,
  UPPER_STATION_GAP,
} from '../constants/dimensions.js';
import type { Zone } from '../types.js';

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

export interface FactoryFloorLayoutResult {
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
  bounds: Bounds;
  platformWidth: number;
}

/** Returns the X coordinate for a given station index. */
function stationXForIndex(stationIndex: number, reviewerCount: number): number {
  switch (stationIndex) {
    case 0:
      return UPPER_LEFT_MARGIN;
    case 1:
      return UPPER_LEFT_MARGIN + UPPER_STATION_GAP;
    case 2:
      return CODER_X;
    case 3: {
      // Reviewers: centered around the first reviewer position
      // Each reviewer slot is at LOWER_LEFT_MARGIN + i * REVIEWER_SPACING
      const effectiveCount = Math.max(reviewerCount, 1);
      const totalWidth = (effectiveCount - 1) * REVIEWER_SPACING;
      return LOWER_LEFT_MARGIN + totalWidth / 2;
    }
    case 4:
      return SIMPLIFIER_X;
    case 5:
      return HOLISTIC_X;
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

  const pw = PLATFORM_WIDTH;

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
      x: stationXForIndex(index, reviewerCount),
      y: platformYForZone(zone),
    };
  }

  function agentPosition(stationIndex: number, slotIndex: number, agentCount: number): Position {
    const zone = zoneOf(stationIndex);
    const y = platformYForZone(zone);

    if (stationIndex === 3) {
      // Reviewers use adaptive left-anchored spacing
      return {
        x: LOWER_LEFT_MARGIN + slotIndex * REVIEWER_SPACING,
        y,
      };
    }

    // Non-reviewer stations: center agents around the station X
    const cx = stationXForIndex(stationIndex, reviewerCount);
    const effectiveCount = Math.max(agentCount, 1);
    const totalWidth = (effectiveCount - 1) * AGENT_SPACING;
    return {
      x: cx - totalWidth / 2 + slotIndex * AGENT_SPACING,
      y,
    };
  }

  function orchestratorPosition(stationIndex: number): Position {
    return {
      x: stationXForIndex(stationIndex, reviewerCount),
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
    const midY = (UPPER_PLATFORM_Y + RAIL_Y) / 2;
    return {
      x1: LAYOUT_MARGIN - RAIL_OVERSHOOT,
      x2: pw - LAYOUT_MARGIN + RAIL_OVERSHOOT,
      y: midY,
    };
  }

  function lowerBoundaryEndpoints(): LineEndpoints {
    const midY = (RAIL_Y + LOWER_PLATFORM_Y) / 2;
    return {
      x1: LAYOUT_MARGIN - RAIL_OVERSHOOT,
      x2: pw - LAYOUT_MARGIN + RAIL_OVERSHOOT,
      y: midY,
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
    bounds,
    platformWidth: pw,
  };
}
