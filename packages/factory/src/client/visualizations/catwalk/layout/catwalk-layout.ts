import {
  ACCENT_BAR_H,
  AGENT_RADIUS,
  ART_H,
  ART_W,
  ARTIFACT_TOP_MARGIN,
  ARTIFACT_Y_GAP,
  CANVAS_H,
  CHUTE_BOT_ABOVE_GROUND,
  CHUTE_TOP_BELOW_RAIL,
  DIVIDER_FIXED_DEPTH,
  DIVIDER_LEFT_OF_AGENT,
  GROUND_LINE_Y,
  INPUT_LEFT_OF_DIVIDER,
  LAYOUT_MARGIN,
  RAIL_OVERSHOOT,
  RAIL_Y,
  SPRITE_SIZE,
  STATION_GAP,
  STATION_LABEL_BELOW_GROUND,
  SUBAGENT_SPRITE_BOTTOM_PAD,
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

export interface DividerEndpoints {
  x: number;
  y1: number;
  y2: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CatwalkLayoutResult {
  stationX(index: number): number;
  /** Agent position on the ground line. Anchor: bottom-center of the agent visual (ground line intersection). */
  agentPosition(stationIndex: number, slotIndex: number, agentCount: number): Position;
  /** Orchestrator position on the rail. Anchor: point on the rail where the orchestrator stands. */
  orchestratorPosition(stationIndex: number): Position;
  chuteEndpoints(stationIndex: number, slotIndex: number, agentCount: number): ChuteEndpoints;
  gatePosition(leftStation: number, rightStation: number): Position;
  /** Output artifact position. Anchor: center of the artifact rect, x-aligned to the agent's position. */
  outputArtifactPosition(
    stationIndex: number,
    agentSlotIndex: number,
    agentCount: number,
    stackIndex: number,
  ): Position;
  /** Input artifact position. Anchor: center of the artifact rect, left of the divider. */
  inputArtifactPosition(stationIndex: number, agentCount: number, stackIndex: number): Position;
  /** Divider vertical line between input and output zones. */
  dividerPosition(stationIndex: number, agentCount: number): DividerEndpoints;
  /** Station label position below the ground line. */
  stationLabelPosition(stationIndex: number): Position;
  railEndpoints(): LineEndpoints;
  groundEndpoints(): LineEndpoints;
  bounds: Bounds;
  platformWidth: number;
}

function assertDefined<T>(value: T | undefined, message: string): asserts value is T {
  if (value === undefined) {
    throw new Error(message);
  }
}

const AGENT_SPACING = AGENT_RADIUS * 2 + 20;
const INPUT_OVERHANG = ART_W * 1.5 + 11;
const OUTPUT_OVERHANG = ART_W / 2;
const ABSENT_X = -200;

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

/** Compute symmetric line extents based on the first and last visible station X positions. */
function lineExtents(firstVisibleX: number, lastVisibleX: number): { x1: number; x2: number } {
  return {
    x1: firstVisibleX - RAIL_OVERSHOOT,
    x2: lastVisibleX + RAIL_OVERSHOOT,
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
    const { x1, x2 } = lineExtents(LAYOUT_MARGIN, LAYOUT_MARGIN);
    return buildResult(
      Array.from({ length: stations.length }, () => ABSENT_X),
      pw,
      x1,
      x2,
      stations,
    );
  }

  // Step 2: Compute station positions via layoutStations
  const { positions, platformWidth } = layoutStations(stations, visibleIndices);

  // Step 3: Build station X lookup array
  let stationPositions: number[];

  if (compact === true) {
    stationPositions = Array.from({ length: stations.length }, () => ABSENT_X);
    for (const [k, originalIndex] of visibleIndices.entries()) {
      const pos = positions[k];
      assertDefined(pos, `Position at index ${k} is unexpectedly undefined`);
      stationPositions[originalIndex] = pos;
    }
  } else {
    stationPositions = [...positions];
  }

  // Step 4: Determine rail/ground extent values
  // visibleIndices is guaranteed non-empty here (the empty case was handled above)
  const firstVisibleOriginalIndex = visibleIndices[0];
  assertDefined(firstVisibleOriginalIndex, 'visibleIndices is unexpectedly empty');
  const lastVisibleOriginalIndex = visibleIndices.at(-1);
  assertDefined(lastVisibleOriginalIndex, 'visibleIndices is unexpectedly empty');
  const firstVisibleX = stationPositions[firstVisibleOriginalIndex];
  assertDefined(firstVisibleX, `Station position at index ${firstVisibleOriginalIndex} is unexpectedly undefined`);
  const lastVisibleX = stationPositions[lastVisibleOriginalIndex];
  assertDefined(lastVisibleX, `Station position at index ${lastVisibleOriginalIndex} is unexpectedly undefined`);
  const { x1, x2 } = lineExtents(firstVisibleX, lastVisibleX);

  return buildResult(stationPositions, platformWidth, x1, x2, stations);
}

function buildResult(
  stationPositions: number[],
  platformWidth: number,
  lineX1: number,
  lineX2: number,
  stations: readonly StationLayoutEntry[],
): CatwalkLayoutResult {
  const stationCount = stations.length;

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
    const pos = stationPositions[index];
    assertDefined(pos, `Station position at index ${index} is unexpectedly undefined`);
    return pos;
  }

  /** Agent position on the ground line. Anchor: the point on the ground line (bottom of agent visual). */
  function agentPosition(stationIndex: number, slotIndex: number, agentCount: number): Position {
    const cx = stationX(stationIndex);
    const effectiveCount = Math.max(agentCount, 1);
    const totalWidth = (effectiveCount - 1) * AGENT_SPACING;
    return {
      x: cx - totalWidth / 2 + slotIndex * AGENT_SPACING,
      y: GROUND_LINE_Y,
    };
  }

  /** Orchestrator position on the rail. Anchor: point on the rail. */
  function orchestratorPosition(stationIndex: number): Position {
    return { x: stationX(stationIndex), y: RAIL_Y };
  }

  function chuteEndpoints(stationIndex: number, slotIndex: number, agentCount: number): ChuteEndpoints {
    const agentPos = agentPosition(stationIndex, slotIndex, agentCount);
    return {
      topX: agentPos.x,
      topY: RAIL_Y + CHUTE_TOP_BELOW_RAIL,
      botX: agentPos.x,
      botY: GROUND_LINE_Y - ACCENT_BAR_H - SPRITE_SIZE + SUBAGENT_SPRITE_BOTTOM_PAD - CHUTE_BOT_ABOVE_GROUND,
    };
  }

  function gatePosition(leftStation: number, rightStation: number): Position {
    return {
      x: (stationX(leftStation) + stationX(rightStation)) / 2,
      y: RAIL_Y,
    };
  }

  /** Output artifact center position, x-aligned to the producing agent, stacked below the ground line. */
  function outputArtifactPosition(
    stationIndex: number,
    agentSlotIndex: number,
    agentCount: number,
    stackIndex: number,
  ): Position {
    const agentPos = agentPosition(stationIndex, agentSlotIndex, agentCount);
    const firstY = GROUND_LINE_Y + ARTIFACT_TOP_MARGIN + ART_H / 2;
    return {
      x: agentPos.x,
      y: firstY + stackIndex * (ART_H + ARTIFACT_Y_GAP),
    };
  }

  /** Input artifact center position, to the left of the divider, stacked below the ground line. */
  function inputArtifactPosition(stationIndex: number, agentCount: number, stackIndex: number): Position {
    const divider = dividerPosition(stationIndex, agentCount);
    const firstY = GROUND_LINE_Y + ARTIFACT_TOP_MARGIN + ART_H / 2;
    return {
      x: divider.x - INPUT_LEFT_OF_DIVIDER - ART_W / 2,
      y: firstY + stackIndex * (ART_H + ARTIFACT_Y_GAP),
    };
  }

  /** Vertical divider line between input and output zones. */
  function dividerPosition(stationIndex: number, agentCount: number): DividerEndpoints {
    const leftmostAgent = agentPosition(stationIndex, 0, agentCount);
    return {
      x: leftmostAgent.x - DIVIDER_LEFT_OF_AGENT,
      y1: GROUND_LINE_Y,
      y2: GROUND_LINE_Y + DIVIDER_FIXED_DEPTH,
    };
  }

  /** Station label position below the ground line. */
  function stationLabelPosition(stationIndex: number): Position {
    return {
      x: stationX(stationIndex),
      y: GROUND_LINE_Y + STATION_LABEL_BELOW_GROUND,
    };
  }

  function railEndpoints(): LineEndpoints {
    return { x1: lineX1, x2: lineX2, y: RAIL_Y };
  }

  function groundEndpoints(): LineEndpoints {
    return { x1: lineX1, x2: lineX2, y: GROUND_LINE_Y };
  }

  return {
    stationX,
    agentPosition,
    orchestratorPosition,
    chuteEndpoints,
    gatePosition,
    outputArtifactPosition,
    inputArtifactPosition,
    dividerPosition,
    stationLabelPosition,
    railEndpoints,
    groundEndpoints,
    bounds,
    platformWidth,
  };
}
