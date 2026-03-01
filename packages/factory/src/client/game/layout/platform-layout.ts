export interface LayoutConfig {
  stationSpacing: number;
  startX: number;
  baseY: number;
  agentsPerRow: number;
  agentHSpacing: number;
  agentVSpacing: number;
  levelHeight: number;
  platformWidth: number;
  platformHeight: number;
  artifactSize: { width: number; height: number };
  artifactGap: number;
  artifactOffsetX: number;
  artifactOffsetY: number;
  /**
   * Gap in pixels between an approaching agent and the nearest resident
   * agent at the target station. Smaller values bring the approaching agent
   * closer. The original gap was 36 px (one full agentHSpacing); the default
   * of 20 px places the approaching agent approximately 60 % closer.
   */
  approachGap: number;
}

export interface PlatformSegment {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LadderSegment {
  x: number;
  bottomY: number;
  topY: number;
}

export interface LayoutBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface LayoutResult {
  platforms: PlatformSegment[];
  ladders: LadderSegment[];
  stationPositions: Array<{ x: number; y: number }>;
  gatePositions: Array<{ x: number; y: number }>;
  agentPosition(
    stationIndex: number,
    stackOffset: number,
    level: number,
    approaching?: boolean,
  ): { x: number; y: number };
  artifactPosition(stationIndex: number, indexAtStation: number): { x: number; y: number };
  artifactSize: { width: number; height: number };
  bounds: LayoutBounds;
}

const STATION_COUNT = 7;
export const REVIEW_STATION_INDEX = 3;

const DEFAULT_CONFIG: LayoutConfig = {
  stationSpacing: 150,
  startX: 200,
  baseY: 400,
  agentsPerRow: 3,
  agentHSpacing: 36,
  agentVSpacing: 38,
  levelHeight: 56,
  platformWidth: 1100,
  platformHeight: 20,
  artifactSize: { width: 12, height: 12 },
  artifactGap: 4,
  artifactOffsetX: 20,
  artifactOffsetY: -60,
  approachGap: 20,
};

/**
 * Compute all scene geometry from the number of reviewers.
 *
 * Produces platform segments, ladder segments, station/gate positions,
 * and agent position functions. The result is fully deterministic and has
 * no Excalibur dependencies.
 */
export function computeLayout(reviewerCount: number, config?: Partial<LayoutConfig>): LayoutResult {
  const c = { ...DEFAULT_CONFIG, ...config };

  // Main platform (level 0)
  const mainPlatformCenterX = c.startX + ((STATION_COUNT - 1) * c.stationSpacing) / 2;
  const platforms: PlatformSegment[] = [
    {
      x: mainPlatformCenterX,
      y: c.baseY,
      width: c.platformWidth,
      height: c.platformHeight,
    },
  ];

  // Upper platforms (levels 1+): one per additional reviewer beyond the first
  const upperLevelCount = Math.max(0, reviewerCount - 1);
  const reviewStationX = c.startX + REVIEW_STATION_INDEX * c.stationSpacing;
  const upperPlatformWidth = 100;

  for (let level = 1; level <= upperLevelCount; level++) {
    platforms.push({
      x: reviewStationX,
      y: c.baseY - level * c.levelHeight,
      width: upperPlatformWidth,
      height: c.platformHeight,
    });
  }

  // Ladders: one per upper level, connecting adjacent floors above the review area
  const ladders: LadderSegment[] = [];
  for (let level = 1; level <= upperLevelCount; level++) {
    ladders.push({
      x: reviewStationX - upperPlatformWidth / 2 - 16,
      bottomY: c.baseY - (level - 1) * c.levelHeight - c.platformHeight / 2,
      topY: c.baseY - level * c.levelHeight - c.platformHeight / 2,
    });
  }

  // Station positions (all on level 0)
  const stationPositions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < STATION_COUNT; i++) {
    stationPositions.push({
      x: c.startX + i * c.stationSpacing,
      y: c.baseY - c.platformHeight / 2 - 20,
    });
  }

  // Gate positions (between adjacent level-0 stations)
  const gatePositions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < STATION_COUNT - 1; i++) {
    gatePositions.push({
      x: c.startX + (i + 0.5) * c.stationSpacing,
      y: c.baseY - c.platformHeight / 2 - 20,
    });
  }

  /**
   * Compute the screen position for an agent based on station, offset, and level.
   * @param approaching When true, the agent is approaching (not a resident at) the station.
   *   The `stackOffset` parameter is ignored when `approaching` is true.
   */
  function agentPosition(
    stationIndex: number,
    stackOffset: number,
    level: number,
    approaching?: boolean,
  ): { x: number; y: number } {
    const stationX = c.startX + stationIndex * c.stationSpacing;
    // Place agent feet near platform surface: half-platform + half-sprite - padding compensation
    const standOffset = c.platformHeight / 2 + 12;

    if (approaching) {
      if (level === 0) {
        const leftmostSlotOffset = -((c.agentsPerRow - 1) / 2) * c.agentHSpacing;
        return {
          x: stationX + leftmostSlotOffset - c.approachGap,
          y: c.baseY - standOffset,
        };
      }
      return {
        x: stationX - c.approachGap,
        y: c.baseY - level * c.levelHeight - standOffset,
      };
    }

    if (level === 0) {
      const col = stackOffset % c.agentsPerRow;
      const row = Math.floor(stackOffset / c.agentsPerRow);
      const xOffset = (col - (c.agentsPerRow - 1) / 2) * c.agentHSpacing;
      return {
        x: stationX + xOffset,
        y: c.baseY - standOffset - row * c.agentVSpacing,
      };
    }

    // Upper levels: center agent on the upper platform
    return {
      x: stationX,
      y: c.baseY - level * c.levelHeight - standOffset,
    };
  }

  /** Compute the artifact position for a given station and index within that station. */
  function artifactPosition(stationIndex: number, indexAtStation: number): { x: number; y: number } {
    return {
      x:
        c.startX +
        stationIndex * c.stationSpacing +
        c.artifactOffsetX +
        indexAtStation * (c.artifactSize.width + c.artifactGap),
      y: c.baseY + c.artifactOffsetY,
    };
  }

  // Camera bounds
  const stationHalfWidth = 50;
  const margin = 40;
  const minX = c.startX - stationHalfWidth - margin;
  const maxX = c.startX + (STATION_COUNT - 1) * c.stationSpacing + stationHalfWidth + margin;
  const maxY = c.baseY + c.platformHeight + margin;

  // Top bound: account for agent positions on the highest level
  const standOffset = c.platformHeight / 2 + 12;
  const highestAgentY = c.baseY - upperLevelCount * c.levelHeight - standOffset;
  const minY = highestAgentY - c.agentVSpacing - margin;

  return {
    platforms,
    ladders,
    stationPositions,
    gatePositions,
    agentPosition,
    artifactPosition,
    artifactSize: c.artifactSize,
    bounds: { minX, maxX, minY, maxY },
  };
}
