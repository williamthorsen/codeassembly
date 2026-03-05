import {
  AGENT_RADIUS,
  ART_W,
  CANVAS_H,
  CATWALK_Y,
  CHUTE_BOT,
  CHUTE_TOP,
  GROUND_Y,
  LAYOUT_MARGIN,
  STATION_GAP,
} from '../constants/dimensions.js';

export interface StationLayoutEntry {
  agentCount: number;
  absent?: boolean | undefined;
}

export interface CatwalkLayoutConfig {
  stations: readonly StationLayoutEntry[];
  compact?: boolean | undefined;
}

export interface Position {
  x: number;
  y: number;
}

export interface LineEndpoints {
  x1: number;
  x2: number;
  y: number;
}

export interface ChuteEndpoints {
  topX: number;
  topY: number;
  botX: number;
  botY: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CatwalkLayoutResult {
  stationX(index: number): number;
  agentPosition(stationIndex: number, slotIndex: number, agentCount: number): Position;
  orchestratorPosition(stationIndex: number): Position;
  chuteEndpoints(stationIndex: number, slotIndex: number, agentCount: number): ChuteEndpoints;
  gatePosition(leftStation: number, rightStation: number): Position;
  railEndpoints(): LineEndpoints;
  groundEndpoints(): LineEndpoints;
  bounds: Bounds;
  platformWidth: number;
}

const AGENT_SPACING = AGENT_RADIUS * 2 + 20;
const INPUT_OVERHANG = ART_W * 1.5 + 11;
const OUTPUT_OVERHANG = ART_W / 2;
const RAIL_OVERSHOOT = 75;
const GROUND_LINE_OFFSET = 42;
const ABSENT_X = -200;
const PLATFORM_RIGHT_INSET = 20;

/**
 * Compute station center X positions and the total platform width for the
 * given subset of station indices. This is a direct port of the prototype's
 * `layoutStations(phaseIndices)` from `demos/catwalk/scenarios.js`.
 */
function layoutStations(
  stations: readonly StationLayoutEntry[],
  indices: readonly number[],
): { positions: number[]; platformWidth: number } {
  const positions: number[] = [];
  let cursor = LAYOUT_MARGIN;

  for (const [k, idx] of indices.entries()) {
    const entry = stations[idx];
    if (entry === undefined) {
      throw new RangeError(`Station index ${idx} is out of range`);
    }
    const agentCount = Math.max(entry.agentCount, 1);
    const agentHalfWidth = ((agentCount - 1) * AGENT_SPACING) / 2;
    const leftExt = agentHalfWidth + INPUT_OVERHANG;
    const rightExt = agentHalfWidth + OUTPUT_OVERHANG;
    const stationX = k === 0 ? cursor + leftExt : Math.round(cursor + STATION_GAP + leftExt);
    positions.push(stationX);
    cursor = stationX + rightExt;
  }

  const platformWidth = cursor + LAYOUT_MARGIN;
  return { positions, platformWidth };
}

function lineExtents(firstVisibleX: number, platformWidth: number): { x1: number; x2: number } {
  return {
    x1: firstVisibleX - RAIL_OVERSHOOT,
    x2: platformWidth - PLATFORM_RIGHT_INSET,
  };
}

/**
 * Compute all spatial positions for a catwalk visualization from the given
 * station/agent configuration. The result is fully deterministic and has
 * no Excalibur (or other rendering) dependencies.
 */
export function computeCatwalkLayout(config: CatwalkLayoutConfig): CatwalkLayoutResult {
  const { stations, compact } = config;

  if (stations.length === 0) {
    throw new RangeError('At least one station is required');
  }

  // Step 1: Resolve visible station indices
  const visibleIndices: number[] = [];
  if (compact === true) {
    for (const [i, station] of stations.entries()) {
      if (station.absent !== true) {
        visibleIndices.push(i);
      }
    }
  } else {
    for (let i = 0; i < stations.length; i++) {
      visibleIndices.push(i);
    }
  }

  // Edge case: all stations absent in compact mode
  if (compact === true && visibleIndices.length === 0) {
    const pw = 2 * LAYOUT_MARGIN;
    const { x1, x2 } = lineExtents(LAYOUT_MARGIN, pw);
    return buildResult(
      Array.from({ length: stations.length }, () => ABSENT_X),
      pw,
      x1,
      x2,
      stations.length,
    );
  }

  // Step 2: Compute station positions via layoutStations
  const { positions, platformWidth } = layoutStations(stations, visibleIndices);

  // Step 3: Build station X lookup array
  let stationPositions: number[];

  if (compact === true) {
    stationPositions = Array.from({ length: stations.length }, () => ABSENT_X);
    for (const [k, originalIndex] of visibleIndices.entries()) {
      // Safe: k is the enumeration index from visibleIndices.entries(), so k < positions.length
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      stationPositions[originalIndex] = positions[k]!;
    }
  } else {
    stationPositions = [...positions];
  }

  // Step 4: Determine rail/ground extent values
  // visibleIndices is guaranteed non-empty here (the empty case was handled above)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const firstVisibleOriginalIndex = visibleIndices[0]!;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const firstVisibleX = stationPositions[firstVisibleOriginalIndex]!;
  const { x1, x2 } = lineExtents(firstVisibleX, platformWidth);

  return buildResult(stationPositions, platformWidth, x1, x2, stations.length);
}

function buildResult(
  stationPositions: number[],
  platformWidth: number,
  lineX1: number,
  lineX2: number,
  stationCount: number,
): CatwalkLayoutResult {
  // Step 5: Compute bounds
  const bounds: Bounds = {
    minX: 0,
    maxX: platformWidth,
    minY: 0,
    maxY: CANVAS_H,
  };

  function stationX(index: number): number {
    if (index < 0 || index >= stationCount) {
      throw new RangeError(`Station index ${index} is out of range [0, ${stationCount})`);
    }
    // Safe: index is in [0, stationCount) and stationPositions has stationCount entries
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return stationPositions[index]!;
  }

  function agentPosition(stationIndex: number, slotIndex: number, agentCount: number): Position {
    const cx = stationX(stationIndex);
    const effectiveCount = Math.max(agentCount, 1);
    const totalWidth = (effectiveCount - 1) * AGENT_SPACING;
    return {
      x: cx - totalWidth / 2 + slotIndex * AGENT_SPACING,
      y: GROUND_Y,
    };
  }

  function orchestratorPosition(stationIndex: number): Position {
    return { x: stationX(stationIndex), y: CATWALK_Y };
  }

  function chuteEndpoints(stationIndex: number, slotIndex: number, agentCount: number): ChuteEndpoints {
    const agentPos = agentPosition(stationIndex, slotIndex, agentCount);
    return {
      topX: agentPos.x,
      topY: CHUTE_TOP,
      botX: agentPos.x,
      botY: CHUTE_BOT,
    };
  }

  function gatePosition(leftStation: number, rightStation: number): Position {
    return {
      x: (stationX(leftStation) + stationX(rightStation)) / 2,
      y: CATWALK_Y,
    };
  }

  function railEndpoints(): LineEndpoints {
    return { x1: lineX1, x2: lineX2, y: CATWALK_Y };
  }

  function groundEndpoints(): LineEndpoints {
    return { x1: lineX1, x2: lineX2, y: GROUND_Y + GROUND_LINE_OFFSET };
  }

  return {
    stationX,
    agentPosition,
    orchestratorPosition,
    chuteEndpoints,
    gatePosition,
    railEndpoints,
    groundEndpoints,
    bounds,
    platformWidth,
  };
}
